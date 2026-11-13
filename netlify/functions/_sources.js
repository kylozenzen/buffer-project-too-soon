'use strict';

// _sources.js — extra free, keyless sources for Too Soon?
// Every getter resolves to an array of items and never throws.
// Item shape: { id, kind, title, source, url, publishedAt, severity?, area?, local?, weight? }
//   weight (optional) overrides the client's headline weighting: 'tragedy' | 'controversy' | 'neutral'

const UA = 'TooSoon/0.1 (https://toosoon.netlify.app; contact via site)';

async function get(url, opts = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: c.signal });
    return res.ok ? res : null;
  } catch { return null; } finally { clearTimeout(t); }
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
const tagOf = (chunk, name) => { const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : ''; };
const items = xml => { const out = []; const re = /<item>([\s\S]*?)<\/item>/gi; let m; while ((m = re.exec(xml))) out.push(m[1]); return out; };
const ymd = (d, sep = '') => [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join(sep);

// ---- Wikipedia: most-read articles (yesterday) + Wikidata check for recent deaths ----
// Celebrity news shows up here fast: a death or scandal sends a page to the top of the list.
async function wikipedia(limit = 15) {
  const d = new Date(Date.now() - 24 * 3600e3);
  const res = await get(`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${ymd(d, '/')}`)
    || await get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${ymd(d, '/')}`);
  if (!res) return [];
  let data;
  try { data = await res.json(); } catch { return []; }
  const skip = /^(Main_Page|Special:|Wikipedia:|Portal:|File:|Help:|Deaths_in_)/;
  const arts = ((data.mostread && data.mostread.articles) || []).filter(a => !skip.test(a.title || '')).slice(0, 30);

  // Which of these people died in the last 10 days? One Wikidata call for all of them.
  const ids = arts.map(a => a.wikibase_item).filter(Boolean).slice(0, 50);
  const died = {};
  const kinds = {};
  if (ids.length) {
    const wd = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`);
    if (wd) {
      try {
        const ents = (await wd.json()).entities || {};
        const cutoff = Date.now() - 10 * 24 * 3600e3;
        for (const [id, e] of Object.entries(ents)) {
          // "instance of: human" (Q5). Films, ships and TV seasons also top the list; they aren't people.
          const p31 = ((e.claims && e.claims.P31) || []).map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id);
          if (p31.length) kinds[id] = p31.includes('Q5') ? 'human' : 'other';
          const t = e.claims && e.claims.P570 && e.claims.P570[0] && e.claims.P570[0].mainsnak && e.claims.P570[0].mainsnak.datavalue && e.claims.P570[0].mainsnak.datavalue.value && e.claims.P570[0].mainsnak.datavalue.value.time;
          const when = t ? Date.parse(t.replace(/^\+/, '')) : NaN;
          if (when && when >= cutoff) died[id] = new Date(when).toISOString();
        }
      } catch {}
    }
  }

  return arts.filter(a => kinds[a.wikibase_item] !== 'other').slice(0, limit).map((a, i) => {
    const name = (a.titles && a.titles.normalized) || String(a.title || '').replace(/_/g, ' ');
    const desc = a.description ? ` (${a.description})` : '';
    const dead = died[a.wikibase_item];
    return {
      id: `wiki-${i}`,
      kind: 'people',
      title: dead ? `${name}${desc} has died` : `${name}${desc} is trending on Wikipedia`,
      source: dead ? 'Wikipedia + Wikidata' : `Wikipedia most-read · ${Number(a.views || 0).toLocaleString('en-US')} views`,
      url: (a.content_urls && a.content_urls.desktop && a.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title || '')}`,
      publishedAt: dead || null,
      weight: dead ? 'tragedy' : undefined,
      name,
    };
  });
}

// ---- Google Trends daily trending searches (RSS) ----
// Each trend carries a news headline, so "why is this trending?" is answered for you.
async function googleTrends(geo = 'US', limit = 15) {
  const res = await get(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`);
  if (!res) return [];
  const xml = await res.text();
  return items(xml).slice(0, limit).map((it, i) => {
    const q = tagOf(it, 'title');
    const newsTitle = tagOf(it, 'ht:news_item_title');
    const newsUrl = tagOf(it, 'ht:news_item_url');
    const traffic = tagOf(it, 'ht:approx_traffic');
    return {
      id: `trend-${i}`,
      kind: 'trend',
      title: newsTitle ? `“${q}” is trending: ${newsTitle}` : `“${q}” is trending`,
      source: `Google Trends${traffic ? ` · ${traffic} searches` : ''}`,
      url: newsUrl || `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(q)}`,
      publishedAt: tagOf(it, 'pubDate') ? new Date(tagOf(it, 'pubDate')).toISOString() : null,
      name: q,
    };
  }).filter(x => x.name);
}

