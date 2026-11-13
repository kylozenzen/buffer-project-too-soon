'use strict';

// notify.js — forwards a Too Soon? alert to a Slack or Discord incoming webhook.
// Only Slack/Discord webhook URLs are accepted, so this can't be used to hit arbitrary hosts.
// POST { url, text } → { ok }

function headers() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function kindOf(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'hooks.slack.com' && u.pathname.startsWith('/services/')) return 'slack';
  if (['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(u.hostname) && u.pathname.startsWith('/api/webhooks/')) return 'discord';
  return null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers(), body: JSON.stringify({ ok: false, error: 'method_not_allowed' }) };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  const kind = kindOf(body.url);
  const text = String(body.text || '').slice(0, 1900);
  if (!kind) return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'Use a Slack or Discord incoming webhook URL.' }) };
  if (!text) return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'Nothing to send.' }) };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(body.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'slack' ? { text } : { content: text, username: 'Too Soon?' }),
      signal: c.signal,
    });
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: res.ok, status: res.status, kind }) };
  } catch (err) {
    return { statusCode: 200, headers: headers(), body: JSON.stringify({ ok: false, error: err.name === 'AbortError' ? 'timeout' : 'unreachable' }) };
  } finally { clearTimeout(t); }
};
