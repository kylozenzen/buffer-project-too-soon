'use strict';

// second-opinion.js — optional AI judgment for posts the rules flagged.
// The rules engine runs in the browser for free; only flagged posts come here.
// Provider: the site's own key (ANTHROPIC_API_KEY preferred, or GEMINI_API_KEY) if set,
// otherwise the user's own key sent with the request ({ byok: { provider, key } }), never stored here.
// No key at all → { available: false } and the app just shows rule verdicts.
//
// POST { posts: [{ id, text, dueAt, ruleReasons: [...] }], headlines: [{ title, source }] }
// → { available: true, provider, verdicts: [{ id, verdict: 'too_soon'|'look'|'good', reason, fix }] }

const MAX_POSTS = 12;

function headers() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const SYSTEM = `You are a calm, experienced social media PR lead. For each scheduled post, decide whether publishing it at its scheduled time could look tone-deaf, insensitive, or wrong given today's headlines.
Verdicts:
- "too_soon": a reasonable audience would likely call this out (e.g. jokes or hype next to a death, disaster, or violence it touches; promoting something tied to a fresh tragedy).
- "look": might read awkwardly; a human should glance before it goes out.
- "good": fine to post. Most posts are fine. Do not invent connections; shared words alone are not enough.
Give a one-sentence reason a social manager would understand, and for anything not "good" a short suggested fix (rewrite idea, or "hold 24-48 hours").
Also give "rewrite": the full post rewritten in the same voice and roughly the same length with the risk removed (keep links, handles and the core message). Use "" if the honest advice is to hold the post rather than rewrite it, or if the verdict is "good".
Respond with JSON only: {"verdicts":[{"id":"...","verdict":"...","reason":"...","fix":"...","rewrite":"..."}]}`;

function buildPrompt(posts, headlines) {
  const h = headlines.slice(0, 30).map((x, i) => `${i + 1}. ${x.title}${x.source ? ` (${x.source})` : ''}`).join('\n');
  const p = posts.map(x => `ID: ${x.id}\nScheduled: ${x.dueAt || 'unknown'}\nRule notes: ${(x.ruleReasons || []).join('; ') || 'none'}\nPost: """${String(x.text || '').slice(0, 1200)}"""`).join('\n\n');
  return `Today's headlines and alerts:\n${h || '(none)'}\n\nScheduled posts to judge:\n\n${p}`;
}

function extractJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function askClaude(prompt, key) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `Claude HTTP ${res.status}`);
  return (data.content || []).map(b => b.text || '').join('');
}

async function askGemini(prompt, key) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `Gemini HTTP ${res.status}`);
  return ((data.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  const envProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GEMINI_API_KEY ? 'gemini' : null;
  if (event.httpMethod === 'GET') return { statusCode: 200, headers: headers(), body: JSON.stringify({ available: !!envProvider, provider: envProvider }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  let provider = envProvider;
  let key = envProvider === 'claude' ? process.env.ANTHROPIC_API_KEY : envProvider === 'gemini' ? process.env.GEMINI_API_KEY : '';
  const byok = body.byok || {};
  if (!provider && ['claude', 'gemini'].includes(byok.provider) && typeof byok.key === 'string' && byok.key.trim().length >= 20) {
    provider = byok.provider; key = byok.key.trim();
  }
  if (!provider) return { statusCode: 200, headers: headers(), body: JSON.stringify({ available: false }) };
  const posts = (body.posts || []).slice(0, MAX_POSTS);
  const headlines = body.headlines || [];
  if (!posts.length) return { statusCode: 200, headers: headers(), body: JSON.stringify({ available: true, provider, verdicts: [] }) };

  try {
    const prompt = buildPrompt(posts, headlines);
    const text = provider === 'claude' ? await askClaude(prompt, key) : await askGemini(prompt, key);
    const parsed = extractJson(text) || { verdicts: [] };
    const allowed = new Set(['too_soon', 'look', 'good']);
    const ids = new Set(posts.map(p => String(p.id)));
    const verdicts = (parsed.verdicts || []).filter(v => ids.has(String(v.id)) && allowed.has(v.verdict))
      .map(v => ({ id: String(v.id), verdict: v.verdict, reason: String(v.reason || '').slice(0, 400), fix: String(v.fix || '').slice(0, 300), rewrite: String(v.rewrite || '').slice(0, 3000) }));
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ available: true, provider, verdicts }) };
  } catch (err) {
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ available: true, provider, verdicts: [], error: err.message }) };
  }
};
