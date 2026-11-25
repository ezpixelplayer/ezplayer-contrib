  let pos = 0, forGame = -1, forRound = -1;
  const pads = [...Array(4)].map((_, c) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', ['Green', 'Red', 'Yellow', 'Blue'][c]);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(c); });
    el('pads').append(b); return b;
  });
  function press(c) {
    if (!me() || status.phase !== 'input' || pos >= status.round) return;
    pads[c].classList.add('on'); setTimeout(() => pads[c].classList.remove('on'), 180);
    try { navigator.vibrate && navigator.vibrate(25); } catch (e) {}
    const i = pos;
    app.send({ type: 'press', c, i, game: status.game }).catch((e) => { pos = Math.min(pos, i); el('note').textContent = 'Could not send: ' + e.message; lastNoteAt = Date.now(); render(); });
    pos += 1; render();
  }
  draw = () => {
    const s = status, m = me();
    if (s.game !== forGame || s.round !== forRound) { forGame = s.game; forRound = s.round; pos = 0; }
    if (s.phase === 'input' && typeof s.pos === 'number' && s.pos > pos) pos = s.pos;
    (s.colors || []).forEach((c, i) => { pads[i].style.background = '#' + c; });
    const busy = s.phase === 'showing' || s.phase === 'input';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'finished' ? 'Play again' : 'New game';
    el('setup').classList.toggle('hidden', !!m && busy);
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    el('quit').classList.toggle('hidden', !(m && busy));
    el('round').textContent = s.round || 0; el('score').textContent = s.score || 0; el('best').textContent = s.best || 0;
    const canPress = m && s.phase === 'input';
    el('pads').classList.toggle('off', !canPress);
    pads.forEach((p, i) => p.classList.toggle('on', s.phase === 'finished' && i === s.expected));
    let t = s.message || '';
    if (m && s.phase === 'showing') t = '👀 Watch the lights: ' + s.round + ' colour' + (s.round > 1 ? 's' : '') + '!';
    if (m && s.phase === 'input') t = '👆 Your turn: ' + (s.round - pos) + ' to go.';
    if (m && s.phase === 'finished') t = (s.won ? '🏆 ' : '😅 ') + s.message;
    if (!m && busy) t = (s.players[0] || {}).name + ' is playing. ' + (s.message || '');
    say(t);
  };
  tickGame = () => status.phase === 'input' && me() && status.until ? secsLeft(status.until) + ' s to press the next colour' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
