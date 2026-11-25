//@include control.js
  const choice = { mode: 'solo' };
  // tilting the phone moves the sleigh like the finger does
  onTiltMove((t) => { if (!playing()) return; goal = t.x; el('sleigh').style.left = goal * 100 + '%'; sendGoal(); });
  const playing = () => meIndex() >= 0 && status.phase === 'playing';
  let goal = 0.5, sentAt = 0, timer = null, lastSent = -1, sentFor = -1;
  function sendGoal() {
    clearTimeout(timer);
    const wait = 90 - (Date.now() - sentAt);            // at most about 11 a second
    if (wait > 0) { timer = setTimeout(sendGoal, wait); return; }
    const v = Math.round(goal * 1000) / 1000;
    if (status.game !== sentFor) { sentFor = status.game; lastSent = -1; }   // a new game: send it even if the finger has not moved
    if (Math.abs(v - lastSent) < 0.01) return;
    sentAt = Date.now(); lastSent = v; send({ type: 'go', x: v });
  }
  function slide(e) {
    if (meIndex() < 0 || status.phase !== 'playing' || ctl !== 'finger') return;
    const r = el('strip').getBoundingClientRect();
    goal = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    el('sleigh').style.left = goal * 100 + '%';
    sendGoal();
  }
  el('strip').addEventListener('pointerdown', (e) => { el('strip').setPointerCapture(e.pointerId); slide(e); });
  el('strip').addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') slide(e); });
  draw = () => {
    const s = status, m = me(), i = meIndex(), ps = s.players || [];
    const c = s.colors || ['ff3c3c', '3c8cff'];
    document.documentElement.style.setProperty('--c1', '#' + c[0]); document.documentElement.style.setProperty('--c2', '#' + c[1]);
    const modes = [['solo', '🎁 Alone'], s.friend !== false && ['friend', '🧑‍🤝‍🧑 With a friend']].filter(Boolean);
    if (!modes.some(([v]) => v === choice.mode)) choice.mode = 'solo';
    seg(el('modes'), modes, choice.mode, (v) => { choice.mode = v; });
    el('modes').classList.toggle('hidden', modes.length < 2);
    ctlDraw(el('ctl'), s);
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
    el('clock').textContent = s.phase === 'playing' ? (s.startsIn ? 'Get ready… ' + s.startsIn : '⏱️ ' + s.left + ' s') : '';
    el('coalHint').classList.toggle('hidden', s.coal === false);
    const playing = i >= 0 && s.phase === 'playing';
    el('strip').classList.toggle('hidden', !playing || ctl === 'body');
    el('sleigh').style.background = 'var(--c' + (i + 1) + ')';
    if (playing && lastSent < 0 && s.pos) el('sleigh').style.left = s.pos[i] * 100 + '%';
    const best = s.best || [];
    el('bestBox').classList.toggle('hidden', !best.length);
    el('best').replaceChildren(...best.map((b) => { const li = document.createElement('li'); li.textContent = b.name + ' — ' + b.score; return li; }));
    let t = s.message || '';
    if (s.phase === 'waiting' && m) t = 'Waiting for a friend: ask them to open this page and tap Join.';
    if (playing && ctl !== 'finger') t = ctlHint(s) + ' Catch the presents!';
    else if (playing) t = 'Slide your finger to move your sleigh' + (two ? ' (' + (i === 0 ? 'the first colour' : 'the second colour') + ')' : '') + ' and catch the presents!';
    if (s.phase === 'over' && m) t = (ps.length === 1 || s.winner === i + 1 ? '🎉 ' : s.winner === 3 ? '🤝 ' : '😅 ') + s.message;
    say(t);
  };
  tickGame = () => status.phase === 'waiting' && status.waitEndsAt ? 'The game is open for ' + secsLeft(status.waitEndsAt) + ' s' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; lastSent = -1; tiltCentre(); send({ type: 'new', mode: choice.mode, name: myName(), control: ctl }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { lastSent = -1; tiltCentre(); send({ type: 'join', name: myName(), control: ctl }); say('Joining…'); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
