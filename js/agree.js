// agree.js — the "we get it, but it's still on you" agreement. Shown once per browser,
// before the demo, the tour or Sign in with Buffer. Reopen any time from More → The fine print.
(function () {
  'use strict';
  const KEY = 'toosoon_agree_v1';
  const has = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  let resolveAgreed;
  const agreed = new Promise(r => { resolveAgreed = r; });
  if (has()) resolveAgreed();

  function open(reread) {
    const d = document.getElementById('agreeDialog');
    if (!d) return;
    const box = d.querySelector('#agreeCheck'), go = d.querySelector('#agreeGo');
    d.classList.toggle('reread', !!reread);
    box.checked = !!reread || has();
    go.disabled = !box.checked;
    go.textContent = reread ? 'Got it' : 'Let’s read the room';
    if (!d.open) d.showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('agreeDialog');
    if (!d) return;
    const box = d.querySelector('#agreeCheck'), go = d.querySelector('#agreeGo');
    box.addEventListener('change', () => { go.disabled = !box.checked; });
    // First time through, this one can't be waved away with Escape.
    d.addEventListener('cancel', e => { if (!has()) e.preventDefault(); });
    go.addEventListener('click', () => {
      try { localStorage.setItem(KEY, '1'); } catch {}
      d.close();
      resolveAgreed();
    });
    if (!has()) open(false);
  });

  window.TooSoonAgree = { agreed, has, open };
})();
