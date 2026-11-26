  let myTeam = 0, taps = 0, lastSent = 0, timer = null;
  const pullBtn = el('pull');
  function flush() {
    const s = status, m = me();
    if (!m || s.phase !== 'pull' || !taps) return;
    const n = Math.min(taps, s.maxBatch || 8); taps -= n; if (taps > 16) taps = 16;
    lastSent = Date.now(); send({ type: 'pull', n, game: s.game });
  }
  function tap(e) {
    e.preventDefault();
    if (status.phase !== 'pull' || !me()) return;
    taps += 1;
    if (navigator.vibrate) navigator.vibrate(8);
  }
  pullBtn.addEventListener('pointerdown', tap);
  pullBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  function pickTeam(t) {
    myTeam = t;
    if (me() && status.phase === 'lobby') send({ type: 'team', team: t });
    render();
  }
  el('go').addEventListener('click', () => send({ type: 'new', name: myName(), team: myTeam || 1 }));
  el('join').addEventListener('click', () => send({ type: 'join', name: myName(), team: myTeam }));
  el('start').addEventListener('click', () => send({ type: 'start' }));
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
  draw = () => {
    const s = status, m = me(), ps = s.players || [], T = s.teams || [['Red team', 'ff2a2a'], ['Blue team', '2a7bff']];
    const busy = !['idle', 'over', 'unconfigured'].includes(s.phase);
    if (m) myTeam = m.team;
    el('teams').replaceChildren(...T.map(([n, c], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + c;
      const count = ps.filter((p) => p.team === i + 1 && !p.left).length;
      b.textContent = n + (s.phase === 'lobby' ? ' (' + count + ')' : ''); b.setAttribute('aria-pressed', String(myTeam === i + 1));
      b.addEventListener('click', () => pickTeam(i + 1)); return b;
    }));
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('go').classList.toggle('hidden', s.phase === 'lobby');
    el('join').classList.toggle('hidden', !(s.phase === 'lobby' && !m && ps.length < (s.maxPlayers || 16)));
    el('start').classList.toggle('hidden', !(s.phase === 'lobby' && ps[0] && app && ps[0].id === app.clientId));
    el('setup').classList.toggle('hidden', busy && s.phase !== 'lobby');
    // the rope: the knot from -1 (team 1's line) to +1 (team 2's line)
    const x = 50 + (s.pos || 0) * 43;
    el('sideA').style.width = x + '%'; el('sideA').style.background = '#' + T[0][1];
    el('sideB').style.width = (100 - x) + '%'; el('sideB').style.background = '#' + T[1][1];
    el('knot').style.left = x + '%';
    el('nameA').textContent = T[0][0] + (s.cpu === 1 ? ' 🤖' : ''); el('nameA').style.color = '#' + T[0][1];
    el('nameB').textContent = (s.cpu === 2 ? '🤖 ' : '') + T[1][0]; el('nameB').style.color = '#' + T[1][1];
    const pulling = m && ['count', 'pull'].includes(s.phase);
    el('namePanel').classList.toggle('hidden', !!pulling);
    pullBtn.classList.toggle('hidden', !pulling);
    if (pulling) {
      pullBtn.style.background = '#' + T[(m.team || 1) - 1][1];
      pullBtn.textContent = s.phase === 'count' ? 'Get ready…' : 'PULL!';
      if (!timer) timer = setInterval(flush, s.batchMs || 250);
    } else if (timer) { clearInterval(timer); timer = null; taps = 0; }
    el('board').classList.toggle('hidden', !busy && s.phase !== 'over');
    el('quit').classList.toggle('hidden', !(m && busy));
    el('table').replaceChildren(...[1, 2].flatMap((t) => ps.filter((p) => p.team === t).sort((a, b) => b.taps - a.taps).map((p) => {
      const d = document.createElement('div'); if (app && p.id === app.clientId) d.className = 'me'; d.style.borderLeftColor = '#' + T[t - 1][1];
      d.textContent = p.name + (p.left ? ' (left)' : '');
      const sc = document.createElement('span'); sc.textContent = s.phase === 'lobby' ? '' : p.taps + ' pulls'; d.append(sc); return d;
    })));
    let t = s.message || '';
    if (s.phase === 'pull' && s.until) t += '  ' + secsLeft(s.until) + ' s';
    if (s.phase === 'over' && m && s.winner) t = s.winner === m.team ? '🏆 Your team won!' : s.winner === s.cpu || s.winner ? '💪 ' + s.message : s.message;
    if (s.phase === 'lobby' && !m) t = 'Pick a team and join!';
    say(t);
  };