// ---- USGS: significant earthquakes, past day ----
async function earthquakes(limit = 5) {
  const res = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson');
  if (!res) return [];
  try {
    const data = await res.json();
    return (data.features || []).slice(0, limit).map((f, i) => {
      const p = f.properties || {};
      return {
        id: `quake-${p.code || i}`,
        kind: 'alert',
        title: `Earthquake: M${Number(p.mag || 0).toFixed(1)} ${p.place || ''}`.trim(),
        area: p.place || '',
        source: 'USGS',
        url: p.url || 'https://earthquake.usgs.gov/earthquakes/map/',
        publishedAt: p.time ? new Date(p.time).toISOString() : null,
        severity: Number(p.mag) >= 6 ? 'Extreme' : 'Severe',
        weight: 'tragedy',
      };
    });
  } catch { return []; }
}

// ---- GDACS: global disaster alerts (orange + red only) ----
async function gdacs(limit = 6) {
  const res = await get('https://www.gdacs.org/xml/rss.xml');
  if (!res) return [];
  const xml = await res.text();
  return items(xml).map((it, i) => {
    const level = tagOf(it, 'gdacs:alertlevel');
    if (!/orange|red/i.test(level)) return null;
    // Droughts run for months and span dozens of countries ("…Mexico, United States"), which
    // would flag every post that names a country. Keep sudden events from the last 10 days.
    const type = tagOf(it, 'gdacs:eventtype') || (tagOf(it, 'link').match(/eventtype=(\w+)/i) || [])[1] || '';
    if (/^DR$/i.test(type) || /^drought/i.test(tagOf(it, 'title'))) return null;
    const pub = Date.parse(tagOf(it, 'pubDate') || tagOf(it, 'gdacs:fromdate') || '');
    if (pub && Date.now() - pub > 10 * 24 * 3600e3) return null;
    const country = tagOf(it, 'gdacs:country');
    return {
      id: `gdacs-${i}`,
      kind: 'alert',
      title: tagOf(it, 'title'),
      area: country,
      source: `GDACS · ${level} alert`,
      url: tagOf(it, 'link') || 'https://www.gdacs.org',
      publishedAt: tagOf(it, 'pubDate') ? new Date(tagOf(it, 'pubDate')).toISOString() : null,
      severity: /red/i.test(level) ? 'Extreme' : 'Severe',
      weight: 'tragedy',
    };
  }).filter(Boolean).slice(0, limit);
}

// ---- Recalls: FDA food (openFDA) + CPSC consumer products ----
async function recalls(limit = 8) {
  const now = new Date();
  const from = new Date(now.getTime() - 14 * 24 * 3600e3);
  const [fda, cpsc] = await Promise.all([
    get(`https://api.fda.gov/food/enforcement.json?search=report_date:[${ymd(from)}+TO+${ymd(now)}]&sort=report_date:desc&limit=${limit}`),
    get(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${ymd(from, '-')}`),
  ]);
  const out = [];
  if (fda) {
    try {
      ((await fda.json()).results || []).slice(0, limit).forEach((r, i) => {
        const product = String(r.product_description || '').split(/[,.;]/)[0].slice(0, 90);
        out.push({
          id: `fda-${r.recall_number || i}`,
          kind: 'recall',
          title: `Recall: ${r.recalling_firm || 'Food maker'} recalls ${product}${r.classification ? ` (${r.classification})` : ''}`,
          source: 'FDA',
          url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts',
          publishedAt: r.report_date ? `${r.report_date.slice(0, 4)}-${r.report_date.slice(4, 6)}-${r.report_date.slice(6, 8)}T12:00:00Z` : null,
          weight: 'controversy',
        });
      });
    } catch {}
  }
  if (cpsc) {
    try {
      const arr = await cpsc.json();
      (Array.isArray(arr) ? arr : []).slice(0, limit).forEach((r, i) => {
        out.push({
          id: `cpsc-${r.RecallID || i}`,
          kind: 'recall',
          title: `Recall: ${r.Title || 'Consumer product recall'}`,
          source: 'CPSC',
          url: r.URL || 'https://www.cpsc.gov/Recalls',
          publishedAt: r.RecallDate || null,
          weight: 'controversy',
        });
      });
    } catch {}
  }
  return out;
}


// ---------- Brand chatter: Bluesky + Reddit (best effort) ----------
// Searches the last day of public posts for each term, keeps only posts that really contain it,
// counts the critical ones, and returns ONE summary item per term (never a flood of posts).
// Reddit often refuses requests from cloud servers; when it does, it's skipped quietly.
const CRITICAL = /\b(boycott(ing)?|scam(med)?|worst|awful|terrible|disgusting|gross|furious|outrag(e|ed|eous)|angry|racist|sexist|lawsuit|sued|suing|refund|food poisoning|got sick|made me sick|recall(ed)?|tone[- ]?deaf|insensitive|offensive|shameful|backlash|ripped? ?off|never (buying|going back|ordering|again)|unfollow(ed|ing)?|cancel+ed|apolog(y|ize|ise|ized|ised))\b/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function blueskySearch(term, sinceIso) {
  const qs = `q=${encodeURIComponent(`"${term}"`)}&sort=latest&limit=50&since=${encodeURIComponent(sinceIso)}`;
  for (const host of ['https://public.api.bsky.app', 'https://api.bsky.app']) {
    const res = await get(`${host}/xrpc/app.bsky.feed.searchPosts?${qs}`, { headers: { Accept: 'application/json' } }, 6000);
    if (!res) continue;
    const j = await res.json().catch(() => null);
    if (!j || !Array.isArray(j.posts)) continue;
    return j.posts.map(p => ({
      text: String((p.record && p.record.text) || ''),
      at: Date.parse((p.record && p.record.createdAt) || p.indexedAt || '') || 0,
      url: p.author && p.uri ? `https://bsky.app/profile/${p.author.handle}/post/${String(p.uri).split('/').pop()}` : 'https://bsky.app',
      where: 'Bluesky',
    }));
  }
  return null; // unavailable
}

