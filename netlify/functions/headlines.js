'use strict';

// headlines.js — "What's happening" feed for Too Soon?
// Sources (free, no keys):
//   - Google News RSS: top US stories, plus optional keyword searches
//   - National Weather Service: active Severe/Extreme alerts (US)
// Never throws to the client: a failed source just returns fewer items.

const UA = 'TooSoon/0.1 (https://toosoon.netlify.app)';
const extra = require('./_sources');
const ALL_SOURCES = ['wiki', 'trends', 'quakes', 'gdacs', 'recalls', 'chatter'];
const TOP_URL = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
const SEARCH_URL = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:1d&hl=en-US&gl=US&ceid=US:en`;
const NWS_URL = 'https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe';

function headers() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=600',
  };
}

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...options, signal: c.signal }); } finally { clearTimeout(t); }
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRss(xml, kind, limit) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < limit) {
    const tag = name => { const x = m[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return x ? decode(x[1]) : ''; };
    let title = tag('title');
    const source = tag('source');
    // Google News appends " - Outlet" to titles; strip it when we have the outlet separately.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = tag('link');
    const pub = tag('pubDate');
    if (!title) continue;
    out.push({ id: `${kind}-${out.length}-${title.slice(0, 24)}`, kind, title, source: source || 'Google News', url: link, publishedAt: pub ? new Date(pub).toISOString() : null });
  }
  return out;
}

async function getNews(url, kind, limit) {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    return parseRss(await res.text(), kind, limit);
  } catch { return []; }
}

async function getAlerts(limit, area) {
  try {
    // With a state set, include Moderate alerts too: local matters more than national.
    const url = area ? `https://api.weather.gov/alerts/active?status=actual&area=${area}&severity=Extreme,Severe,Moderate` : NWS_URL;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set();
    const out = [];
    // Marine and offshore zones (freezing spray off Alaska, gales on the Great Lakes) aren't
    // news any audience is reacting to, so they'd only crowd out the alerts that matter.
    const MARINE = /^(AM|AN|GM|LC|LE|LH|LM|LO|LS|PH|PK|PM|PS|PZ|SL)Z/;
    const MARINE_EVENT = /spray|gale|small craft|hazardous seas|marine|hurricane force wind|storm warning$/i;
    for (const f of (data.features || [])) {
      const p = f.properties || {};
      const ugc = (p.geocode && p.geocode.UGC) || [];
      if ((ugc.length && ugc.every(z => MARINE.test(z))) || MARINE_EVENT.test(p.event || '')) continue;
      const key = `${p.event}|${(p.areaDesc || '').slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `alert-${p.id || out.length}`,
        kind: 'alert',
        title: `${p.event}: ${(p.areaDesc || '').split(';').slice(0, 3).join(',')}`,
        source: 'National Weather Service',
        url: 'https://www.weather.gov/alerts',
        publishedAt: p.sent || null,
        area: p.areaDesc || '',
        severity: p.severity || '',
        local: !!area,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  const q = event.queryStringParameters || {};
  const clean = v => String(v || '').split(',').map(s => s.replace(/[^\p{L}\p{N} #@&.'-]/gu, '').trim()).filter(Boolean);
  const keywords = clean(q.keywords).slice(0, 10);
  const brands = clean(q.brands).slice(0, 3);
  const area = /^[A-Z]{2}$/.test(String(q.area || '').toUpperCase()) ? String(q.area).toUpperCase() : '';
  const city = String(q.city || '').replace(/[^\p{L}\p{N} .,'-]/gu, '').trim().slice(0, 60);

  const on = q.sources === undefined ? new Set(ALL_SOURCES) : new Set(String(q.sources).split(',').map(x => x.trim()));
  const none = Promise.resolve([]);
  const extras = Promise.all([
    on.has('wiki') ? extra.wikipedia() : none,
    on.has('trends') ? extra.googleTrends('US') : none,
    on.has('quakes') ? extra.earthquakes() : none,
    on.has('gdacs') ? extra.gdacs() : none,
    on.has('recalls') ? extra.recalls() : none,
    on.has('chatter') && (brands.length || keywords.length) ? extra.chatter([...brands, ...keywords], { brands }) : Promise.resolve({ items: [], status: {} }),
  ]);

  const [top, alerts, nationalAlerts, local, ...searches] = await Promise.all([
    getNews(TOP_URL, 'news', 25),
    getAlerts(10, area),
    area ? getAlerts(4, '') : Promise.resolve([]),
    city ? getNews(SEARCH_URL(city), 'local', 8) : Promise.resolve([]),
    ...keywords.map(k => getNews(SEARCH_URL(k.replace(/^[#@]/, '')), 'watch', 4).then(list => list.map(x => ({ ...x, term: k })))),
  ]);
  const mentions = (await Promise.all(brands.map(b => getNews(SEARCH_URL(`"${b}"`), 'mention', 4).then(list => list.map(x => ({ ...x, term: b })))))).flat();
  local.forEach(x => { x.local = true; });
  const [wiki, trends, quakes, disasters, recalls, chat] = await extras;
  const deaths = wiki.filter(x => x.weight === 'tragedy');
  const people = wiki.filter(x => x.weight !== 'tragedy');

  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({
      fetchedAt: new Date().toISOString(),
      items: [...chat.items.filter(x => x.weight !== 'neutral'), ...mentions, ...alerts, ...deaths, ...local, ...nationalAlerts, ...quakes, ...disasters, ...searches.flat(), ...top, ...trends, ...recalls, ...people, ...chat.items.filter(x => x.weight === 'neutral')],
      sources: {
        mentions: mentions.length, news: top.length, alerts: alerts.length + nationalAlerts.length, local: local.length, watch: searches.flat().length,
        wikipedia: wiki.length, trends: trends.length, quakes: quakes.length, gdacs: disasters.length, recalls: recalls.length,
        chatter: chat.items.length, chatterStatus: chat.status,
      },
      area, city,
    }),
  };
};
