// app.js — Too Soon? two-column checker
(function () {
  'use strict';

  const CFG = window.TOOSOON_CONFIG;
  const R = window.TooSoonRules;
  const $ = id => document.getElementById(id);
  const KEY_STORE = `${CFG.prefix}_api_key`;
  const PREFS_STORE = `${CFG.prefix}_prefs`;
  const ORG_STORE = `${CFG.prefix}_org`;

  BufferConnection.init({ prefix: CFG.prefix, clientId: CFG.BUFFER_CLIENT_ID, tokenEndpoint: CFG.tokenEndpoint });
  // Re-init once the client id arrives from Netlify (needed for token refresh).
  (window.TOOSOON_CONFIG_READY || Promise.resolve()).then(() => BufferConnection.init({ prefix: CFG.prefix, clientId: CFG.BUFFER_CLIENT_ID, tokenEndpoint: CFG.tokenEndpoint }));

  const state = {
    mode: 'demo', // demo | live
    channels: [],
    posts: [],
    headlines: [],
    pageResults: {},
    results: {},
    ai: {},
    filter: 'all',
    selected: null,
    aiAvailable: false,
    held: {}, // postId -> true once moved to drafts
    pushed: {},
    checkedAt: null,
    editing: null,
    draftText: '',
    demoClear: false, // demo preview of the all-clear screen
  };

  // ---------- prefs ----------
  function loadPrefs() {
    const defaults = { watch: [], ignore: [], sources: ['wiki', 'trends', 'quakes', 'gdacs', 'recalls', 'chatter'], days: true, known: ['chatter'] };
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_STORE) || '{}');
      // New sources start switched on for people who saved settings before they existed.
      if (Array.isArray(saved.sources) && !(saved.known || []).includes('chatter')) { saved.sources = [...saved.sources, 'chatter']; saved.known = [...(saved.known || []), 'chatter']; }
      return { ...defaults, ...saved };
    } catch { return defaults; }
  }
  function savePrefs(p) { try { localStorage.setItem(PREFS_STORE, JSON.stringify(p)); } catch {} }
  let prefs = loadPrefs();

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERDICT_LABEL = { too_soon: 'Too soon', look: 'Give it a look', good: "You're good" };
  const SERVICE_ICON = { instagram: '📸', linkedin: '💼', threads: '🧵', twitter: '𝕏', x: '𝕏', facebook: '📘', bluesky: '🦋', tiktok: '🎵', youtube: '▶️', pinterest: '📌', mastodon: '🐘', googlebusiness: '📍' };

  function dayLabel(iso) {
    if (!iso) return 'Unscheduled';
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const timeLabel = iso => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  function ago(iso) {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  }

  // ---------- Buffer ----------
  async function getToken() {
    const key = (localStorage.getItem(KEY_STORE) || '').trim();
    if (key) return key;
    try { return await BufferConnection.getValidAccessToken(); } catch { return null; }
  }

  async function buffer(query, variables = {}) {
    const token = await getToken();
    if (!token) throw new Error('Not connected');
    const res = await fetch(CFG.proxyEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, query, variables }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.data) {
      const msg = data.error_description || data.message || (typeof data.error === 'string' ? data.error : '') || data.errors?.[0]?.message;
      const e = new Error(res.status === 401 || res.status === 403 ? 'Buffer sign-in expired (401)' : `Buffer didn't answer (${res.status}${msg ? `: ${msg}` : ''}). Try again in a moment.`);
      e.status = res.status; if (res.status === 401 || res.status === 403) e.code = 'REFRESH_FAILED';
      throw e;
    }
    if (data.errors?.length && !data.data) {
      const e = new Error(data.errors[0].message || 'Buffer request failed');
      e.code = data.errors[0].code; e.status = data.errors[0].status || res.status;
      throw e;
    }
    return data.data;
  }


  // ---------- move to drafts (same editPost + saveToDraft pattern PostIQ uses) ----------
  const EDIT_POST = 'mutation EditPost($input:EditPostInput!){editPost(input:$input){__typename ... on PostActionSuccess{post{id dueAt text channelId}} ... on MutationError{message}}}';
  const READ_POST = 'query Src($id:PostId!){post(input:{id:$id}){id text status dueAt}}';

  function unwrapEdit(result) {
    if (result && result.__typename === 'PostActionSuccess' && result.post?.id) return result.post;
    const e = new Error(result?.message || 'Buffer could not move this post.');
    e.typename = result?.__typename || 'MutationError';
    throw e;
  }

  async function editLive(post, changes) {
    const current = (await buffer(READ_POST, { id: post.id }))?.post;
    if (!current) throw new Error('This post no longer exists in Buffer.');
    if (!['scheduled', 'buffer'].includes(String(current.status).toLowerCase())) throw new Error('This post is no longer scheduled. Hit Re-check.');
    try {
      return unwrapEdit((await buffer(EDIT_POST, { input: { id: post.id, ...changes } }))?.editPost);
    } catch (err) {
      // Some Buffer validators reject an edit with no content; retry once with the stored text.
      if (!/text|media/i.test(err.message) || !String(current.text || '').trim()) throw err;
      return unwrapEdit((await buffer(EDIT_POST, { input: { id: post.id, ...changes, text: current.text } }))?.editPost);
    }
  }
  const moveToDraftLive = post => editLive(post, { saveToDraft: true });

  // Push a post back 24 hours (same customScheduled edit PostIQ uses to reschedule).
  async function pushBack(id) {
    const post = state.posts.find(p => p.id === id);
    if (!post) return;
    const base = Math.max(post.dueAt ? new Date(post.dueAt).getTime() : Date.now(), Date.now());
    const next = new Date(base + 24 * 3600 * 1000);
    try {
      if (state.mode === 'demo') await new Promise(r => setTimeout(r, 300));
      else {
        const off = -next.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
        const local = new Date(next.getTime() + off * 60000).toISOString().slice(0, 19);
        await editLive(post, { mode: 'customScheduled', dueAt: `${local}${sign}${pad(off / 60)}:${pad(off % 60)}` });
      }
      post.dueAt = next.toISOString();
      state.posts.sort((a, b) => new Date(a.dueAt || 8.64e15) - new Date(b.dueAt || 8.64e15));
      state.pushed[id] = true;
      logSave('Pushed back a day', post);
      evaluate();
      render();
      toast(`Pushed to ${next.toLocaleDateString('en-US', { weekday: 'long' })} at ${next.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Give the news a day.`);
    } catch (err) { toast(`Couldn't push it back: ${err.message}`); }
  }

  // Plain-English heads-up for a client or boss.
  async function copyForClient(id) {
    const post = state.posts.find(p => p.id === id);
    const res = state.results[id];
    if (!post || !res) return;
    const ch = state.channels.find(c => c.id === post.channelId) || {};
    const when = post.dueAt ? new Date(post.dueAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'soon';
    const why = (state.ai[id]?.reason) || res.reasons.map(r => r.text).join('; ');
    const action = state.held[id] ? "I've pulled it to drafts for now." : state.ai[id]?.fix ? `Suggestion: ${state.ai[id].fix}` : 'I suggest we hold it for a day or rework it.';
    const text = `Heads up: our ${ch.name ? `${ch.name} ` : ''}post scheduled for ${when} may read badly today.\n\n"${post.text}"\n\nWhy: ${why}\n${action}`;
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it to your client or boss.'); }
    catch { window.prompt('Copy this:', text); }
  }

  async function moveToDraft(ids) {
    const done = [], failed = [];
    for (const id of ids) {
      const post = state.posts.find(p => p.id === id);
      if (!post || state.held[id]) continue;
      try {
        if (state.mode === 'demo') await new Promise(r => setTimeout(r, 350));
        else await moveToDraftLive(post);
        state.held[id] = true; done.push(id);
        logSave('Pulled to drafts', post);
      } catch (err) {
        failed.push({ id, message: err.message });
      }
    }
    render();
    if (failed.length) toast(`${done.length ? `Moved ${done.length}. ` : ''}Couldn't move ${failed.length}: ${failed[0].message}`);
    else if (done.length) toast(done.length === 1 ? 'Pulled to drafts. Crisis averted.' : `Pulled ${done.length} posts to drafts. Crisis averted.`);
  }

  function confirmDraft(ids) {
    const n = ids.length;
    $('draftTitle').textContent = n === 1 ? 'Pull this post to drafts?' : `Pull ${n} posts to drafts?`;
    $('draftList').innerHTML = ids.map(id => {
      const p = state.posts.find(x => x.id === id);
      return `<li>${esc((p?.text || '').slice(0, 120))}${(p?.text || '').length > 120 ? '…' : ''}</li>`;
    }).join('');
    $('draftConfirm').onclick = () => { $('draftDialog').close(); moveToDraft(ids); };
    $('draftDialog').showModal();
  }

  async function loadLive() {
    const acc = await buffer('query { account { organizations { id name } } }');
    const orgs = acc?.account?.organizations || [];
    if (!orgs.length) throw new Error('No Buffer organizations found');
    const sel = $('orgSelect');
    let orgId = localStorage.getItem(ORG_STORE);
    if (!orgs.find(o => o.id === orgId)) orgId = orgs[0].id;
    sel.innerHTML = orgs.map(o => `<option value="${esc(o.id)}"${o.id === orgId ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    sel.hidden = orgs.length < 2;
    state.orgs = orgs;
    state.orgId = orgId;
    state.orgName = (orgs.find(o => o.id === orgId) || {}).name || '';

    return loadOrg(orgId);
  }

  // Channels + scheduled posts for one organization. Asks for image alt text too; if Buffer's
  // schema rejects that part, retries without it so the check still runs.
  let assetsSupported = true;
  async function loadOrg(orgId) {
    const ch = await buffer('query C($organizationId: OrganizationId!) { channels(input:{organizationId:$organizationId}){ id displayName name service } }', { organizationId: orgId });
    const channels = (ch?.channels || []).map(c => ({ id: c.id, service: String(c.service || '').toLowerCase(), name: c.displayName || c.name }));
    const svc = Object.fromEntries(channels.map(c => [c.id, c.service]));

    const fetchPosts = async withAssets => {
      const fields = withAssets ? 'id text dueAt channelId assets{__typename ... on ImageAsset{image{altText}}}' : 'id text dueAt channelId';
      const out = [];
      let after = null;
      for (let page = 0; page < 4; page++) {
        const q = `query P($organizationId: OrganizationId!, $after: String, $first: Int!) { posts(first:$first,after:$after,input:{organizationId:$organizationId,filter:{status:[scheduled]}}){edges{node{${fields}}} pageInfo{hasNextPage endCursor} } }`;
        const d = await buffer(q, { organizationId: orgId, after, first: 50 });
        (d?.posts?.edges || []).forEach(e => out.push(e.node));
        if (!d?.posts?.pageInfo?.hasNextPage) break;
        after = d.posts.pageInfo.endCursor;
      }
      return out;
    };
    let raw;
    if (assetsSupported) {
      try { raw = await fetchPosts(true); } catch (err) { if (/auth|token/i.test(err.message)) throw err; assetsSupported = false; }
    }
    if (!raw) raw = await fetchPosts(false);
    const posts = raw.map(p => ({
      id: p.id, text: p.text, dueAt: p.dueAt, channelId: p.channelId, service: svc[p.channelId] || '',
      assets: (p.assets || []).filter(x => x && x.__typename === 'ImageAsset').map(x => ({ type: 'image', altText: x.image?.altText || '' })),
    }));
    posts.sort((x, y) => new Date(x.dueAt || 8.64e15) - new Date(y.dueAt || 8.64e15));
    return { channels, posts };
  }

  // ---------- auto-watchlist: learn the brand's own terms from its queue ----------
  function autoTerms(posts) {
    const muted = new Set((prefs.muted || []).map(s => s.toLowerCase()));
    const counts = new Map();
    const add = (t, w) => { const k = t.toLowerCase(); if (muted.has(k) || k.length < 3) return; const c = counts.get(k) || { term: t, n: 0 }; c.n += w; counts.set(k, c); };
    for (const p of posts) {
      const text = String(p.text || '');
      (text.match(/#[A-Za-z][A-Za-z0-9_]{2,}/g) || []).forEach(t => add(t, 3)); // hashtags: always check why they're trending
      (text.match(/@[A-Za-z0-9_]{3,}/g) || []).forEach(t => add(t, 1));
      R.extractEntities(text, true).full.filter(e => e.includes(' ') && !e.startsWith('#')).forEach(e => add(e.replace(/\b\w/g, c => c.toUpperCase()), 1));
    }
    const ranked = [...counts.values()].sort((a, b) => b.n - a.n || b.term.length - a.term.length).map(c => c.term);
    // Drop terms that are just part of a longer one ("Latte Art" inside "Latte Art Throwdown").
    const kept = ranked.filter(t => !ranked.some(o => o !== t && o.toLowerCase().includes(t.toLowerCase())));
    return kept.slice(0, 8);
  }

  function brandTerms() {
    const names = new Set();
    if (state.orgName) names.add(state.orgName);
    state.channels.forEach(c => { if (c.name && !/^@?[a-z0-9_.]+$/.test(c.name)) names.add(c.name); });
    return [...names].filter(n => !(prefs.muted || []).map(s => s.toLowerCase()).includes(n.toLowerCase())).slice(0, 3);
  }

  async function loadHeadlines() {
    const qs = new URLSearchParams();
    state.autoWatch = autoTerms(state.posts);
    const kws = [...new Set([...(prefs.watch || []), ...state.autoWatch])].slice(0, 10);
    if (kws.length) qs.set('keywords', kws.join(','));
    const brands = brandTerms();
    if (brands.length) qs.set('brands', brands.join(','));
    if (prefs.area) qs.set('area', prefs.area);
    if (prefs.city) qs.set('city', prefs.city);
    qs.set('sources', (prefs.sources || []).join(','));
    const res = await fetch(`/.netlify/functions/headlines${qs.toString() ? `?${qs}` : ''}`);
    const data = await res.json();
    state.chatterStatus = (data.sources && data.sources.chatterStatus) || null;
    return data.items || [];
  }

  async function loadPageChecks(posts) {
    const urls = [...new Set(posts.flatMap(p => R.extractUrls(p.text)))].slice(0, 15);
    if (!urls.length) return {};
    try {
      const res = await fetch('/.netlify/functions/check-page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
      const data = await res.json();
      return Object.fromEntries((data.results || []).map(r => [r.url, r]));
    } catch { return {}; }
  }

  async function checkAiAvailable() {
    if (state.mode === 'demo') return true; // demo uses canned opinions
    if (prefs.aiKey) return true; // user's own key
    try { const r = await fetch('/.netlify/functions/second-opinion'); const d = await r.json(); return !!d.available; } catch { return false; }
  }

  // ---------- run ----------
  const orgKey = () => (state.mode === 'demo' ? 'demo' : state.orgId || 'default');
  const sensitivity = () => ((prefs.sensitivity || {})[orgKey()] || 'normal');

  function evaluate() {
    state.duplicates = R.findDuplicates(state.posts);
    state.tidy = Object.fromEntries(state.posts.map(p => [p.id, R.tidy(p, ctx())]));
    state.results = Object.fromEntries(R.checkQueue(state.posts, state.headlines, ctx()).map(r => [r.id, r]));
  }
  function ctx() {
    return { pageResults: state.pageResults, ignore: prefs.ignore, watch: prefs.watch, calendar: prefs.days ? window.TooSoonCalendar : null, sensitivity: sensitivity(), utm: !!prefs.utm, duplicates: state.duplicates };
  }

  async function run() {
    const quips = ['Reading the room…', 'Checking if it’s too soon…', 'Skimming the headlines so you don’t have to…', 'Asking “wait, what happened today?”…', 'Hiding the intern’s phone…'];
    const switching = state.mode === 'live' && state.orgName === 'Luma Coffee Co.';
    // Clear whatever was on screen first, so demo posts never linger while the real queue loads.
    state.posts = []; state.headlines = []; state.results = {}; state.channels = []; state.selected = null;
    if (state.mode === 'live') state.orgName = '';
    applyChrome();
    setSummary(state.mode === 'live' ? (switching || !state.checkedAt ? 'Loading your Buffer queue…' : quips[Math.floor(Math.random() * quips.length)]) : quips[Math.floor(Math.random() * quips.length)],
      state.mode === 'live' ? 'Fetching your scheduled posts, then reading today\'s news.' : 'Comparing scheduled posts with today\'s news.');
    $('queueList').innerHTML = skeleton();
    $('newsList').innerHTML = Array.from({ length: 4 }, () => '<li class="news skeleton"><div></div><div></div></li>').join('');
    $('newsMeta').textContent = '';
    $('allClear').hidden = true;
    $('streakNote').hidden = true;
    $('opinionRow').hidden = true;
    document.title = 'Checking… · Too Soon?';
    state.ai = {};
    state.held = {};
    state.pushed = {};
    state.editing = null;
    try {
      if (state.mode === 'demo') {
        const d = TooSoonDemo.build();
        const svc = Object.fromEntries(d.channels.map(c => [c.id, c.service]));
        d.posts.forEach(p => { p.service = svc[p.channelId]; });
        Object.assign(state, { channels: d.channels, posts: d.posts, headlines: d.headlines, pageResults: d.pageResults, orgName: 'Luma Coffee Co.' });
        state.autoWatch = autoTerms(d.posts);
        if (state.demoClear) {
          evaluate();
          state.posts = state.posts.filter(p => state.results[p.id]?.verdict === 'good');
        }
      } else {
        const live = await loadLive();
        state.channels = live.channels; state.posts = live.posts;
        state.headlines = await loadHeadlines();
        state.pageResults = await loadPageChecks(live.posts);
      }
      if (prefs.days && window.TooSoonCalendar) state.headlines = [...TooSoonCalendar.upcoming(7), ...state.headlines];
      evaluate();
      state.aiAvailable = await checkAiAvailable();
      state.checkedAt = Date.now();
      render();
      maybeAlert();
    } catch (err) {
      console.error(err);
      const authish = /token|auth|connect/i.test(err.message) || err.status === 401;
      setSummary(authish ? 'Buffer needs reconnecting' : 'Something went sideways', authish ? 'Your Buffer connection expired or the key was rejected.' : err.message);
      const reconnect = err.code === 'REFRESH_FAILED' || /reconnect|unauthori[sz]ed|401|token/i.test(err.message || '');
      $('queueList').innerHTML = `<div class="empty"><p>${reconnect ? 'Buffer needs you to sign in again. It happens; sign-ins expire.' : `Couldn’t load your queue. ${esc(err.message)}`}</p>${reconnect ? '<button class="btn small" type="button" data-action="connect">Sign in again</button>' : '<button class="btn small" type="button" data-action="retry">Try again</button>'} <button class="btn ghost small" type="button" data-action="demo">Show the demo instead</button></div>`;
    }
  }

  function skeleton() { return Array.from({ length: 3 }, () => '<div class="post skeleton"><div></div><div></div></div>').join(''); }

  // ---------- render ----------
  function setSummary(title, sub, countsHtml = '') {
    $('summaryTitle').textContent = title;
    $('summarySub').textContent = sub;
    $('summaryCounts').innerHTML = countsHtml;
  }

  const handled = id => !!(state.held[id] || state.pushed[id]);

  function verdictFor(id) {
    const ai = state.ai[id];
    return ai ? ai.verdict : state.results[id]?.verdict || 'good';
  }

  function render() {
    const counts = { too_soon: 0, look: 0, good: 0 };
    let heldCount = 0;
    state.posts.forEach(p => { if (handled(p.id)) heldCount++; else counts[verdictFor(p.id)]++; });
    const n = state.posts.length;
    let title, sub;
    if (!n) { title = 'Your queue is empty.'; sub = 'Nothing scheduled means nothing to apologize for.'; }
    else if (!counts.too_soon && heldCount) { title = counts.look ? `Saved. ${counts.look} still worth a look.` : 'Saved. Nothing to apologize for.'; sub = `${heldCount} ${heldCount === 1 ? 'post is' : 'posts are'} handled: pulled to drafts or pushed back a day.`; }
    else if (counts.too_soon) { title = `${counts.too_soon} ${counts.too_soon === 1 ? 'post is' : 'posts are'} too soon.`; sub = 'Fix these before they become the story.'; }
    else if (counts.look) { title = `Mostly fine. ${counts.look} worth a second look.`; sub = 'Nothing alarming, but give these a glance.'; }
    else { title = 'Nothing to apologize for today.'; sub = n === 1 ? 'Your one scheduled post looks good against today\'s news.' : `All ${n} scheduled posts look good against today's news.`; }
    setSummary(title, sub, ['too_soon', 'look', 'good'].map(k => `<button type="button" class="count ${k}" data-filter="${k}"><b>${counts[k]}</b><span>${VERDICT_LABEL[k]}</span></button>`).join(''));

    applyChrome();
    $('opinionBtn').hidden = !((counts.too_soon + counts.look) > 0);
    if (!$('opinionBtn').disabled) $('opinionBtn').textContent = '✨ Second opinion on all flagged';
    if (!state.aiAvailable) $('opinionMeta').textContent = 'AI is off. Add your own Claude or Gemini key in Settings to turn it on.';
    $('holdAllBtn').hidden = counts.too_soon < 2;
    $('holdAllBtn').textContent = `Pull all ${counts.too_soon} too-soon posts to drafts`;
    $('opinionMeta').hidden = $('opinionBtn').hidden;
    $('opinionRow').hidden = $('opinionBtn').hidden && $('holdAllBtn').hidden;

    // Tab title + favicon tell you the verdict even when the tab is in the background.
    document.title = counts.too_soon ? `(${counts.too_soon}) Too soon! · Too Soon?` : 'All clear · Too Soon?';
    setFavicon(counts.too_soon ? '😬' : counts.look ? '🤔' : '😌');
    renderChecked();

    renderNews();
    renderQueue();
    if (window.TooSoonAllClear) TooSoonAllClear.render({ counts, heldCount, n });
  }

  // Header, banner and menu reflect demo vs live right away (before anything loads).
  function applyChrome() {
    const connected = isConnected();
    const demo = state.mode === 'demo';
    $('mode').textContent = demo ? 'Demo' : 'Live';
    $('mode').className = `mode ${state.mode}`;
    $('demoBanner').hidden = !demo;
    $('demoBannerText').innerHTML = demo && connected
      ? '☕ <b>Showing demo posts.</b> Your Buffer is still connected. Nothing here touches it.'
      : '☕ <b>Demo:</b> a made-up coffee shop on a made-up news day. Try the buttons, then check your own posts.';
    $('bannerConnect').textContent = connected ? 'Back to my queue' : 'Connect Buffer';
    $('connectBtn').textContent = !demo ? 'Disconnect' : connected ? 'My queue' : 'Connect Buffer';
    $('connectBtn').classList.toggle('ghost', !demo);
    $('demoItem').hidden = demo && !connected;
    $('demoItem').textContent = demo ? 'Back to my queue' : 'Show demo posts';
    $('previewItem').hidden = !demo;
    $('previewItem').textContent = state.demoClear ? 'Back to the full demo' : 'Preview the all-clear screen';
    $('disconnectItem').hidden = !connected;
    if (demo) $('orgSelect').hidden = true;
  }

  function showDemo(clear) {
    state.demoClear = !!clear;
    state.mode = 'demo';
    run();
  }
  function backToQueue() {
    state.demoClear = false;
    state.mode = 'live';
    run();
  }

  async function shareApp() {
    const url = `${location.origin}/`;
    const data = { title: 'Too Soon?', text: 'Too Soon? checks your scheduled Buffer posts against today’s news, so nothing goes out at the worst possible moment.', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to someone who schedules posts.'); }
    catch { window.prompt('Copy this link:', url); }
  }

  function setFavicon(emoji) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`;
  }

  function renderChecked() {
    if (!state.checkedAt) { $('lastChecked').textContent = ''; return; }
    const m = Math.round((Date.now() - state.checkedAt) / 60000);
    $('lastChecked').textContent = m < 1 ? 'Checked just now' : `Checked ${m}m ago`;
  }

  function renderNews() {
    const linked = new Set();
    if (state.selected) (state.results[state.selected]?.reasons || []).forEach(r => r.headlineId && linked.add(r.headlineId));
    const flaggedIds = new Set(Object.values(state.results).flatMap(r => r.reasons.map(x => x.headlineId).filter(Boolean)));
    const items = state.headlines.slice(0, 45);
    const cs = state.mode === 'live' && state.chatterStatus;
    const off = cs ? ['bluesky', 'reddit'].filter(k => cs[k] === 'unavailable').map(k => (k === 'bluesky' ? 'Bluesky' : 'Reddit')) : [];
    $('newsMeta').textContent = state.mode === 'demo' ? 'Demo news day' : `${items.length} items${prefs.area ? ` · ${prefs.city ? `${prefs.city}, ` : ''}${prefs.area}` : ' · US'}${off.length ? ` · ${off.join(' and ')} didn’t answer today` : ''}`;
    $('newsList').innerHTML = items.map(h => {
      const weight = h.kind === 'alert' ? 'alert' : (h.weight || R.headlineWeight(h.title));
      const localTag = h.local ? '<span class="tag local">Your area</span> ' : '';
      const kindTag = h.kind === 'mention' ? '<span class="tag mention">Mentions you</span>' : h.kind === 'watch' && h.term ? `<span class="tag watch">${esc(h.term)}</span>` : { people: weight === 'tragedy' ? '<span class="tag heavy">Died</span>' : '<span class="tag people">People</span>', trend: '<span class="tag trend">Trending</span>', recall: '<span class="tag dev">Recall</span>', day: '<span class="tag day">Sensitive day</span>', chatter: weight === 'controversy' ? '<span class="tag chatter hot">Heated chatter</span>' : '<span class="tag chatter">Chatter</span>' }[h.kind];
      const kindTagFinal = kindTag && h.kind === 'watch' && weight === 'tragedy' ? kindTag + ' <span class="tag heavy">Heavy</span>' : kindTag;
      const tag = localTag + (kindTagFinal || (weight === 'alert' ? '<span class="tag alert">Alert</span>' : weight === 'tragedy' ? '<span class="tag heavy">Heavy</span>' : weight === 'controversy' ? '<span class="tag dev">Developing</span>' : ''));
      const cls = ['news', weight, flaggedIds.has(h.id) ? 'touches' : '', linked.has(h.id) ? 'linked' : ''].join(' ');
      // The whole card opens the story in a new tab (the link stretches over the card).
      const title = h.url ? `<a class="news-link" href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}<span class="ext" aria-label="opens in a new tab"> ↗</span></a>` : esc(h.title);
      return `<li class="${cls}" id="news-${esc(h.id)}">${tag}<p>${title}</p>${h.kind === 'chatter' && h.sample && weight === 'controversy' ? `<q class="chatter-sample">${esc(h.sample)}</q>` : ''}<small>${esc(h.source || '')}${h.publishedAt ? ` · ${ago(h.publishedAt)}` : ''}${flaggedIds.has(h.id) ? ' · <b>touches your queue</b>' : ''}</small></li>`;
    }).join('') || '<li class="news"><p>No headlines loaded. Your posts were still checked for links and dates.</p></li>';
  }

  function renderQueue() {
    const byId = Object.fromEntries(state.channels.map(c => [c.id, c]));
    const soon = Date.now() + 24 * 3600 * 1000;
    const visible = state.posts.filter(p => state.filter === 'all'
      || (state.filter === 'next24' ? (p.dueAt && new Date(p.dueAt).getTime() <= soon) : (!handled(p.id) && verdictFor(p.id) === state.filter)));
    if (!visible.length) {
      $('queueList').innerHTML = `<div class="empty"><p>${!state.posts.length ? 'No scheduled posts found in this Buffer organization.' : state.filter === 'next24' ? 'Nothing posts in the next 24 hours. Enjoy the quiet.' : 'Nothing in this filter.'}</p></div>`;
      return;
    }
    let lastDay = '';
    $('queueList').innerHTML = visible.map(p => {
      const day = dayLabel(p.dueAt);
      const head = day !== lastDay ? `<h3 class="day">${esc(day)}</h3>` : '';
      lastDay = day;
      const ch = byId[p.channelId] || {};
      const res = state.results[p.id] || { verdict: 'good', reasons: [] };
      const ai = state.ai[p.id];
      const held = !!state.held[p.id];
      const pushed = !held && !!state.pushed[p.id];
      const v = held || pushed ? 'held' : verdictFor(p.id);
      const urlFor = id => (state.headlines.find(h => h.id === id) || {}).url;
      const reasons = res.reasons.map(r => `<li class="${r.level}">${r.headlineId ? `<button type="button" class="linkish" data-show="${esc(r.headlineId)}">${esc(r.text)}</button>${urlFor(r.headlineId) ? ` <a class="reason-open" href="${esc(urlFor(r.headlineId))}" target="_blank" rel="noopener">Open story ↗</a>` : ''}` : esc(r.text)}</li>`).join('');
      const busy = state.aiBusy && state.aiBusy.has(p.id);
      const aiBlock = busy ? `<div class="ai thinking">✨ Reading this post next to today's headlines…</div>`
        : ai ? `<div class="ai"><b>✨ Second opinion:</b> ${esc(ai.reason)}${ai.fix ? `<br><b>Try:</b> ${esc(ai.fix)}` : ''}${ai.rewrite && state.editing !== p.id ? `<div class="ai-rw">“${esc(ai.rewrite)}”<button type="button" class="btn small" data-use-rw="${esc(p.id)}">Use this rewrite</button></div>` : ''}</div>` : '';
      const flagged = !held && !pushed && (v !== 'good' || res.reasons.length);
      return `${head}<article class="post ${v}${state.selected === p.id ? ' selected' : ''}" data-id="${esc(p.id)}" tabindex="0">
        <div class="post-top">
          <span class="channel">${SERVICE_ICON[ch.service] || '•'} ${esc(ch.name || 'Channel')}</span>
          <span class="time">${esc(timeLabel(p.dueAt))}</span>
          <span class="stamp ${v}">${held ? 'In drafts ✓' : pushed ? 'Pushed a day ✓' : VERDICT_LABEL[v]}</span>
        </div>
        ${state.editing === p.id ? `
        <div class="editor">
          <textarea id="editText" rows="4" aria-label="Rewrite this post">${esc(state.draftText)}</textarea>
          <div class="live-check" id="liveCheck">${liveCheckHtml(p, state.draftText)}</div>
          <div class="post-actions">
            <button type="button" class="btn small" data-save="${esc(p.id)}">Save to Buffer</button>
            <button type="button" class="btn ghost small" data-save-draft="${esc(p.id)}">Save &amp; pull to drafts</button>
            <button type="button" class="btn ghost small ai-btn" data-ai-rw="${esc(p.id)}">✨ Suggest a rewrite</button>
            <button type="button" class="linkish small-link" data-cancel-edit>Cancel</button>
          </div>
          ${ai?.fix ? `<p class="fine-note">Second opinion suggests: ${esc(ai.fix)}</p>` : ''}
        </div>` : `<p class="text">${esc(p.text)}</p>`}
        ${reasons ? `<ul class="reasons">${reasons}</ul>` : ''}
        ${aiBlock}
        ${(state.tidy?.[p.id] || []).length && !held ? `<ul class="tidy">${state.tidy[p.id].map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${pushed ? `<p class="held-note">Pushed back a day. Re-check tomorrow to make sure the moment has passed.</p>` : ''}
        ${held ? `<p class="held-note">Pulled from the queue. It's waiting in your Buffer drafts. Edit and reschedule it when the moment's right.</p>` : ''}
        ${flagged && state.editing !== p.id ? `<div class="post-actions">
          <button type="button" class="btn ${v === 'too_soon' ? 'red' : ''} small" data-draft="${esc(p.id)}">Pull to drafts</button>
          ${ai ? '' : `<button type="button" class="btn ghost small ai-btn" data-ask-ai="${esc(p.id)}">✨ Ask AI</button>`}
          <button type="button" class="btn ghost small" data-edit="${esc(p.id)}">Rewrite</button>
          <button type="button" class="btn ghost small" data-push="${esc(p.id)}">Push back a day</button>
          <button type="button" class="btn ghost small" data-copy="${esc(p.id)}">Copy for client</button>
          <button type="button" class="linkish small-link" data-feedback="ignore" data-id="${esc(p.id)}">Not relevant</button>
        </div>` : ''}
      </article>`;
    }).join('');
  }

  function renderAutoChips() {
    const list = state.autoWatch || [];
    const muted = prefs.muted || [];
    $('autoChips').innerHTML = (list.length ? list.map(t => `<button type="button" data-mute="${esc(t)}" title="Stop watching">${esc(t)}<span>×</span></button>`).join('') : '<span class="fine">Nothing yet. Connect Buffer and we’ll learn from your queue.</span>')
      + (muted.length ? ` <button type="button" data-unmute-all>Restore ${muted.length} muted</button>` : '');
  }

  // ---------- Slack / Discord alerts ----------
  async function sendAlert(text) {
    if (!prefs.webhook) return { ok: false, error: 'No webhook set' };
    try {
      const res = await fetch('/.netlify/functions/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: prefs.webhook, text }) });
      return await res.json();
    } catch { return { ok: false, error: 'unreachable' }; }
  }

  function summaryText() {
    const red = state.posts.filter(p => !handled(p.id) && verdictFor(p.id) === 'too_soon');
    const look = state.posts.filter(p => !handled(p.id) && verdictFor(p.id) === 'look');
    const who = state.orgName ? ` for ${state.orgName}` : '';
    if (!red.length && !look.length) return `😌 Too Soon? check${who}: all ${state.posts.length} scheduled posts look good against today's news.`;
    const line = p => `• ${timeLabel(p.dueAt) || ''} ${dayLabel(p.dueAt)}: "${String(p.text).slice(0, 80)}${String(p.text).length > 80 ? '…' : ''}" (${state.results[p.id]?.reasons[0]?.text || ''})`;
    return [`😬 Too Soon? check${who}: ${red.length} too soon, ${look.length} worth a look.`, ...red.slice(0, 5).map(line), `${location.origin}/app.html`].join('\n');
  }

  async function maybeAlert() {
    if (state.mode !== 'live' || !prefs.webhook) return;
    const key = `${CFG.prefix}_alerted_${orgKey()}`;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    const today = new Date().toDateString();
    const fresh = state.posts.filter(p => !handled(p.id) && verdictFor(p.id) === 'too_soon' && !seen[p.id]);
    const digestDue = prefs.digest && seen.__digest !== today;
    if (!fresh.length && !digestDue) return;
    const r = await sendAlert(fresh.length ? `🚨 New "too soon" post${fresh.length > 1 ? 's' : ''}:\n${summaryText().split('\n').slice(1).join('\n')}` : summaryText());
    if (r.ok) { fresh.forEach(p => { seen[p.id] = Date.now(); }); if (digestDue) seen.__digest = today; try { localStorage.setItem(key, JSON.stringify(seen)); } catch {} }
  }

  // ---------- saves log (for the "Saves" report) ----------
  const LOG_STORE = `${CFG.prefix}_saves`;
  function logSave(action, post, reason) {
    try {
      const log = JSON.parse(localStorage.getItem(LOG_STORE) || '[]');
      log.push({ ts: Date.now(), org: state.mode === 'demo' ? 'Demo (Luma Coffee)' : state.orgName || 'Buffer', action, text: String(post?.text || '').slice(0, 140), reason: reason || (state.results[post?.id]?.reasons[0]?.text) || '' });
      localStorage.setItem(LOG_STORE, JSON.stringify(log.slice(-500)));
    } catch {}
  }

  // ---------- inline rewrite ----------
  function liveCheckHtml(post, text) {
    const r = R.checkPost({ ...post, text }, state.headlines, ctx());
    const label = { too_soon: 'Still too soon', look: 'Worth a look', good: "You're good" }[r.verdict];
    return `<span class="stamp ${r.verdict}">${label}</span> <span>${r.reasons.length ? esc(r.reasons[0].text) : 'Nothing in today\'s news flags this version.'}</span>`;
  }

  function startEdit(id) {
    const post = state.posts.find(p => p.id === id);
    if (!post) return;
    state.editing = id;
    state.draftText = post.text;
    renderQueue();
    const ta = $('editText');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  async function saveEdit(id, alsoDraft) {
    const post = state.posts.find(p => p.id === id);
    const text = ($('editText')?.value || '').trim();
    if (!post || !text) { toast('Write something first.'); return; }
    try {
      if (state.mode === 'demo') await new Promise(r => setTimeout(r, 300));
      else await editLive(post, alsoDraft ? { text, saveToDraft: true } : { text });
      logSave(alsoDraft ? 'Rewrote and pulled to drafts' : 'Rewrote', post);
      post.text = text;
      state.editing = null;
      delete state.ai[id];
      if (alsoDraft) state.held[id] = true;
      evaluate();
      render();
      const v = state.results[id]?.verdict;
      toast(alsoDraft ? 'Saved and pulled to drafts.' : v === 'good' ? 'Saved to Buffer. Much better.' : 'Saved to Buffer, but it still reads risky.');
    } catch (err) { toast(`Couldn't save: ${err.message}`); }
  }

  // ---------- second opinion ----------
  const DEMO_OPINIONS = {
    d1: { verdict: 'too_soon', reason: 'Calling a product "on fire" the same day families are evacuating from a fire downtown will read as careless, even though it\'s unrelated.', fix: 'Swap the wording, or hold until Monday.', rewrite: 'Our new cold brew is seriously smooth. Grab one before they\'re gone this weekend!' },
    d2: { verdict: 'too_soon', reason: 'Hyping Jordan Vale\'s album hours after news of their death would look like you missed it, or worse, are cashing in.', fix: 'Pull it. If you want to acknowledge it, a short, sincere note works better than a promo.', rewrite: '' },
    d3: { verdict: 'too_soon', reason: 'The ticket page says sold out, so "spots are limited" sends people to a dead end.', fix: 'Point people to the waitlist instead.', rewrite: 'Our Latte Art Throwdown is officially sold out! Join the waitlist and we\'ll save you a spot if one opens up: https://demo.toosoon.app/waitlist' },
    d4: { verdict: 'too_soon', reason: 'The deal date will already be past when this posts.', fix: 'Update the date, or pull it to drafts.', rewrite: 'Our fall punch card deal is back for one more week. Don\'t miss it.' },
    d7: { verdict: 'look', reason: 'Harbor County is under a flash flood warning. A cheerful block-party throwback is probably fine, but it may feel off to locals today.', fix: 'Consider moving it a few days.', rewrite: '' },
  };

  // Ask AI about some posts (or every flagged post). Returns true if it ran.
  function needAiKey() {
    toast('Add an AI key in Settings to turn on second opinions. Gemini has a free tier.');
    $('settingsBtn').click();
    setTimeout(() => $('aiKeyInput')?.focus(), 200);
  }
  async function askAI(ids, opts = {}) {
    if (!state.aiAvailable) { needAiKey(); return false; }
    const posts = state.posts.filter(p => ids.includes(p.id));
    if (!posts.length) return false;
    state.aiBusy = new Set(ids); renderQueue();
    const btn = $('opinionBtn'); if (opts.all) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    try {
      if (state.mode === 'demo') {
        await new Promise(r => setTimeout(r, 900));
        posts.forEach(p => { if (DEMO_OPINIONS[p.id]) state.ai[p.id] = DEMO_OPINIONS[p.id]; });
      } else {
        const res = await fetch('/.netlify/functions/second-opinion', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            posts: posts.map(p => ({ id: p.id, text: p.text, dueAt: p.dueAt, ruleReasons: (state.results[p.id]?.reasons || []).map(r => r.text) })),
            headlines: state.headlines.filter(h => h.kind !== 'day').slice(0, 30).map(h => ({ title: h.title, source: h.source })),
            byok: prefs.aiKey ? { provider: prefs.aiProvider || 'gemini', key: prefs.aiKey } : undefined,
          }),
        });
        const data = await res.json();
        if (!data.available) { state.aiAvailable = false; needAiKey(); return false; }
        (data.verdicts || []).forEach(v => { state.ai[v.id] = v; });
        if (data.error) toast(`AI couldn’t answer: ${data.error}`);
        $('opinionMeta').textContent = `Second opinions by ${data.provider === 'claude' ? 'Claude' : 'Gemini'}. Suggestions only; you decide.`;
      }
      return true;
    } finally {
      state.aiBusy = new Set();
      if (opts.all) { btn.disabled = false; btn.textContent = '✨ Second opinion on all flagged'; }
      render();
    }
  }
  const secondOpinion = () => askAI(state.posts.filter(p => !handled(p.id) && state.results[p.id]?.verdict !== 'good').map(p => p.id), { all: true });

  async function suggestRewrite(id) {
    if (!state.ai[id]?.rewrite) {
      const ok = await askAI([id]);
      if (!ok) return;
    }
    const rw = state.ai[id]?.rewrite;
    if (!rw) { toast(state.ai[id]?.fix ? `AI suggests holding it: ${state.ai[id].fix}` : 'AI didn’t suggest a rewrite for this one.'); return; }
    state.editing = id; state.draftText = rw;
    renderQueue();
    const ta = $('editText'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    toast('AI rewrite loaded. Edit it, then save to Buffer.');
  }

  // ---------- feedback ----------
  function feedback(kind, id) {
    const res = state.results[id];
    const post = state.posts.find(p => p.id === id);
    if (!res || !post) return;
    if (kind === 'ignore') {
      // Ignore the names that caused the match so it stops flagging.
      const names = R.extractEntities(post.text, true);
      const hitNames = [...names.full, ...names.partial].filter(n => res.reasons.some(r => r.text.toLowerCase().includes(n)));
      prefs.ignore = [...new Set([...prefs.ignore, ...hitNames])];
      savePrefs(prefs);
      delete state.ai[id];
      evaluate();
      if (state.results[id].verdict !== 'good' && !hitNames.length) {
        state.results[id] = { id, verdict: 'good', reasons: [] }; // dismissed for this session
      }
      toast(hitNames.length ? `Got it. We'll ignore "${hitNames.join('", "')}" from now on.` : 'Dismissed for now.');
    } else {
      toast('Nice. Pull it to drafts or edit it in Buffer, then hit Re-check.');
    }
    render();
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------- connect ----------
  function isConnected() { return !!(localStorage.getItem(KEY_STORE) || BufferConnection.hasConnection()); }

  async function openConnect() {
    if (window.TooSoonAgree && !TooSoonAgree.has()) { TooSoonAgree.open(); await TooSoonAgree.agreed; }
    await (window.TOOSOON_CONFIG_READY || Promise.resolve());
    $('oauthBtn').disabled = false;
    $('oauthBtn').textContent = 'Sign in with Buffer';
    // Sign in with Buffer is the main path once a client id is configured; the API key stays as a fallback.
    $('oauthBtn').hidden = !CFG.BUFFER_CLIENT_ID;
    $('keyDetails').open = !CFG.BUFFER_CLIENT_ID;
    $('connectDialog').showModal();
  }

  function disconnect() {
    try { localStorage.removeItem(KEY_STORE); } catch {}
    try { BufferConnection.clearTokens(); } catch {}
    state.mode = 'demo';
    state.demoClear = false;
    toast('Disconnected. Back to the demo.');
    $('orgSelect').hidden = true;
    run();
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      state.filter = f.dataset.filter === state.filter && f.classList.contains('count') ? 'all' : f.dataset.filter;
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === state.filter));
      renderQueue();
      return;
    }
    const show = e.target.closest('[data-show]');
    if (show) {
      const el = document.getElementById(`news-${show.dataset.show}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 1600); }
    }
    const dr = e.target.closest('[data-draft]');
    if (dr) { confirmDraft([dr.dataset.draft]); return; }
    const mu = e.target.closest('[data-mute]');
    if (mu) { prefs.muted = [...new Set([...(prefs.muted || []), mu.dataset.mute])]; savePrefs(prefs); state.autoWatch = (state.autoWatch || []).filter(t => t !== mu.dataset.mute); renderAutoChips(); return; }
    if (e.target.closest('[data-unmute-all]')) { prefs.muted = []; savePrefs(prefs); state.autoWatch = autoTerms(state.posts); renderAutoChips(); return; }
    const aq = e.target.closest('[data-ask-ai]');
    if (aq) { askAI([aq.dataset.askAi]); return; }
    const ur = e.target.closest('[data-use-rw]');
    if (ur) { suggestRewrite(ur.dataset.useRw); return; }
    const ar = e.target.closest('[data-ai-rw]');
    if (ar) { suggestRewrite(ar.dataset.aiRw); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { startEdit(ed.dataset.edit); return; }
    const sv = e.target.closest('[data-save]');
    if (sv) { saveEdit(sv.dataset.save, false); return; }
    const sd = e.target.closest('[data-save-draft]');
    if (sd) { saveEdit(sd.dataset.saveDraft, true); return; }
    if (e.target.closest('[data-cancel-edit]')) { state.editing = null; renderQueue(); return; }
    const pb = e.target.closest('[data-push]');
    if (pb) { pushBack(pb.dataset.push); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copyForClient(cp.dataset.copy); return; }
    const fb = e.target.closest('[data-feedback]');
    if (fb) { feedback(fb.dataset.feedback, fb.dataset.id); return; }
    const act = e.target.closest('[data-action]');
    if (act?.dataset.action === 'connect') openConnect();
    if (act?.dataset.action === 'demo') showDemo(false); // keeps the Buffer connection
    if (act?.dataset.action === 'retry') run();
    const post = e.target.closest('.post[data-id]');
    if (post && !e.target.closest('a,button,textarea,.editor')) {
      state.selected = state.selected === post.dataset.id ? null : post.dataset.id;
      render();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id !== 'editText') return;
    state.draftText = e.target.value;
    const post = state.posts.find(p => p.id === state.editing);
    if (post) $('liveCheck').innerHTML = liveCheckHtml(post, state.draftText);
  });

  $('connectBtn').addEventListener('click', () => (state.mode === 'live' ? disconnect() : isConnected() ? backToQueue() : openConnect()));
  $('bannerConnect').addEventListener('click', () => (isConnected() ? backToQueue() : openConnect()));
  $('moreMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const act = b.dataset.open;
    if (act === 'demo') state.mode === 'demo' ? backToQueue() : showDemo(false);
    if (act === 'preview') showDemo(!state.demoClear);
    if (act === 'share') shareApp();
    if (act === 'disconnect') disconnect();
    if (act === 'fineprint' && window.TooSoonAgree) TooSoonAgree.open(true);
  });
  $('recheckBtn').addEventListener('click', run);
  $('opinionBtn').addEventListener('click', secondOpinion);
  $('holdAllBtn').addEventListener('click', () => confirmDraft(state.posts.filter(p => !handled(p.id) && verdictFor(p.id) === 'too_soon').map(p => p.id)));
  $('orgSelect').addEventListener('change', e => { localStorage.setItem(ORG_STORE, e.target.value); run(); });

  $('oauthBtn').addEventListener('click', async () => {
    $('oauthBtn').disabled = true;
    $('oauthBtn').textContent = 'Opening Buffer…';
    try {
      await BufferOAuth.startAuthorization({ prefix: CFG.prefix, clientId: CFG.BUFFER_CLIENT_ID, redirectUri: `${location.origin}/auth/callback.html`, scope: CFG.scope, returnTo: '/app.html' });
    } catch (err) { toast(err.message); $('oauthBtn').disabled = false; $('oauthBtn').textContent = 'Sign in with Buffer'; }
  });
  $('keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('keySave').click(); } });
  $('keySave').addEventListener('click', () => {
    const key = $('keyInput').value.trim();
    if (!key) { $('keyInput').focus(); return; }
    localStorage.setItem(KEY_STORE, key);
    $('keyInput').value = '';
    $('connectDialog').close();
    state.mode = 'live';
    run();
  });

  $('settingsBtn').addEventListener('click', () => {
    $('watchInput').value = prefs.watch.join(', ');
    renderAutoChips();
    $('areaInput').value = prefs.area || '';
    $('cityInput').value = prefs.city || '';
    $('sensInput').value = sensitivity();
    $('sensFor').textContent = state.mode === 'demo' ? 'the demo' : state.orgName || 'this organization';
    $('webhookInput').value = prefs.webhook || '';
    $('aiProviderInput').value = prefs.aiProvider || 'gemini';
    $('aiKeyInput').value = prefs.aiKey || '';
    $('digestInput').checked = !!prefs.digest;
    $('utmInput').checked = !!prefs.utm;
    document.querySelectorAll('[data-source]').forEach(cb => { cb.checked = cb.dataset.source === 'days' ? !!prefs.days : (prefs.sources || []).includes(cb.dataset.source); });
    $('ignoreInput').value = prefs.ignore.join(', ');
    $('settingsDialog').showModal();
  });
  $('settingsSave').addEventListener('click', () => {
    const split = v => v.split(',').map(s => s.trim()).filter(Boolean);
    prefs = { ...prefs, watch: split($('watchInput').value).slice(0, 5), ignore: split($('ignoreInput').value).map(s => s.toLowerCase()), area: $('areaInput').value, city: $('cityInput').value.trim().slice(0, 60),
      sources: [...document.querySelectorAll('[data-source]:checked')].map(cb => cb.dataset.source).filter(s => s !== 'days'),
      days: !!document.querySelector('[data-source="days"]:checked'),
      sensitivity: { ...(prefs.sensitivity || {}), [orgKey()]: $('sensInput').value },
      aiProvider: $('aiProviderInput').value, aiKey: $('aiKeyInput').value.trim(),
      webhook: $('webhookInput').value.trim(), digest: $('digestInput').checked, utm: $('utmInput').checked };
    savePrefs(prefs);
    $('settingsDialog').close();
    run();
  });

  window.TooSoonApp = {
    state, get prefs() { return prefs; }, setPrefs(p) { prefs = p; savePrefs(p); }, esc, toast, render, run, evaluate,
    buffer, moveToDraft, confirmDraft, logSave, sendAlert, summaryText, loadOrg, verdictFor, handled, dayLabel, timeLabel,
    isConnected, shareApp, SERVICE_ICON,
    get logKey() { return LOG_STORE; },
  };

  // Re-check every 15 minutes while the tab is open and connected; keep "Checked Xm ago" fresh.
  setInterval(() => {
    renderChecked();
    if (state.mode === 'live' && !document.hidden && state.checkedAt && Date.now() - state.checkedAt > 15 * 60000) run();
  }, 60000);

  // Start: live if connected, unless ?demo
  const params = new URLSearchParams(location.search);
  state.mode = isConnected() && !params.has('demo') && !params.has('allclear') ? 'live' : 'demo';
  state.demoClear = params.has('allclear');
  run();
  if (params.has('connect') && !isConnected()) setTimeout(openConnect, 300);
})();
