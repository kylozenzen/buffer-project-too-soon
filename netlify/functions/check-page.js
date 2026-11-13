'use strict';

// check-page.js — is the link in a scheduled post still okay?
// POST { urls: [...] } → { results: [{ url, ok, status, flags: [...] }] }
// Flags: dead, sold_out, cancelled, postponed, ended.

const dns = require('dns').promises;
const net = require('net');

const MAX_URLS = 15;
const MAX_BYTES = 400000;
const PATTERNS = [
  { flag: 'sold_out', re: /\b(sold[\s-]?out|out of stock|no longer available|currently unavailable)\b/i },
  { flag: 'cancelled', re: /\b(cancell?ed|has been called off)\b/i },
  { flag: 'postponed', re: /\b(postponed|rescheduled)\b/i },
  { flag: 'ended', re: /\b(this event has ended|sale has ended|offer (has )?expired|registration (is )?closed)\b/i },
];

function headers() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:127.');
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) return null;
  } catch { return u; } // DNS failure → let fetch report it as dead
  return u;
}

async function readCapped(res) {
  if (!res.body || !res.body.getReader) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  try { reader.cancel(); } catch {}
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

async function check(raw) {
  const u = await safeUrl(raw);
  if (!u) return { url: raw, ok: false, status: 0, flags: ['invalid'] };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(u.toString(), {
      redirect: 'follow',
      signal: c.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TooSoonLinkCheck/0.1)', Accept: 'text/html,*/*' },
    });
    if (res.status >= 400) return { url: raw, ok: false, status: res.status, flags: ['dead'] };
    const type = res.headers.get('content-type') || '';
    if (!/html|text/.test(type)) return { url: raw, ok: true, status: res.status, flags: [] };
    const text = visibleText(await readCapped(res));
    const flags = PATTERNS.filter(p => p.re.test(text)).map(p => p.flag);
    return { url: raw, ok: true, status: res.status, flags };
  } catch (err) {
    return { url: raw, ok: false, status: 0, flags: ['dead'], error: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers(), body: JSON.stringify({ error: 'method_not_allowed' }) };
  let urls = [];
  try { urls = (JSON.parse(event.body || '{}').urls || []).filter(x => typeof x === 'string'); } catch {}
  urls = [...new Set(urls)].slice(0, MAX_URLS);
  const results = await Promise.all(urls.map(check));
  return { statusCode: 200, headers: headers(), body: JSON.stringify({ results }) };
};
