//@include control.js
  const choice = { mode: 'cpu' };
  // tilting the phone moves the paddle: left and right on a tall matrix, forward and back on a wide one
  onTiltMove((t) => { if (meIndex() < 0 || status.phase !== 'playing') return; goal = status.turned ? t.x : t.y; placePaddle(goal); sendGoal(); });
  let goal = 0.5, sentAt = 0, timer = null, lastSent = -1, sentFor = -1;
  function sendGoal() {
    clearTimeout(timer);
    const wait = 90 - (Date.now() - sentAt);            // at most about 11 a second
    if (wait > 0) { timer = setTimeout(sendGoal, wait); return; }
    const v = Math.round(goal * 1000) / 1000;
    if (status.game !== sentFor) { sentFor = status.game; lastSent = -1; }   // a new game: send it even if the finger has not moved
    if (Math.abs(v - lastSent) < 0.01) return;
    sentAt = Date.now(); lastSent = v; send({ type: 'go', y: v });
  }
  function slide(e) {
    if (meIndex() < 0 || status.phase !== 'playing' || ctl !== 'finger') return;
    const r = el('strip').getBoundingClientRect();
    goal = status.turned ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    goal = Math.max(0, Math.min(1, goal));
    placePaddle(goal);
    sendGoal();
  }
  function placePaddle(v) { if (status.turned) el('paddle').style.left = v * 100 + '%'; else el('paddle').style.top = v * 100 + '%'; }
  el('strip').addEventListener('pointerdown', (e) => { el('strip').setPointerCapture(e.pointerId); slide(e); });
  el('strip').addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') slide(e); });
  draw = () => {
    const s = status, m = me(), i = meIndex(), ps = s.players || [];
    const c = s.colors || ['ff3c3c', '3c8cff'];
    document.documentElement.style.setProperty('--c1', '#' + c[0]); document.documentElement.style.setProperty('--c2', '#' + c[1]);
    const modes = [s.cpu !== false && ['cpu', '🤖 The computer'], s.friend !== false && ['friend', '🧑‍🤝‍🧑 A friend']].filter(Boolean);
    if (!modes.some(([v]) => v === choice.mode) && modes.length) choice.mode = modes[0][0];
    seg(el('modes'), modes, choice.mode, (v) => { choice.mode = v; });
    ctlDraw(el('ctl'), s);
    const busy = s.phase === 'waiting' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('join').classList.toggle('hidden', !(s.phase === 'waiting' && !m));
    el('go').classList.toggle('hidden', s.phase === 'waiting' && !m);
    el('setup').classList.toggle('hidden', !!m && busy);
    el('quit').classList.toggle('hidden', !(m && busy));
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    el('players').replaceChildren(...[0, 1].map((k) => {
      const p = ps[k], sp = document.createElement('span');
      sp.textContent = (p ? p.name + (app && p.id === app.clientId ? ' (you)' : '') : k === 1 && s.phase === 'waiting' ? 'waiting…' : '—');
      sp.style.color = 'var(--c' + (k + 1) + ')'; return sp;
    }));
    el('score').innerHTML = '<span style="color:var(--c1)">' + ((s.score || [0, 0])[0]) + '</span><span>-</span><span style="color:var(--c2)">' + ((s.score || [0, 0])[1]) + '</span>';
    const playing = i >= 0 && s.phase === 'playing';
    el('strip').classList.toggle('hidden', !playing);
    el('strip').className = 'strip ' + (s.turned ? 'h' : 'v') + (playing && ctl !== 'body' ? '' : ' hidden');
    el('paddle').style.background = 'var(--c' + (i + 1) + ')';
    if (playing && lastSent < 0 && s.pad) placePaddle(s.pad[i]);
    let t = s.message || '';
    if (s.phase === 'waiting' && m) t = 'Waiting for a friend: ask them to open this page and tap Join.';
    if (playing && ctl === 'tilt') t = 'Tilt your phone ' + (s.turned ? 'left and right' : 'forward and back') + ' to move your paddle. First to ' + s.points + '!';
    else if (playing && ctl === 'body') t = ctlHint(s) + ' Your paddle follows you. First to ' + s.points + '!';
    else if (playing) t = 'Slide to move your paddle (' + (s.turned ? (i === 0 ? 'the bottom one' : 'the top one') : (i === 0 ? 'on the left' : 'on the right')) + '). First to ' + s.points + '!';
    if (s.phase === 'over' && m) t = s.winner === i + 1 ? '🎉 You win! ' + s.message : s.winner ? '😅 ' + s.message : s.message;
    say(t);
  };
  tickGame = () => status.phase === 'waiting' && status.waitEndsAt ? 'The game is open for ' + secsLeft(status.waitEndsAt) + ' s' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; lastSent = -1; tiltCentre(); send({ type: 'new', mode: choice.mode, name: myName(), control: ctl }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { lastSent = -1; tiltCentre(); send({ type: 'join', name: myName(), control: ctl }); say('Joining…'); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
