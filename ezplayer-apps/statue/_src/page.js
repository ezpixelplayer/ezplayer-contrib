  // ---- Statues: dance on the go light, freeze on the stop light ----
  // 🧍 body: the body sensor sees who moves (the phone only starts the game); 📱 phone: each player holds their phone,
  // which feels its own movement during the stop light and sends a level (0-100) every 300 ms.
  // The motion sensor needs a phone that has one and the page opened in https (browsers keep it from plain http
  // pages); on an iPhone the visitor allows it once, when tapping New game or Join.
  const WAY_NAMES = { body: '🧍 Body sensor', phone: '📱 Phone in my hand' };
  let way = 'phone';
  try { way = localStorage.getItem('stWay') || 'phone'; } catch (e) { /* private mode */ }
  const motionOk = () => typeof window.DeviceMotionEvent !== 'undefined' && window.isSecureContext !== false;
  const motion = { on: false, got: false, peak: 0, level: 0, g: null };
  async function motionAsk() {
    try {
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r === 'denied') { el('note').textContent = 'The motion sensor was not allowed: it is needed to play with the phone.'; return false; }
      }
    } catch (e) { /* asked outside a tap, or not needed */ }
    if (!motion.on) { addEventListener('devicemotion', onMotion); motion.on = true; }
    return true;
  }
  function onMotion(e) {
    let m = 0;
    const a = e.acceleration;
    if (a && a.x != null) m = Math.hypot(a.x, a.y || 0, a.z || 0);
    else {   // only with gravity: what changes quickly is the movement
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      const v = [g.x, g.y || 0, g.z || 0];
      if (!motion.g) motion.g = v.slice();
      motion.g = motion.g.map((x, i) => x * 0.9 + v[i] * 0.1);
      m = Math.hypot(v[0] - motion.g[0], v[1] - motion.g[1], v[2] - motion.g[2]);
    }
    const r = e.rotationRate;   // turning the phone counts too (about 30 degrees a second is like 1 m/s²)
    if (r && r.alpha != null) m = Math.max(m, Math.hypot(r.alpha, r.beta || 0, r.gamma || 0) / 30);
    motion.got = true;
    motion.peak = Math.max(motion.peak, m);
  }
  const playingPhone = () => status.phase === 'playing' && status.mode === 'phone' && me() && !me().out;
  // every 300 ms: the strongest movement since the last time, sent during the stop light after its grace time
  setInterval(() => {
    motion.level = Math.min(100, Math.round(motion.peak * 10)); motion.peak = 0;
    const s = status;
    if (playingPhone() && s.light === 'stop' && nowMs() >= s.lightAt + s.graceMs) send({ type: 'move', level: motion.level, cue: s.cue });
    if (playingPhone()) { el('meterFill').style.width = motion.level + '%'; el('meterMark').style.left = (s.level || 20) + '%'; }
  }, 300);

  const isStarter = () => app && status.starter === app.clientId;
  draw = () => {
    const s = status, m = me(), ps = s.players || [], W = s.words || { go: 'Dance!', stop: 'Freeze!', greeting: '' };
    const c = s.colors || { go: '30e050', stop: 'ff2020' };
    const ways = [s.wayBody !== false && s.sensor && s.sensor.ok && 'body', s.wayPhone !== false && 'phone'].filter(Boolean);
    if (!ways.includes(way) && ways.length) way = ways[0];
    seg(el('ways'), ways.map((k) => [k, WAY_NAMES[k]]), way, (v) => { way = v; try { localStorage.setItem('stWay', v); } catch (e) { /* */ } });
    const noMotion = way === 'phone' && !motionOk();
    el('wayTip').textContent = way === 'body'
      ? 'Everyone stands in front of the lights (up to 3 people); the sensor sees who moves. No phone needed to play.' + (s.sensor ? ' It sees ' + s.sensor.n + ' ' + (s.sensor.n === 1 ? 'person' : 'people') + ' now.' : '')
      : noMotion ? 'This phone cannot feel its movement here: the motion sensor needs the page opened with https:// (browsers hide it from http pages) and a phone that has one.'
        : 'Hold your phone in your hand while you dance; it feels if you move when the light is red. On an iPhone, allow Motion when asked.';
    const busy = s.phase === 'waiting' || s.phase === 'playing';
    el('go').disabled = !app || busy || s.phase === 'unconfigured' || noMotion || !ways.length;
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New game';
    const canJoin = s.phase === 'waiting' && s.mode === 'phone' && !m;
    el('join').classList.toggle('hidden', !canJoin);
    el('join').disabled = !motionOk();
    el('go').classList.toggle('hidden', s.phase === 'waiting');
    el('setup').classList.toggle('hidden', (!!m || isStarter()) && busy);
    el('namePanel').classList.toggle('hidden', way === 'body' || (!!m && busy));
    el('play').classList.toggle('hidden', !busy && s.phase !== 'over');
    el('startNow').classList.toggle('hidden', !(s.phase === 'waiting' && (m || isStarter())));
    el('quit').classList.toggle('hidden', !(busy && (m ? !m.out : isStarter())));
    el('quit').textContent = s.mode === 'body' && isStarter() && !m ? 'Stop the game' : 'Leave the game';
    // the big light: the colour and the word, as on the matrix
    const L = el('light'), col = s.light === 'go' ? c.go : s.light === 'stop' ? c.stop : '';
    L.style.background = col ? '#' + col : '';
    el('word').textContent = s.light === 'go' ? W.go : s.light === 'stop' ? W.stop : s.light === 'ready' ? 'Get ready…' : s.phase === 'over' ? (W.greeting || '🎉') : s.phase === 'waiting' ? '…' : '';
    el('round').textContent = s.phase === 'playing' && s.light !== 'ready' ? 'Round ' + Math.min(s.rounds, s.round + 1) + ' of ' + s.rounds : '';
    el('meter').classList.toggle('hidden', !playingPhone());
    el('plist').replaceChildren(...ps.map((p) => {
      const sp = document.createElement('span');
      sp.textContent = (p.out ? '✗ ' : (s.winners || []).includes(p.id) ? '🏆 ' : '') + p.name + (app && p.id === app.clientId ? ' (you)' : '');
      sp.style.color = '#' + p.col; sp.className = (p.out ? 'out' : '') + (app && p.id === app.clientId ? ' me' : '');
      return sp;
    }));
    let t = s.message || '';
    if (s.phase === 'waiting' && s.mode === 'body') t = 'Stand in front of the lights. The sensor sees ' + ((s.sensor && s.sensor.n) || 0) + ' now. The game starts soon' + (isStarter() ? ', or tap Start now.' : '.');
    else if (s.phase === 'waiting' && m) t = ps.length + (ps.length === 1 ? ' player' : ' players') + ' in. Friends open this page and tap Join; ' + (isStarter() ? 'tap Start now when everyone is in.' : 'the game starts soon.');
    if (s.phase === 'playing' && m && m.out) t = m.why === 'moved' ? '😅 You moved: you are out! Watch the others.' : 'You are out of this game.';
    else if (s.phase === 'playing' && m && s.light === 'stop') t = W.stop + ' Do not move!';
    else if (s.phase === 'playing' && m && s.light === 'go') t = W.go + ' Dance with your phone in your hand!';
    if (s.phase === 'playing' && m && !m.out && !motion.got && s.light !== 'ready') t += ' (This phone feels no movement yet: is Motion allowed?)';
    if (s.phase === 'over' && m) t = ((s.winners || []).includes(m.id) ? '🎉 You win! ' : '') + s.message;
    say(t);
  };
  tickGame = () => {
    const s = status;
    if (s.phase === 'waiting' && s.waitEndsAt) return 'Starting in ' + secsLeft(s.waitEndsAt) + ' s';
    if (s.phase === 'playing' && s.lightEndsAt && s.light !== 'go') return (s.light === 'stop' ? 'Hold still for ' : 'Starting in ') + secsLeft(s.lightEndsAt) + ' s';
    return '';
  };
  el('go').addEventListener('click', async () => {
    el('go').disabled = true;
    if (way === 'phone' && !(await motionAsk())) { render(); return; }
    send({ type: 'new', control: way, name: myName() }); say('Starting…'); setTimeout(render, 1500);
  });
  el('join').addEventListener('click', async () => {
    if (!(await motionAsk())) return;
    send({ type: 'join', name: myName() }); say('Joining…');
  });
  el('startNow').addEventListener('click', () => send({ type: 'start' }));
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
