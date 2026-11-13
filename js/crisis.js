// crisis.js — Go dark, holding statements, restore list, saves report, all clients, alerts.
(function () {
  'use strict';

  const A = window.TooSoonApp;
  const R = window.TooSoonRules;
  const T = window.TooSoonTemplates;
  const $ = id => document.getElementById(id);
  const esc = A.esc;
  const RESTORE = 'toosoon_restore';
  const TEXT_OK = ['twitter', 'x', 'threads', 'bluesky', 'linkedin', 'mastodon', 'facebook'];
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const when = iso => (iso ? `${A.dayLabel(iso)} · ${A.timeLabel(iso)}` : 'Unscheduled');
  const channelName = id => (A.state.channels.find(c => c.id === id) || {}).name || 'Channel';

  // ---------- More menu ----------
  const menu = $('moreMenu');
  $('moreBtn').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; $('moreBtn').setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) menu.hidden = true; });
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    menu.hidden = true;
    const fn = ({ statements: openStatements, restore: openRestore, saves: openSaves, clients: openClients, digest: sendDigest })[b.dataset.open];
    if (fn) fn();
  });

  // ---------- Go dark ----------
  function darkCandidates() {
    const hrs = Number($('darkWindow').value);
    const until = Date.now() + hrs * 3600e3;
    return A.state.posts.filter(p => !A.handled(p.id) && p.dueAt && new Date(p.dueAt).getTime() <= until);
  }
  function paintDark() {
    const list = darkCandidates();
    $('darkList').innerHTML = list.length
      ? list.map(p => `<li><label><input type="checkbox" checked data-dark="${esc(p.id)}"><span>${esc(String(p.text).slice(0, 110))}${String(p.text).length > 110 ? '…' : ''}<small>${esc(channelName(p.channelId))} · ${esc(when(p.dueAt))}</small></span></label></li>`).join('')
      : '<li class="fine">Nothing scheduled in that window. You’re already dark.</li>';
    $('darkConfirm').textContent = list.length ? `Pull ${list.length} post${list.length > 1 ? 's' : ''} to drafts` : 'Nothing to pull';
    $('darkConfirm').disabled = !list.length;
  }
  $('goDarkBtn').addEventListener('click', () => {
    $('darkChecklist').innerHTML = T.CHECKLIST.map(x => `<li>${esc(x)}</li>`).join('');
    paintDark();
    $('darkDialog').showModal();
  });
  $('darkWindow').addEventListener('change', paintDark);
  $('darkList').addEventListener('change', () => {
    const n = document.querySelectorAll('[data-dark]:checked').length;
    $('darkConfirm').textContent = n ? `Pull ${n} post${n > 1 ? 's' : ''} to drafts` : 'Nothing selected';
    $('darkConfirm').disabled = !n;
  });
  $('darkConfirm').addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('[data-dark]:checked')].map(x => x.dataset.dark);
    $('darkDialog').close();
    await A.moveToDraft(ids);
    const moved = ids.filter(id => A.state.held[id]);
    if (!moved.length) return;
    const list = read(RESTORE, []);
    const org = A.state.mode === 'demo' ? 'Demo' : A.state.orgName;
    moved.forEach(id => {
      const p = A.state.posts.find(x => x.id === id);
      if (p && !list.some(x => x.id === id)) list.push({ id, text: p.text, channel: channelName(p.channelId), dueAt: p.dueAt, at: Date.now(), org });
    });
    write(RESTORE, list);
    write('toosoon_dark_at', Date.now());
    paintBanner();
    A.sendAlert?.(`🌑 Went dark${org ? ` for ${org}` : ''}: ${moved.length} post${moved.length > 1 ? 's' : ''} pulled to drafts.`);
    openStatements();
  });

  // Demo entries only count while the demo posts are still held (the demo resets on every check).
  const restoreList = () => read(RESTORE, []).filter(x => x.org !== 'Demo' || A.state.held[x.id]);
  function paintBanner() {
    const list = restoreList();
    const at = read('toosoon_dark_at', 0);
    if (!list.length) { $('darkBanner').hidden = true; return; }
    $('darkBanner').hidden = false;
    $('darkBanner').innerHTML = `<span>🌑 ${at ? `You went dark ${new Date(at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. ` : ''}${list.length} post${list.length > 1 ? 's are' : ' is'} waiting in your Buffer drafts.</span><button class="btn small" type="button" data-open-restore>Restore list</button>`;
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-open-restore]')) openRestore(); });

  // ---------- Restore list ----------
  function openRestore() {
    const list = restoreList();
    $('restoreList').innerHTML = list.length
      ? list.map((x, i) => `<div class="restore-row"><div>${esc(String(x.text).slice(0, 120))}${String(x.text).length > 120 ? '…' : ''}<small>${esc(x.org || '')} · ${esc(x.channel)} · was ${esc(when(x.dueAt))}</small></div><button class="btn ghost small" type="button" data-restored="${i}">Rescheduled ✓</button></div>`).join('')
      : '<p class="fine">Nothing waiting. When you pull posts to drafts with Go dark, they show up here.</p>';
    $('restoreDialog').open || $('restoreDialog').showModal();
  }
  $('restoreList').addEventListener('click', e => {
    const b = e.target.closest('[data-restored]');
    if (!b) return;
    const target = restoreList()[Number(b.dataset.restored)];
    write(RESTORE, read(RESTORE, []).filter(x => !(target && x.id === target.id)));
    paintBanner();
    openRestore();
  });
  $('restoreClear').addEventListener('click', () => { write(RESTORE, []); write('toosoon_dark_at', 0); paintBanner(); openRestore(); });

  // ---------- Holding statements ----------
  function stmtCheck() {
    const text = $('stmtText').value;
    const r = R.checkPost({ id: 'stmt', text }, A.state.headlines.filter(h => h.kind !== 'day'), { calendar: null });
    const tidy = R.tidy({ id: 'stmt', text }, {});
    const promo = /(\b(sale|shop|discount|code|deal|order|link in bio)\b|%\s*off)/i.test(text);
    const notes = [...(promo ? ['This reads like a promotion. Take the sales language out.'] : []), ...tidy];
    $('stmtCheck').innerHTML = notes.length
      ? `<span class="stamp look">Fix first</span> <span>${esc(notes[0])}</span>`
      : `<span class="stamp good">Plain and safe</span> <span>No promo language, no leftover brackets.</span>`;
    void r;
  }
  function openStatements() {
    $('stmtTemplate').innerHTML = T.TEMPLATES.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    const pick = () => { const t = T.TEMPLATES.find(x => x.id === $('stmtTemplate').value); $('stmtText').value = t.text; $('stmtWhen').textContent = t.when; stmtCheck(); };
    $('stmtTemplate').onchange = pick;
    pick();
    $('stmtDonts').innerHTML = T.DONTS.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('');
    const chans = A.state.channels;
    $('stmtChannels').innerHTML = chans.length
      ? chans.map(c => TEXT_OK.includes(c.service)
        ? `<label><input type="checkbox" data-chan="${esc(c.id)}" data-svc="${esc(c.service)}" checked> ${esc(c.name)} <small>(${esc(c.service)})</small></label>`
        : `<span class="off" title="Needs an image or video, so post this one from Buffer">${esc(c.name)} (${esc(c.service)}): needs media</span>`).join('')
      : '<span class="fine">Connect Buffer to pick channels.</span>';
    $('stmtDialog').open || $('stmtDialog').showModal();
  }
  $('stmtText').addEventListener('input', stmtCheck);
  $('stmtCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('stmtText').value); A.toast('Copied.'); } catch { window.prompt('Copy this:', $('stmtText').value); }
  });
  const CREATE = 'mutation CreatePost($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{id}} ... on MutationError{message}}}';
  $('stmtSend').addEventListener('click', async () => {
    const text = $('stmtText').value.trim();
    if (/\[[^\]]+\]/.test(text)) { A.toast('Fill in the [brackets] first.'); return; }
    const picks = [...document.querySelectorAll('[data-chan]:checked')];
    if (!text || !picks.length) { A.toast(text ? 'Pick at least one channel.' : 'Write something first.'); return; }
    const btn = $('stmtSend'); btn.disabled = true; btn.textContent = 'Adding…';
    let ok = 0; const fails = [];
    for (const cb of picks) {
      try {
        if (A.state.mode === 'demo') { await new Promise(r => setTimeout(r, 250)); ok++; continue; }
        const input = { channelId: cb.dataset.chan, text, schedulingType: 'automatic', mode: 'addToQueue', saveToDraft: true };
        if (cb.dataset.svc === 'facebook') input.metadata = { facebook: { type: 'post' } };
        const res = (await A.buffer(CREATE, { input }))?.createPost;
        if (res?.__typename === 'PostActionSuccess') ok++; else fails.push(res?.message || 'rejected');
      } catch (err) { fails.push(err.message); }
    }
    btn.disabled = false; btn.textContent = 'Add to Buffer drafts';
    if (ok) A.logSave('Holding statement drafted', { text });
    A.toast(fails.length ? `Added ${ok}. ${fails.length} failed: ${fails[0]}` : `Added to ${ok} channel${ok > 1 ? 's' : ''} as drafts. Post it from Buffer when you’re ready.`);
    if (!fails.length) $('stmtDialog').close();
  });

  // ---------- Saves report ----------
  function saves() { return read(A.logKey, []); }
  function openSaves() {
    const log = saves();
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const thisMonth = log.filter(x => x.ts >= month.getTime());
    const by = k => thisMonth.filter(x => x.action.startsWith(k)).length;
    $('savesStats').innerHTML = [
      [thisMonth.length, `Saves in ${month.toLocaleDateString('en-US', { month: 'long' })}`],
      [by('Pulled'), 'Pulled to drafts'], [by('Pushed'), 'Pushed back'], [by('Rewrote'), 'Rewritten'], [by('Holding'), 'Statements drafted'],
    ].map(([n, l]) => `<div><b>${n}</b><span>${esc(l)}</span></div>`).join('');
    $('savesList').innerHTML = log.length
      ? log.slice().reverse().slice(0, 40).map(x => `<div class="save-row"><div>${esc(x.text)}<small>${esc(new Date(x.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${esc(x.org)}${x.reason ? ` · ${esc(x.reason)}` : ''}</small></div><span class="stamp held">${esc(x.action)}</span></div>`).join('')
      : '<p class="fine">No saves yet. Every pull, push and rewrite will be logged here.</p>';
    $('savesDialog').showModal();
  }
  $('savesCsv').addEventListener('click', () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Organization', 'Action', 'Post', 'Reason'], ...saves().map(x => [new Date(x.ts).toISOString(), x.org, x.action, x.text, x.reason])];
    const blob = new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `too-soon-saves-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ---------- All clients ----------
  async function openClients() {
    $('clientsDialog').showModal();
    const orgs = A.state.orgs || [];
    if (A.state.mode !== 'live' || orgs.length < 2) {
      $('clientsList').innerHTML = `<p class="fine">${A.state.mode !== 'live' ? 'Connect Buffer to see every organization you manage.' : 'You only have one Buffer organization. Add clients in Buffer and they’ll show up here.'}</p>`;
      return;
    }
    $('clientsList').innerHTML = '<p class="fine">Checking every organization…</p>';
    const rows = [];
    for (const o of orgs) {
      try {
        const { posts } = await A.loadOrg(o.id);
        const res = R.checkQueue(posts, A.state.headlines, { calendar: window.TooSoonCalendar, sensitivity: (A.prefs.sensitivity || {})[o.id] || 'normal' });
        rows.push({ o, n: posts.length, red: res.filter(r => r.verdict === 'too_soon').length, look: res.filter(r => r.verdict === 'look').length });
      } catch (err) { rows.push({ o, error: err.message }); }
      $('clientsList').innerHTML = table(rows);
    }
  }
  function table(rows) {
    return `<table class="clients-table"><thead><tr><th>Organization</th><th>Scheduled</th><th>Too soon</th><th>Look</th><th></th></tr></thead><tbody>${rows.sort((a, b) => (b.red || 0) - (a.red || 0)).map(r => r.error
      ? `<tr><td>${esc(r.o.name)}</td><td colspan="4" class="fine">Couldn’t load: ${esc(r.error)}</td></tr>`
      : `<tr><td>${esc(r.o.name)}</td><td>${r.n}</td><td class="${r.red ? 'red' : ''}">${r.red}</td><td class="${r.look ? 'amber' : ''}">${r.look}</td><td><button class="btn ghost small" type="button" data-org="${esc(r.o.id)}">Open</button></td></tr>`).join('')}</tbody></table>`;
  }
  $('clientsList').addEventListener('click', e => {
    const b = e.target.closest('[data-org]');
    if (!b) return;
    $('clientsDialog').close();
    const sel = $('orgSelect');
    sel.value = b.dataset.org;
    sel.dispatchEvent(new Event('change'));
  });

  // ---------- Alerts ----------
  async function sendDigest() {
    if (!A.prefs.webhook) { A.toast('Add a Slack or Discord webhook in Settings first.'); return; }
    const r = await A.sendAlert(A.summaryText());
    A.toast(r.ok ? 'Summary sent.' : `Couldn’t send: ${r.error || r.status}`);
  }
  $('webhookTest').addEventListener('click', async () => {
    const url = $('webhookInput').value.trim();
    if (!url) { A.toast('Paste a webhook URL first.'); return; }
    try {
      const res = await fetch('/.netlify/functions/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, text: '👋 Too Soon? is connected. We’ll ping this channel when a scheduled post turns “too soon.”' }) });
      const d = await res.json();
      A.toast(d.ok ? `Test sent to ${d.kind === 'slack' ? 'Slack' : 'Discord'}.` : `Couldn’t send: ${d.error || d.status}`);
    } catch { A.toast('Couldn’t reach the alert service.'); }
  });

  // Hide "All clients" until we know there are several orgs.
  const syncClients = () => { $('clientsItem').hidden = !(A.state.mode === 'live' && (A.state.orgs || []).length > 1); };
  setInterval(() => { syncClients(); paintBanner(); }, 2000);
  syncClients();
  paintBanner();
})();
