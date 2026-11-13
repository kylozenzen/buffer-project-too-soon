// tour.js — a short guided walkthrough of demo mode that ends on "Connect Buffer".
(function () {
  'use strict';

  const SEEN = 'toosoon_tour_v1';
  const A = window.TooSoonApp;
  const $ = s => document.querySelector(s);
  const visible = el => el && el.offsetParent !== null && !el.hidden;

  const STEPS = [
    { el: () => $('#summary'), title: 'The verdict on the whole queue', body: () => (A.state.mode === 'demo' ? 'This is a made-up coffee shop on a made-up news day. Four of its scheduled posts would land badly today.' : 'Your whole queue at a glance: too soon, worth a look, or good to go.') },
    { el: () => $('.news-col'), title: 'What’s happening right now', body: 'Today’s headlines, severe weather, people in the news, trending searches, recalls and sensitive days. Tap any story to open it.' },
    { el: () => $('.post.too_soon .reasons'), title: 'Every flag says why', body: 'No mystery scores. Tap the reason and it jumps to the headline that caused it.' },
    { el: () => $('.post.too_soon .post-actions'), title: 'Fix it right here', body: 'Rewrite it with a live check, push it back a day, or pull it to drafts. Nothing ever gets deleted.' },
    { el: () => $('.post.too_soon [data-ask-ai]') || (visible($('#opinionBtn')) ? $('#opinionBtn') : null), title: '✨ This is where AI comes in', body: 'Rules check every post for free. Ask AI and it reads the flagged post next to today’s headlines, explains the risk in one line and drafts a rewrite you can use or ignore.' },
    { el: () => $('#goDarkBtn'), title: 'For the really bad days', body: 'Go dark pulls everything coming up to drafts in one tap and helps you write a holding statement.' },
    { el: () => (A.state.mode === 'demo' && !A.isConnected() ? $('#connectBtn') : null), title: 'Now try it on your posts', body: 'That’s the demo. Connect Buffer and Too Soon? checks your real queue the same way, every time you open it.', final: true },
    { el: () => (A.state.mode === 'live' || A.isConnected() ? $('#settingsBtn') : null), title: 'Make it yours', body: 'Set your city and state, pick news sources, add an AI key and connect Slack or Discord alerts.', final: true, live: true },
  ];

  let i = 0, steps = [], layer, ring, card;

  function build() {
    layer = document.createElement('div');
    layer.className = 'tour-layer';
    layer.innerHTML = '<div class="tour-ring"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
    document.body.appendChild(layer);
    ring = layer.querySelector('.tour-ring');
    card = layer.querySelector('.tour-card');
    layer.addEventListener('click', e => {
      const b = e.target.closest('[data-tour]');
      if (!b) return;
      const act = b.dataset.tour;
      if (act === 'next') go(i + 1);
      if (act === 'back') go(i - 1);
      if (act === 'skip' || act === 'done') end();
      if (act === 'connect') { end(); $('#connectBtn').click(); }
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!layer) return;
    if (e.key === 'Escape') end();
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  }

  function place() {
    if (!layer) return;
    const s = steps[i];
    const el = s && s.el();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const cw = Math.min(360, window.innerWidth - 24);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight || 180;
    let top = r.bottom + 16;
    if (top + ch > window.innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 12);
    if (r.height > window.innerHeight * 0.6) { top = Math.min(window.innerHeight - ch - 12, Math.max(12, r.top + 20)); left = r.right + 16 + cw < window.innerWidth ? r.right + 16 : Math.max(12, r.left - cw - 16); }
    Object.assign(card.style, { top: `${top}px`, left: `${left}px` });
  }

  function go(n) {
    if (n < 0) return;
    if (n >= steps.length) { end(); return; }
    i = n;
    const s = steps[i];
    const el = s.el();
    if (!el) { go(n + 1); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.innerHTML = `
      <div class="tour-count">${i + 1} of ${steps.length}</div>
      <h3>${s.title}</h3>
      <p>${typeof s.body === 'function' ? s.body() : s.body}</p>
      <div class="tour-actions">
        ${s.final
          ? (s.live ? `<span></span><button type="button" class="btn small" data-tour="done">Done</button>` : `<button type="button" class="linkish" data-tour="done">Keep exploring the demo</button><button type="button" class="btn red small" data-tour="connect">Connect Buffer</button>`)
          : `<button type="button" class="linkish" data-tour="skip">Skip tour</button><span>${i ? '<button type="button" class="btn ghost small" data-tour="back">Back</button> ' : ''}<button type="button" class="btn small" data-tour="next">Next</button></span>`}
      </div>`;
    setTimeout(place, 50); setTimeout(place, 400);
    card.querySelector('[data-tour="next"], [data-tour="connect"]')?.focus({ preventScroll: true });
  }

  function start() {
    if (layer || document.querySelector('dialog[open]')) return;
    steps = STEPS.filter(s => s.el());
    if (!steps.length) return;
    build();
    go(0);
  }
  function end() {
    try { localStorage.setItem(SEEN, '1'); } catch {}
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    document.removeEventListener('keydown', onKey);
    layer?.remove(); layer = null;
  }

  // One walkthrough: starts by itself on the first demo visit; the ? button replays it any time.
  function maybeStart(force) {
    if (!force && A.state.mode !== 'demo') return;
    let seen = false;
    try { seen = !!localStorage.getItem(SEEN); } catch {}
    if (!force && seen) return;
    const wait = () => (A.state.posts.length ? setTimeout(start, 500) : setTimeout(wait, 200));
    wait();
  }
  const q = new URLSearchParams(location.search);
  if (!q.has('connect')) maybeStart(q.has('tour'));
  $('#helpBtn')?.addEventListener('click', () => maybeStart(true));
  document.querySelector('[data-open="tour"]')?.addEventListener('click', () => { $('#moreMenu').hidden = true; maybeStart(true); });

  // Gentle nudge after the first fix in demo mode.
  let nudged = false;
  document.addEventListener('click', e => {
    if (nudged || A.state.mode !== 'demo' || A.isConnected() || layer) return;
    if (!e.target.closest('[data-draft], [data-push], [data-save], [data-save-draft], #darkConfirm, #draftConfirm')) return;
    nudged = true;
    setTimeout(() => {
      const n = document.createElement('div');
      n.className = 'demo-nudge';
      n.innerHTML = `<b>Nice save ☕</b><p>That was a made-up coffee shop. Want to see what Too Soon? finds in your real queue?</p><div><button type="button" class="btn red small" data-nudge="connect">Connect Buffer</button> <button type="button" class="linkish" data-nudge="close">Later</button></div>`;
      document.body.appendChild(n);
      n.addEventListener('click', ev => {
        const b = ev.target.closest('[data-nudge]');
        if (!b) return;
        n.remove();
        if (b.dataset.nudge === 'connect') $('#connectBtn').click();
      });
    }, 1600);
  });
})();
