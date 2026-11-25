//@include control.js
  let goal = 0.5, sentAt = 0, timer = null, lastSent = -1, sentFor = -1;
  onTiltMove((t) => { if (!me() || !['ready', 'playing'].includes(status.phase)) return; goal = t.x; el('finger').style.left = goal * 100 + '%'; sendGoal(); });
  function sendGoal() {
    clearTimeout(timer);
    const wait = 120 - (Date.now() - sentAt);            // at most about 8 a second
    if (wait > 0) { timer = setTimeout(sendGoal, wait); return; }
    const v = Math.round(goal * 1000) / 1000;
    if (status.game !== sentFor) { sentFor = status.game; lastSent = -1; }   // a new game: send it even if the finger has not moved
    if (Math.abs(v - lastSent) < 0.01) return;
    sentAt = Date.now(); lastSent = v; send({ type: 'go', x: v });
  }
  function slide(e) {
    if (!me() || !['ready', 'playing'].includes(status.phase) || ctl !== 'finger') return;
    const r = el('strip').getBoundingClientRect();
    goal = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    el('finger').style.left = goal * 100 + '%';
    sendGoal();
  }
  el('strip').addEventListener('pointerdown', (e) => { el('strip').setPointerCapture(e.pointerId); slide(e); });
  el('strip').addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') slide(e); });
  el('fire').addEventListener('pointerdown', (e) => { e.preventDefault(); send({ type: 'fire' }); try { navigator.vibrate && navigator.vibrate(20); } catch (er) {} });
  draw = () => {
    const s = status, m = me();
    const busy = s.phase === 'ready' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    ctlDraw(el('ctl'), s);
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    el('setup').classList.toggle('hidden', !!m && busy);
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    el('strip').classList.toggle('hidden', !(m && busy));
    el('fire').classList.toggle('hidden', !(m && busy && s.fire === 'button' && s.ctl !== 'body'));
    el('quit').classList.toggle('hidden', !(m && busy));
    el('score').textContent = s.score || 0; el('wave').textContent = s.wave || 1;
    el('lives').textContent = '💚'.repeat(Math.max(0, s.lives || 0)) || '💔';
    el('ship').style.left = ((typeof s.x === 'number' ? s.x : 0.5) * 100) + '%';
    let t = s.message || '';
    if (m && busy) t = s.ctl === 'body' ? ctlHint(s) + ' Your ship follows you and fires by itself.' : ctl === 'tilt' ? 'Tilt your phone left and right to move' + (s.fire === 'button' ? ', tap FIRE to shoot.' : ': your ship fires by itself.') : s.fire === 'button' ? 'Slide to move, tap FIRE to shoot.' : 'Slide to move: your ship fires by itself.';
    if (!m && busy) t = (s.players[0] || {}).name + ' is playing: ' + (s.score || 0) + ' points.';
    say(t);
  };
  tickGame = () => status.phase === 'playing' && status.endsAt && secsLeft(status.endsAt) <= 30 ? secsLeft(status.endsAt) + ' s left' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; lastSent = -1; tiltCentre(); send({ type: 'new', name: myName(), control: ctl }); say('Starting…'); setTimeout(render, 1500); });
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
