// allclear.js — the payoff when nothing is too soon: a workplace-safety style
// "days without a possible incident" sign, proof of what was checked, the closest call,
// a calm mug, and a shareable badge. The streak lives in this browser, per organization.
(function () {
  'use strict';

  const A = window.TooSoonApp;
  const R = window.TooSoonRules;
  const $ = id => document.getElementById(id);
  const esc = A.esc;
  const STORE = 'toosoon_streak';
  const DAY = 86400000;

  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysSince = s => { if (!s) return 0; const [y, m, d] = s.split('-').map(Number); return Math.max(0, Math.round((today() - new Date(y, m - 1, d)) / DAY)); };

  // Demo streak: lives in memory so showing it off never touches real numbers.
  const demoStreak = () => ({ since: iso(new Date(today() - 12 * DAY)), record: 23 });
  let demoMem = null;

  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } }
  function save(all) { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch {} }

  // Runs once per check (not on every re-render after a fix).
  let lastRun = null;
  let current = { days: 0, record: 0, reset: null, first: false };

  function updateStreak(tooSoon) {
    const demo = A.state.mode === 'demo';
    const key = demo ? 'demo' : A.state.orgId || 'default';
    let all = demo ? null : load();
    let s;
    if (demo) {
      if (!demoMem || A.state.demoClear) demoMem = A.state.demoClear ? { since: iso(new Date(today() - 23 * DAY)), record: 41 } : demoStreak();
      s = demoMem;
    } else {
      s = all[key];
    }
    let first = false;
    if (!s) { s = { since: iso(today()), record: 0 }; first = true; }
    const before = daysSince(s.since);
    let reset = null;
    if (tooSoon > 0) {
      if (before > 0 || first) reset = { from: before };
      s.record = Math.max(s.record || 0, before);
      s.since = iso(today());
      s.lastIncident = iso(today());
    }
    if (demo) demoMem = s; else { all[key] = s; save(all); }
    current = { days: daysSince(s.since), record: Math.max(s.record || 0, daysSince(s.since)), reset: reset && reset.from > 0 ? reset : null, first, caughtToday: s.lastIncident === iso(today()) };
    return current;
  }

  // ---------- proof of work ----------
  function proofLine(n) {
    const hs = A.state.headlines || [];
    const by = k => hs.filter(h => (Array.isArray(k) ? k.includes(h.kind) : h.kind === k)).length;
    const parts = [
      [by(['news', 'watch', 'mention']), 'headline', 'headlines'],
      [by('alert'), 'weather or disaster alert', 'weather and disaster alerts'],
      [by('trend'), 'trending search', 'trending searches'],
      [by('people'), 'person in the news', 'people in the news'],
      [by('recall'), 'product recall', 'product recalls'],
      [by('day'), 'sensitive day', 'sensitive days'],
    ].filter(p => p[0] > 0).map(([c, one, many]) => `<b>${c}</b> ${c === 1 ? one : many}`);
    const links = Object.keys(A.state.pageResults || {}).length;
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'today’s news';
    return `Checked <b>${n}</b> ${n === 1 ? 'post' : 'posts'} against ${list}${links ? `, and opened <b>${links}</b> ${links === 1 ? 'link' : 'links'}` : ''}.`;
  }

  // ---------- closest call ----------
  function closestCall() {
    // Light stories only: nothing tragic and no emergency alerts next to a smiling mug.
    const isHeavy = h => h.kind === 'alert' || (h.weight || R.headlineWeight(h.title || '')) === 'tragedy';
    const hs = (A.state.headlines || []).filter(h => h.kind !== 'day' && !isHeavy(h));
    const posts = A.state.posts.filter(p => !A.handled(p.id));
    const rank = h => (h.kind === 'alert' ? 3 : (h.weight || R.headlineWeight(h.title || '')) === 'tragedy' ? 4 : (h.weight || R.headlineWeight(h.title || '')) === 'controversy' ? 2 : 1);
    let best = null;
    posts.forEach(p => {
      const e = R.extractEntities(p.text, true);
      [...e.full, ...e.partial].forEach(term => {
        if (term.length < 4) return;
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        hs.forEach(h => {
          if (!re.test(h.title || '')) return;
          const score = rank(h) * 10 + term.length;
          if (!best || score > best.score) best = { post: p, term: e.display[term] || (String(p.text).match(re) || [term])[0], h, score };
        });
      });
    });
    const ch = p => (A.state.channels.find(c => c.id === p.channelId) || {});
    if (best) {
      const c = ch(best.post);
      const when = `${A.dayLabel(best.post.dueAt)} ${(A.SERVICE_ICON[c.service] || '')} ${c.name || ''}`.replace(/\s+/g, ' ').trim();
      return `<b>Closest call:</b> your ${esc(when)} post mentions “${esc(best.term)}”, and so does ${best.h.url ? `<a href="${esc(best.h.url)}" target="_blank" rel="noopener">“${esc(best.h.title)}”</a>` : `“${esc(best.h.title)}”`}. Different story, so you’re fine.`;
    }
    const day = (A.state.headlines || []).find(h => h.kind === 'day');
    if (day) return `<b>On the calendar:</b> ${esc(day.title)}. Nothing in your queue is selling on it.`;
    return '';
  }

  // ---------- the calm mug (original art) ----------
  const MUG = `<svg class="calm-mug" viewBox="0 0 120 120" aria-hidden="true">
    <g class="steam" fill="none" stroke="#161412" stroke-width="3" stroke-linecap="round" opacity=".55">
      <path d="M46 30c-6-7 6-11 0-19"/><path d="M60 28c-6-7 6-11 0-19"/><path d="M74 30c-6-7 6-11 0-19"/>
    </g>
    <path d="M86 52h8a14 14 0 0 1 0 28h-8" fill="none" stroke="#161412" stroke-width="5"/>
    <rect x="28" y="40" width="62" height="64" rx="12" fill="#f6f1e7" stroke="#161412" stroke-width="5"/>
    <rect x="28" y="40" width="62" height="12" rx="6" fill="#4a3426"/>
    <path d="M44 70q5 5 10 0M64 70q5 5 10 0" fill="none" stroke="#161412" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 84q9 7 18 0" fill="none" stroke="#161412" stroke-width="4" stroke-linecap="round"/>
    <circle cx="41" cy="80" r="4" fill="#e5432b" opacity=".35"/><circle cx="77" cy="80" r="4" fill="#e5432b" opacity=".35"/>
  </svg>`;

  // ---------- flip-counter ----------
  function digits(n) { return String(n).padStart(2, '0').split('').map(d => `<span class="flip" data-d="${d}">0</span>`).join(''); }
  function spin(root) {
    root.querySelectorAll('.flip').forEach((el, i) => {
      const target = Number(el.dataset.d);
      let k = 0;
      const steps = target + 10 * (i === 0 ? 0 : 1);
      if (!steps) { el.textContent = '0'; return; }
      const tick = () => {
        k++;
        el.textContent = String(k % 10);
        el.classList.remove('flipping'); void el.offsetWidth; el.classList.add('flipping');
        if (k < steps) setTimeout(tick, 40 + (k / steps) * 70); else el.textContent = String(target);
      };
      setTimeout(tick, 250 + i * 120);
    });
  }

  // ---------- sad trombone (only after the person has interacted) ----------
  function trombone() {
    try {
      if (!(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [[311, 0, .45], [293, .5, .45], [277, 1, .45], [262, 1.5, 1.1]];
      notes.forEach(([f, t, d]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 900;
        o.frequency.setValueAtTime(f, ctx.currentTime + t);
        if (d > 1) { o.frequency.linearRampToValueAtTime(f * .94, ctx.currentTime + t + d); const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 6; vg.gain.value = 6; v.connect(vg).connect(o.frequency); v.start(ctx.currentTime + t); v.stop(ctx.currentTime + t + d); }
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(.12, ctx.currentTime + t + .05);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + d);
        o.connect(lp).connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d + .05);
      });
      setTimeout(() => ctx.close(), 3200);
    } catch {}
  }

  // ---------- render ----------
  function render({ counts, heldCount, n }) {
    const runId = A.state.checkedAt;
    let fresh = false;
    if (runId && runId !== lastRun) { lastRun = runId; fresh = true; updateStreak(counts.too_soon); }

    const note = $('streakNote');
    if (counts.too_soon && current.reset) {
      note.hidden = false;
      note.innerHTML = `Days without a possible incident: <s>${current.reset.from}</s> → <b>0</b>. A post needs fixing first.`;
      const heavyToday = A.state.posts.some(p => A.verdictFor(p.id) === 'too_soon' && (A.state.results[p.id]?.reasons || []).some(r => r.heavy || r.level === 'too_soon' && /alert/i.test(r.text)));
      if (fresh && !heavyToday) trombone();
    } else note.hidden = true;

    const box = $('allClear');
    const clear = n > 0 && !counts.too_soon && !counts.look;
    if (!clear) { box.hidden = true; box.dataset.shown = ''; return; }

    const savedToday = heldCount > 0 || current.caughtToday;
    const head = current.first && !savedToday ? 'The counter starts today. Day 1 is tomorrow.'
      : current.days === 0 && savedToday ? `Saved it. The record still stands at ${current.record} ${current.record === 1 ? 'day' : 'days'}.`
      : current.days >= current.record && current.days > 0 ? 'New record. Somebody get this team a cake.'
      : `Previous record: ${current.record} ${current.record === 1 ? 'day' : 'days'}.`;
    const quips = ['Nothing to apologize for today.', 'Your queue reads the room.', 'No crisis comms required.', 'The intern can keep their phone.', 'Go ahead, refill the coffee.'];
    const quip = savedToday ? 'Crisis averted. Nothing left to apologize for.' : quips[new Date().getDate() % quips.length];
    const cc = closestCall();

    box.hidden = false;
    box.innerHTML = `
      <div class="ac-sign" role="img" aria-label="${current.days} days without a possible incident">
        <div class="ac-sign-top">⚠ Social safety board</div>
        <div class="ac-count">${digits(current.days)}</div>
        <div class="ac-label">days without a<br>possible incident</div>
        <div class="ac-record">${esc(head)}</div>
      </div>
      <div class="ac-body">
        <div class="ac-hello">${MUG}<h3>${esc(quip)}</h3></div>
        <p class="ac-proof">${proofLine(n)}</p>
        ${cc ? `<p class="ac-close">${cc}</p>` : ''}
        <p class="ac-fine">${A.state.mode === 'demo' ? 'Demo numbers. Your real streak starts when you connect.' : 'Counted in this browser. It resets to 0 the day a too-soon post shows up in your queue.'}</p>
        <div class="ac-actions">
          <button type="button" class="btn small" data-ac="badge">Share my streak</button>
          <button type="button" class="btn ghost small" data-ac="app">Share Too Soon? 🔗</button>
        </div>
      </div>`;
    if (box.dataset.shown !== String(runId) + heldCount) { box.dataset.shown = String(runId) + heldCount; spin(box); box.querySelector('.calm-mug')?.classList.add('pop'); }
    else box.querySelectorAll('.flip').forEach(el => { el.textContent = el.dataset.d; });
  }

  // ---------- share badge (canvas → PNG) ----------
  async function badge() {
    await Promise.all(['800 60px "Bricolage Grotesque"', '500 28px Inter', '700 24px Inter'].map(f => document.fonts.load(f).catch(() => {})));
    const W = 1200, H = 630, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const disp = '"Bricolage Grotesque", system-ui, sans-serif', body = 'Inter, system-ui, sans-serif';
    g.fillStyle = '#f6f1e7'; g.fillRect(0, 0, W, H);
    // safety sign
    const sx = 70, sy = 70, sw = 520, sh = 490;
    g.fillStyle = '#161412'; rr(g, sx + 10, sy + 12, sw, sh, 28); g.fill();
    g.fillStyle = '#fff'; rr(g, sx, sy, sw, sh, 28); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#161412'; rr(g, sx, sy, sw, sh, 28); g.stroke();
    g.fillStyle = '#2e8f62'; rr(g, sx + 3, sy + 3, sw - 6, 74, 25); g.fill(); g.fillRect(sx + 3, sy + 50, sw - 6, 27);
    g.fillStyle = '#fff'; g.font = `800 30px ${disp}`; g.textAlign = 'center';
    g.fillText('⚠  SOCIAL SAFETY BOARD', sx + sw / 2, sy + 50);
    const num = String(current.days).padStart(2, '0');
    const dw = 150, gap = 18, total = num.length * dw + (num.length - 1) * gap;
    num.split('').forEach((d, i) => {
      const x = sx + (sw - total) / 2 + i * (dw + gap), y = sy + 110;
      g.fillStyle = '#161412'; rr(g, x, y, dw, 200, 18); g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y + 99, dw, 3);
      g.fillStyle = '#f6f1e7'; g.font = `800 170px ${disp}`; g.fillText(d, x + dw / 2, y + 165);
    });
    g.fillStyle = '#161412'; g.font = `800 40px ${disp}`;
    g.fillText('DAYS WITHOUT A', sx + sw / 2, sy + 375);
    g.fillText('POSSIBLE INCIDENT', sx + sw / 2, sy + 420);
    g.fillStyle = '#5b554d'; g.font = `500 24px ${body}`;
    g.fillText(`Record: ${current.record} ${current.record === 1 ? 'day' : 'days'}`, sx + sw / 2, sy + 462);
    // right side
    g.textAlign = 'left';
    g.fillStyle = '#e5432b'; g.font = `800 34px ${disp}`; g.fillText('Too Soon?', 660, 150);
    const saved = current.days === 0 && current.caughtToday;
    g.fillStyle = '#161412'; g.font = `800 54px ${disp}`;
    const y = wrap(g, saved ? 'Caught one before it went out.' : 'My queue passed the vibe check.', 660, 225, 480, 60);
    g.fillStyle = '#3a352f'; g.font = `500 26px ${body}`;
    wrap(g, 'Scheduled posts, checked against today’s news.', 660, Math.min(y + 24, 440), 480, 36);
    const host = window.TOOSOON_SHARE_HOST || location.host || 'Too Soon?';
    g.font = `700 24px ${body}`;
    const pw = Math.min(500, g.measureText(host).width + 60);
    g.fillStyle = '#161412'; rr(g, 660, 488, pw, 60, 30); g.fill();
    g.fillStyle = '#f6f1e7'; g.fillText(host, 690, 526);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'too-soon-streak.png', { type: 'image/png' });
    const text = current.days === 0 && current.caughtToday ? `Too Soon? caught a post before it went out today. Counter's back to 0, but nothing to apologize for ✅ ${location.origin}/` : `${current.days} ${current.days === 1 ? 'day' : 'days'} without a possible incident. My Buffer queue passed the Too Soon? check ✅ ${location.origin}/`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'Too Soon?' }); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'too-soon-streak.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text); A.toast('Badge downloaded and caption copied. Post away.'); } catch { A.toast('Badge downloaded.'); }
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, x, y, max, lh) {
    let line = '';
    text.split(' ').forEach(w => {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > max && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
    });
    g.fillText(line, x, y);
    return y + lh;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ac]');
    if (!b) return;
    if (b.dataset.ac === 'badge') badge();
    if (b.dataset.ac === 'app') A.shareApp();
  });

  window.TooSoonAllClear = { render, get streak() { return current; } };
  // app.js may already have rendered before this file loaded.
  if (A.state.checkedAt) A.render();
})();