async function redditSearch(term) {
  const q = encodeURIComponent(`"${term}"`);
  const res = await get(`https://www.reddit.com/search.json?q=${q}&sort=new&t=day&limit=50&raw_json=1`, { headers: { Accept: 'application/json' } }, 6000);
  if (res) {
    const j = await res.json().catch(() => null);
    const kids = j && j.data && Array.isArray(j.data.children) ? j.data.children : null;
    if (kids) return kids.map(c => c.data || {}).map(d => ({
      text: `${d.title || ''} ${d.selftext || ''}`.trim(),
      at: (Number(d.created_utc) || 0) * 1000,
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : 'https://www.reddit.com',
      where: d.subreddit ? `r/${d.subreddit}` : 'Reddit',
    }));
  }
  // Fallback: the search RSS (Atom) feed sometimes answers when JSON doesn't.
  const rss = await get(`https://www.reddit.com/search.rss?q=${q}&sort=new&t=day&limit=50`, {}, 6000);
  if (!rss) return null;
  const xml = await rss.text().catch(() => '');
  const out = []; const re = /<entry>([\s\S]*?)<\/entry>/gi; let m;
  while ((m = re.exec(xml))) {
    const e = m[1];
    const link = (e.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || 'https://www.reddit.com';
    const sub = (e.match(/<category[^>]*term="([^"]+)"/i) || [])[1];
    out.push({ text: `${tagOf(e, 'title')} ${tagOf(e, 'content')}`, at: Date.parse(tagOf(e, 'updated')) || 0, url: link, where: sub ? `r/${sub}` : 'Reddit' });
  }
  return xml.includes('<feed') ? out : null;
}

async function chatter(terms, opts = {}) {
  const brands = new Set((opts.brands || []).map(t => t.toLowerCase()));
  const since = new Date(Date.now() - 24 * 3600e3);
  const status = { bluesky: 'unused', reddit: 'unused' };
  const out = [];
  const list = [...new Set(terms.map(t => t.replace(/^[#@]/, '').trim()).filter(t => t.length >= 3))].slice(0, 4);
  await Promise.all(list.map(async term => {
    const [bs, rd] = await Promise.all([blueskySearch(term, since.toISOString()), redditSearch(term)]);
    status.bluesky = bs ? 'ok' : status.bluesky === 'ok' ? 'ok' : 'unavailable';
    status.reddit = rd ? 'ok' : status.reddit === 'ok' ? 'ok' : 'unavailable';
    const has = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(term)}($|[^\\p{L}\\p{N}])`, 'iu');
    const posts = [...(bs || []), ...(rd || [])].filter(p => p.text && has.test(p.text) && (!p.at || p.at >= since.getTime()));
    if (!posts.length) return;
    const critical = posts.filter(p => CRITICAL.test(p.text));
    const where = [...new Set(posts.map(p => (p.where.startsWith('r/') ? 'Reddit' : p.where)))].join(' and ');
    const hot = critical.length >= 3 && critical.length / posts.length >= 0.25;
    const sample = (hot ? critical : posts)[0];
    out.push({
      id: `chatter-${term.toLowerCase()}`,
      kind: 'chatter',
      term,
      brand: brands.has(term.toLowerCase()),
      weight: hot ? 'controversy' : 'neutral',
      title: hot
        ? `People are criticizing “${term}” on ${where} (${critical.length} of ${posts.length} posts today)`
        : `“${term}” came up ${posts.length} time${posts.length === 1 ? '' : 's'} on ${where} today, mostly calm`,
      source: `${where} · best effort`,
      url: sample ? sample.url : `https://bsky.app/search?q=${encodeURIComponent(term)}`,
      sample: sample ? sample.text.replace(/\s+/g, ' ').slice(0, 160) : '',
      publishedAt: new Date().toISOString(),
      counts: { total: posts.length, critical: critical.length },
    });
  }));
  return { items: out, status };
}

module.exports = { wikipedia, googleTrends, earthquakes, gdacs, recalls, chatter, CRITICAL };
