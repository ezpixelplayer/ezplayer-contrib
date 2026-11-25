  const choice = { mode: 'cpu', level: 'normal' };
  const holes = [...Array(42)].map(() => { const d = document.createElement('div'); el('board').append(d); return d; });
  const arrows = [...Array(7)].map((_, c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '▼'; b.setAttribute('aria-label', 'Column ' + (c + 1));
    b.addEventListener('click', () => drop(c)); el('arrows').append(b); return b;
  });
  holes.forEach((d, i) => d.addEventListener('click', () => drop(i % 7)));
  let pend = null;   // a move sent and not yet confirmed: { game, n, at }; the board stays locked until the app answers
  function myTurn() { const i = meIndex(); return !pend && i >= 0 && status.phase === 'playing' && status.turn === i; }
  function drop(c) {
    if (!myTurn() || status.board[c] !== '0') return;
    pend = { game: status.game, n: status.n, at: Date.now() };
    send({ type: 'move', col: c, game: status.game, n: status.n }).then(() => { if (pend && Date.now() - pend.at > 3000) pend = null; });
    render();      // wait for the app; it shows the disc
  }
  // a status from before the move (it crossed the move on its way) does not unlock the board; a newer one, or a refusal, does
  const settle = (s) => { if (!pend) return; const refused = app && s.notices && s.notices[app.clientId];
    if (refused || s.game !== pend.game || s.n !== pend.n || s.phase !== 'playing' || Date.now() - pend.at > 4000) pend = null; };
  draw = () => {
    const s = status, m = me(), i = meIndex();
    const c = s.colors || ['ff2a2a', 'ffd23f'];
    document.documentElement.style.setProperty('--c1', '#' + c[0]); document.documentElement.style.setProperty('--c2', '#' + c[1]);
    const modes = [s.cpu !== false && ['cpu', '🤖 The computer'], s.friend !== false && ['friend', '🧑‍🤝‍🧑 A friend']].filter(Boolean);
    if (!modes.some(([v]) => v === choice.mode) && modes.length) choice.mode = modes[0][0];
    seg(el('modes'), modes, choice.mode, (v) => { choice.mode = v; });
    const levels = (s.levels || ['easy', 'normal', 'hard']).map((l) => [l, { easy: '😊 Easy', normal: '🙂 Normal', hard: '😈 Hard' }[l] || l]);
    if (!levels.some(([v]) => v === choice.level) && levels.length) choice.level = levels[Math.min(1, levels.length - 1)][0];
    seg(el('levels'), levels, choice.level, (v) => { choice.level = v; });
    el('levelBox').classList.toggle('hidden', choice.mode !== 'cpu');
    const busy = s.phase === 'waiting' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'finished' ? 'Play again' : 'New game';
    el('join').classList.toggle('hidden', !(s.phase === 'waiting' && !m));
    el('go').classList.toggle('hidden', s.phase === 'waiting' && !m);
    el('setup').classList.toggle('hidden', !!m && busy);
    el('quit').classList.toggle('hidden', !(m && busy));
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    const ps = s.players || [];
    el('players').replaceChildren(...[0, 1].map((k) => {
      const p = ps[k], sp = document.createElement('span');
      sp.textContent = '● ' + (p ? p.name + (app && p.id === app.clientId ? ' (you)' : '') : k === 1 && s.phase === 'waiting' ? 'waiting…' : '—');
      sp.style.color = 'var(--c' + (k + 1) + ')'; if (s.phase === 'playing' && s.turn === k) sp.className = 'turn'; return sp;
    }));
    const b = s.board || '0'.repeat(42), mine = myTurn();
    holes.forEach((d, k) => { d.className = (b[k] === '1' ? 'c1' : b[k] === '2' ? 'c2' : '') + (s.line && s.line.includes(k) ? ' win' : ''); });
    el('board').classList.toggle('can', mine); el('arrows').classList.toggle('off', !mine);
    arrows.forEach((a, k) => { a.disabled = !mine || b[k] !== '0'; });
    let t = s.message || '';
    if (s.phase === 'playing' && m) t = mine ? 'Your turn! Tap a column.' : (ps[s.turn] || {}).id === 'cpu' ? 'The computer is thinking…' : 'Waiting for ' + ((ps[s.turn] || {}).name || 'the other player') + '…';
    if (s.phase === 'finished' && m) t = s.winner === 3 ? '🤝 ' + s.message : s.winner === i + 1 ? '🎉 You win! Watch the lights!' : '😅 ' + s.message;
    if (s.phase === 'waiting' && m) t = 'Waiting for a friend: ask them to open this page and tap Join.';
    say(t);
  };
  tickGame = () => status.phase === 'playing' && status.turnEndsAt ? secsLeft(status.turnEndsAt) + ' s left for this move'
    : status.phase === 'waiting' && status.waitEndsAt ? 'The game is open for ' + secsLeft(status.waitEndsAt) + ' s' : '';
  let cheered = 0;
  onStatus = (o, s) => { settle(s); const i = meIndex(); if (s.phase === 'finished' && i >= 0 && s.winner === i + 1 && cheered !== s.game) { cheered = s.game; try { navigator.vibrate && navigator.vibrate([120, 80, 120, 80, 300]); } catch (e) {} } };
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', mode: choice.mode, level: choice.level, name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { send({ type: 'join', name: myName() }); say('Joining…'); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
