  // The phones count down on their own with the player's clock (nowMs: corrected by the skew from the status), so they
  // keep time with the lights; the app only says when the moment is (status.target).
  el('namePanel').classList.add('hidden');
  const p2 = (n) => String(n).padStart(2, '0');
  function clock(S) {
    const d = Math.floor(S / 86400), h = Math.floor(S / 3600) % 24, m = Math.floor(S / 60) % 60, s = S % 60;
    if (d) return d + 'd ' + p2(h) + ':' + p2(m) + ':' + p2(s);
    if (h) return h + ':' + p2(m) + ':' + p2(s);
    return m + ':' + p2(s);
  }
  let lastBig = '', lastCls = '-';
  function tick() {
    const s = status, big = el('big');
    let t = '—', cls = '';
    if (s.paused != null) { t = clock(Math.ceil(s.paused / 1000)); cls = 'long'; }
    else if (s.target != null) {
      const left = s.target - nowMs();
      if (left > 0) { const S = Math.ceil(left / 1000); t = S <= 10 ? String(S) : clock(S); cls = S <= 10 ? 'huge' : S >= 86400 ? 'long' : ''; }
      else if (nowMs() < (s.partyUntil || 0)) { t = s.greeting || '🎉'; cls = 'party'; }
    }
    if (t !== lastBig) { big.textContent = t; lastBig = t; }
    if (cls !== lastCls) { big.className = 'cdBig ' + cls; lastCls = cls; }
  }
  draw = () => {
    const s = status;
    document.documentElement.style.setProperty('--cc', '#' + (s.colour || 'ffc83c'));
    document.documentElement.style.setProperty('--cc2', '#' + (s.colour2 || s.colour || 'ffc83c'));
    el('emoji').textContent = s.emoji || '⏱️';
    el('label').textContent = s.paused != null ? '⏸ Stopped' : s.target != null ? (s.label || '') : '';
    el('when').textContent = s.target != null && s.when ? s.when : '';
    tick();
    say(s.message || '');
  };
  setInterval(tick, 100);
