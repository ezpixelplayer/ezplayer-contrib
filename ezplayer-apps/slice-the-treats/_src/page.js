  const choice = { mode: 'solo' };
  // the pad stands for the matrix: a swipe is sent as up to 10 points (0 to 1 across and down), when the finger lifts or
  // every 300 ms during a long swipe; the treats in the air are drawn as the player last told us, with the swipe on top
  const pad = el('pad'), g2 = pad.getContext('2d');
  let stroke = [], strokeAt = 0, drawn = [], fade = [], padAspect = 1;
  function padSize() {
    const a = Math.max(0.4, Math.min(2.5, status.aspect || 1)), W = pad.clientWidth || 340;
    if (a !== padAspect || pad.width !== Math.round(W * 2)) { padAspect = a; pad.width = Math.round(W * 2); pad.height = Math.round(W * 2 / Math.max(0.6, a)); }
  }
  const pt = (e) => { const r = pad.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000) / 1000, Math.round((e.clientY - r.top) / r.height * 1000) / 1000]; };
  function thin(list) { if (list.length <= 10) return list; const out = []; for (let i = 0; i < 10; i++) out.push(list[Math.round(i * (list.length - 1) / 9)]); return out; }
  function sendStroke(final) {
    if (stroke.length < 2) { if (final) stroke = []; return; }
    send({ type: 'cut', p: thin(stroke) });
    fade.push({ pts: stroke.slice(), at: Date.now() });
    stroke = final ? [] : [stroke[stroke.length - 1]]; strokeAt = Date.now();
  }
  const playing = () => meIndex() >= 0 && status.phase === 'playing';
  pad.addEventListener('pointerdown', (e) => { if (!playing()) return; e.preventDefault(); pad.setPointerCapture(e.pointerId); stroke = [pt(e)]; strokeAt = Date.now(); });
  pad.addEventListener('pointermove', (e) => { if (!stroke.length) return; const p = pt(e), q = stroke[stroke.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) stroke.push(p); if (Date.now() - strokeAt > 300) sendStroke(false); });
  const up = () => { if (stroke.length) sendStroke(true); };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
  function padDraw() {
    padSize();
    const W = pad.width, H = pad.height, now = Date.now();
    g2.clearRect(0, 0, W, H);
    for (const [x, y, k] of (playing() ? status.air || [] : [])) {
      g2.fillStyle = k === 'c' ? '#6b6b75' : k === 's' ? '#ffc83c' : '#ff5a8a';
      g2.globalAlpha = 0.55; g2.beginPath(); g2.arc(x * W, y * H, W * 0.045, 0, 6.283); g2.fill(); g2.globalAlpha = 1;
    }
    fade = fade.filter((f) => now - f.at < 500);
    for (const f of [...fade, { pts: stroke, at: now }]) {
      if (f.pts.length < 2) continue;
      g2.strokeStyle = 'rgba(255,255,255,' + (1 - (now - f.at) / 500) + ')'; g2.lineWidth = 8; g2.lineCap = 'round'; g2.lineJoin = 'round';
      g2.beginPath(); g2.moveTo(f.pts[0][0] * W, f.pts[0][1] * H); for (const p of f.pts.slice(1)) g2.lineTo(p[0] * W, p[1] * H); g2.stroke();
    }
    requestAnimationFrame(padDraw);
  }
  requestAnimationFrame(padDraw);
  draw = () => {
    const s = status, m = me(), i = meIndex(), ps = s.players || [];
    const c = s.colors || ['ff3c3c', '3c8cff'];
    document.documentElement.style.setProperty('--c1', '#' + c[0]); document.documentElement.style.setProperty('--c2', '#' + c[1]);
    const modes = [['solo', '🍬 Alone'], s.friend !== false && ['friend', '🧑‍🤝‍🧑 With a friend']].filter(Boolean);
    if (!modes.some(([v]) => v === choice.mode)) choice.mode = 'solo';
    seg(el('modes'), modes, choice.mode, (v) => { choice.mode = v; });
    el('modes').classList.toggle('hidden', modes.length < 2);
    const busy = s.phase === 'waiting' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('join').classList.toggle('hidden', !(s.phase === 'waiting' && !m));
    el('go').classList.toggle('hidden', s.phase === 'waiting' && !m);
    el('setup').classList.toggle('hidden', !!m && busy);
    el('quit').classList.toggle('hidden', !(m && busy));
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    const two = ps.length > 1 || s.mode === 'friend';
    el('players').replaceChildren(...(two ? [0, 1] : [0]).map((k) => {
      const p = ps[k], sp = document.createElement('span');
      sp.textContent = (p ? p.name + (app && p.id === app.clientId ? ' (you)' : '') : k === 1 && s.phase === 'waiting' ? 'waiting…' : '—');
      sp.style.color = 'var(--c' + (k + 1) + ')'; return sp;
    }));
    const sc = s.score || [0, 0];
    el('score').innerHTML = two ? '<span style="color:var(--c1)">' + sc[0] + '</span><span>-</span><span style="color:var(--c2)">' + sc[1] + '</span>' : '<span style="color:var(--c1)">' + sc[0] + '</span>';
    el('clock').textContent = s.phase === 'playing' ? (s.startsIn ? 'Get ready… ' + s.startsIn : '⏱️ ' + s.left + ' s   ' + '❤️'.repeat(Math.max(0, s.lives || 0))) : '';
    el('coalHint').classList.toggle('hidden', s.coal === false);
    el('pad').classList.toggle('hidden', !playing());
    el('padHint').classList.toggle('hidden', !playing());
    const best = s.best || [];
    el('bestBox').classList.toggle('hidden', !best.length);
    el('best').replaceChildren(...best.map((b) => { const li = document.createElement('li'); li.textContent = b.name + ' — ' + b.score; return li; }));
    let t = s.message || '';
    if (s.phase === 'waiting' && m) t = 'Waiting for a friend: ask them to open this page and tap Join.';
    if (playing()) t = 'Swipe on the pad across the treats you see on the lights. Not the coal!';
    if (s.phase === 'over' && m) t = (ps.length === 1 || s.winner === i + 1 ? '🎉 ' : s.winner === 3 ? '🤝 ' : '😅 ') + s.message;
    say(t);
  };
  tickGame = () => status.phase === 'waiting' && status.waitEndsAt ? 'The game is open for ' + secsLeft(status.waitEndsAt) + ' s' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', mode: choice.mode, name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { send({ type: 'join', name: myName() }); say('Joining…'); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
