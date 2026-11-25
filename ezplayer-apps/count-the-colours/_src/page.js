  let picked = -1, pickedFor = '';
  const nums = [...Array(20)].map((_, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = i + 1;
    b.addEventListener('click', () => answer(i + 1)); el('nums').append(b); return b;
  });
  function answer(v) {
    const m = me();
    if (!m || m.answered || picked >= 0 || !['show', 'answer'].includes(status.phase)) return;
    picked = v; send({ type: 'answer', value: v, round: status.round }); render();
  }
  draw = () => {
    const s = status, m = me(), ps = s.players || [];
    const key = s.game + ':' + s.round; if (key !== pickedFor) { pickedFor = key; picked = -1; }
    const busy = !['idle', 'over', 'unconfigured'].includes(s.phase);
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('go').classList.toggle('hidden', s.phase === 'lobby');
    el('join').classList.toggle('hidden', !(s.phase === 'lobby' && !m && ps.length < (s.maxPlayers || 8)));
    el('start').classList.toggle('hidden', !(s.phase === 'lobby' && ps[0] && app && ps[0].id === app.clientId));
    el('setup').classList.toggle('hidden', !!m && busy && s.phase !== 'lobby');
    const asking = m && ['show', 'answer'].includes(s.phase);
    el('ask').classList.toggle('hidden', !asking);
    if (asking) {
      el('question').innerHTML = '<span class="swatch" style="background:#' + s.targetColor + '"></span>How many <b style="color:#' + s.targetColor + '">' + s.targetName + '</b>?';
      const done = m.answered || picked >= 0;
      el('nums').classList.toggle('off', done);
      nums.forEach((b, i) => b.setAttribute('aria-pressed', String(picked === i + 1)));
    }
    el('board').classList.toggle('hidden', !busy && s.phase !== 'over');
    el('quit').classList.toggle('hidden', !(m && busy));
    const order = s.phase === 'over' ? [...ps].sort((a, b) => b.score - a.score) : ps;
    el('table').replaceChildren(...order.map((p, k) => {
      const d = document.createElement('div'); if (app && p.id === app.clientId) d.className = 'me';
      const mark = p.ok === true ? ' ✅' : p.ok === false ? ' ❌' : ['show', 'answer'].includes(s.phase) && p.answered ? ' ✔️' : '';
      d.textContent = (s.phase === 'over' ? ['🥇', '🥈', '🥉'][k] || '  ' : '') + ' ' + p.avatar + ' ' + p.name + (p.left ? ' (left)' : '') + mark;
      const sc = document.createElement('span'); sc.textContent = p.score + (p.answer !== null && p.answer !== undefined ? '  (said ' + p.answer + ')' : ''); d.append(sc); return d;
    }));
    let t = s.message || '';
    if (m && s.phase === 'show') t = picked >= 0 ? 'Answer locked in: ' + picked : '👀 Count the ' + s.targetName + ' flashes!';
    if (m && s.phase === 'answer') t = picked >= 0 || m.answered ? 'Waiting for the others…' : 'Pick your answer!';
    if (m && s.phase === 'result') t = (m.ok ? '🎉 Right! ' : '😅 ') + s.message;
    if (!m && busy && s.phase !== 'lobby') t = 'A game is on. ' + t;
    say(t);
  };
  tickGame = () => ['lobby', 'answer'].includes(status.phase) && status.until ? secsLeft(status.until) + ' s' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { send({ type: 'join', name: myName() }); say('Joining…'); });
  el('start').addEventListener('click', () => send({ type: 'start' }));
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
