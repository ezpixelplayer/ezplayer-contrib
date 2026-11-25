  function turn(d) {
    if (!me() || !['ready', 'playing'].includes(status.phase)) return;
    try { navigator.vibrate && navigator.vibrate(15); } catch (e) {}
    send({ type: 'dir', d });
  }
  for (const b of el('pad').querySelectorAll('button')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); turn(+b.dataset.d); });
  let sx = 0, sy = 0, onButton = false;  // swipes anywhere on the pad (one that starts on an arrow is that arrow's tap only)
  el('pad').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; onButton = !!e.target.closest('button'); }, { passive: true });
  el('pad').addEventListener('touchend', (e) => {
    if (onButton) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  document.addEventListener('keydown', (e) => { const d = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key]; if (d !== undefined) { e.preventDefault(); turn(d); } });
  draw = () => {
    const s = status, m = me();
    const busy = s.phase === 'ready' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('setup').classList.toggle('hidden', !!m && busy);
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    el('pad').classList.toggle('hidden', !(m && busy));
    el('quit').classList.toggle('hidden', !(m && busy));
    el('score').textContent = s.score || 0; el('best').textContent = s.best || 0;
    let t = s.message || '';
    if (m && s.phase === 'ready') t = 'Get ready! Watch the lights.';
    if (m && s.phase === 'playing') t = '🐍 Eat the red apples!';
    if (!m && busy) t = (s.players[0] || {}).name + ' is playing: ' + (s.score || 0) + ' points.';
    say(t);
  };
  tickGame = () => status.phase === 'ready' && status.startsAt ? 'Starts in ' + secsLeft(status.startsAt) + ' s'
    : status.phase === 'playing' && status.endsAt && secsLeft(status.endsAt) <= 30 ? secsLeft(status.endsAt) + ' s left' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
