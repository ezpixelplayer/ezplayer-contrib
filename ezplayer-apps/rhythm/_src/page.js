  // Rhythm on the lights: the phone draws the falling notes and judges its own taps (the network is too slow to judge
  // them on the player), then sends what it hit every 300 ms; the player checks and counts them.
  const choice = { mode: 'solo' };
  const COLS0 = ['ff2a2a', '39d353', 'ffc83c', '2bb7ff'];
  let chartKey = '', judged = [], pending = [], combo = 0, judgeText = '', judgeCol = '#fff', judgeAt = 0, raf = 0;
  const pressed = [0, 0, 0, 0];
  // the player's clock: each status says when it was made; the least delayed of the last 20 s is the best guess
  let skews = [];
  const serverNow = () => Date.now() + (skews.length ? Math.max(...skews.map((x) => x[1])) : skew);
  onStatus = (old, s) => {
    const t = Date.now();
    skews.push([t, skew]); skews = skews.filter((x) => t - x[0] < 20000);
    const key = s.game + ':' + (s.notes || []).length;   // a new song (or its chart just came): nothing judged yet
    if (key !== chartKey) { chartKey = key; judged = new Array((s.notes || []).length).fill(0); pending = []; combo = 0; judgeText = ''; }
    loop();
  };
  function showJudge(t, c) { judgeText = t; judgeCol = c; judgeAt = performance.now(); }

  // a tap: the nearest note not judged yet in that lane, within the "good" window
  function tap(l) {
    pressed[l] = performance.now();
    const s = status, b = el('pads').children[l];
    if (b) { b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 110); }
    if (meIndex() < 0 || s.phase !== 'playing' || s.t0 == null) return;
    const now = serverNow(), notes = s.notes || [], good = s.goodMs || 140;
    let best = -1, bd = 0;
    for (let k = 0; k < notes.length; k++) {
      if (notes[k][1] !== l || judged[k]) continue;
      const d = now - (s.t0 + notes[k][0]);
      if (d < -good) break;                      // the notes are in time order: the rest are later still
      if (Math.abs(d) <= good && (best < 0 || Math.abs(d) < Math.abs(bd))) { best = k; bd = d; }
    }
    if (best < 0) return;
    const perfect = Math.abs(bd) <= (s.perfectMs || 70);
    judged[best] = perfect ? 1 : 2; combo++;
    showJudge((perfect ? 'Perfect!' : 'Good') + (combo >= 4 ? ' ×' + combo : ''), perfect ? '#ffffff' : '#9fe0ff');
    pending.push([best, Math.round(bd), l]);
  }
  setInterval(() => { if (pending.length) send({ type: 'hits', h: pending.splice(0, 32) }); }, 300);

  function loop() { if (!raf && status.phase === 'playing') raf = requestAnimationFrame(frame); }
  function frame() { raf = 0; paint(); loop(); }
  function paint() {
    const s = status, c = el('lanes'), cols = s.cols || COLS0;
    if (s.phase !== 'playing') return;   // a frame asked for just before the song ended
    const W = c.clientWidth || 320, H = c.clientHeight || 300, dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const lw = W / 4, hy = Math.round(H * 0.86), fall = s.fallMs || 1700, now = serverNow(), mine = meIndex() >= 0;
    let pulse = 0.3;
    if (s.t0 != null && now >= s.t0 + (s.startMs || 0)) { const b = (now - s.t0 - (s.startMs || 0)) / (s.beatMs || 545); pulse = Math.max(0, 1 - (b - Math.floor(b)) * 3); }
    for (let l = 0; l < 4; l++) {
      g.fillStyle = '#' + cols[l] + '18'; g.fillRect(l * lw + 2, 0, lw - 4, H);
      const p = Math.max(0, 1 - (performance.now() - pressed[l]) / 150);
      g.globalAlpha = Math.min(1, 0.35 + 0.4 * pulse + p);
      g.fillStyle = '#' + cols[l]; g.fillRect(l * lw + 2, hy - 3, lw - 4, 6);
      g.globalAlpha = 1;
    }
    if (s.t0 != null) {
      const notes = s.notes || [], nh = Math.max(10, H / 26), good = s.goodMs || 140;
      for (let k = 0; k < notes.length; k++) {
        const dt = s.t0 + notes[k][0] - now;
        if (dt > fall) break;
        if (mine && !judged[k] && dt < -good) { judged[k] = 3; combo = 0; showJudge('Miss', '#ff7a7a'); }
        if (dt < -400 || judged[k] === 1 || judged[k] === 2) continue;
        const y = hy - (dt / fall) * hy;
        g.globalAlpha = judged[k] === 3 ? 0.3 : 1;
        g.fillStyle = '#' + cols[notes[k][1]];
        g.fillRect(notes[k][1] * lw + 6, y - nh / 2, lw - 12, nh);
        g.globalAlpha = 1;
      }
      const left = Math.max(0, Math.ceil((s.t0 + s.lengthMs - now) / 1000));
      el('clock').textContent = now < s.t0 ? 'Get ready…' : '⏱️ ' + left + ' s';
    } else el('clock').textContent = 'Get ready…';
    const age = performance.now() - judgeAt;
    el('judge').textContent = age < 600 ? judgeText : '';
    el('judge').style.color = judgeCol;
    el('judge').style.opacity = String(Math.max(0, 1 - age / 600));
  }

  // the 4 pads (and D F J K on a keyboard)
  el('pads').replaceChildren(...[0, 1, 2, 3].map((l) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Lane ' + (l + 1));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(l); });
    return b;
  }));
  document.addEventListener('keydown', (e) => { const l = 'dfjk'.indexOf(e.key.toLowerCase()); if (l >= 0 && !e.repeat && document.activeElement !== el('name')) tap(l); });

  draw = () => {
    const s = status, m = me(), i = meIndex(), ps = s.players || [], cols = s.cols || COLS0;
    const modes = [['solo', '🎵 Alone'], (s.maxPlayers || 4) > 1 && ['group', '👥 With friends (up to ' + (s.maxPlayers || 4) + ')']].filter(Boolean);
    if (!modes.some(([v]) => v === choice.mode)) choice.mode = 'solo';
    seg(el('modes'), modes, choice.mode, (v) => { choice.mode = v; });
    const busy = s.phase === 'waiting' || s.phase === 'playing', playing = s.phase === 'playing';
    el('modes').classList.toggle('hidden', busy || modes.length < 2);
    el('playLabel').classList.toggle('hidden', busy || modes.length < 2);
    el('go').disabled = !app || busy || s.phase === 'unconfigured';
    el('go').textContent = s.phase === 'over' ? 'Play again' : 'New song';
    el('go').classList.toggle('hidden', busy);
    el('join').classList.toggle('hidden', !(s.phase === 'waiting' && !m && ps.length < (s.maxPlayers || 4)));
    el('startNow').classList.toggle('hidden', !(s.phase === 'waiting' && m));
    el('setup').classList.toggle('hidden', playing);
    el('quit').classList.toggle('hidden', !(m && busy && !m.left));
    el('play').classList.toggle('hidden', s.phase === 'idle' || s.phase === 'unconfigured');
    el('scores').replaceChildren(...ps.map((p, k) => {
      const d = document.createElement('div'), a = document.createElement('span'), b = document.createElement('span');
      a.textContent = p.name + (app && p.id === app.clientId ? ' (you)' : '') + (p.left ? ' (left)' : ''); a.style.color = '#' + cols[k % 4];
      b.textContent = String((s.score || [])[k] || 0);
      if (app && p.id === app.clientId) d.className = 'me';
      d.append(a, b); return d;
    }));
    el('stage').classList.toggle('hidden', !playing);
    const tapping = playing && m && !m.left;
    el('pads').classList.toggle('hidden', !tapping);
    el('howto').classList.toggle('hidden', !tapping);
    [...el('pads').children].forEach((b, l) => { b.style.background = '#' + cols[l]; b.style.color = '#' + cols[l]; });
    if (!playing) el('clock').textContent = '';
    const best = s.best || [];
    el('bestBox').classList.toggle('hidden', !best.length);
    el('best').replaceChildren(...best.map((b) => { const li = document.createElement('li'); li.textContent = b.name + ' — ' + b.score; return li; }));
    let t = s.message || '';
    if (s.phase === 'waiting' && m) t = 'Waiting for friends (' + ps.length + ' of ' + (s.maxPlayers || 4) + '): ask them to open this page and tap Join. Or tap Start now.';
    else if (s.phase === 'waiting') t = (s.message || '') + ' Tap Join the game!';
    if (tapping) t = s.t0 == null ? 'Get ready: the music is starting…' : 'Tap the pads in time with the notes!';
    if (s.phase === 'over' && m) {
      const top = s.counted && (ps.length === 1 || s.winner === i + 1 || (s.draw && (s.score || [])[i] === (s.score || [])[s.winner - 1]));
      t = (top ? '🎉 ' : s.counted ? '👏 ' : '') + s.message + (s.counted ? '  (you: ' + ((s.perfect || [])[i] || 0) + ' perfect, ' + ((s.good || [])[i] || 0) + ' good, best run ' + ((s.maxCombo || [])[i] || 0) + ')' : '');
    }
    say(t);
    loop();
  };
  tickGame = () => status.phase === 'waiting' && status.waitEndsAt ? 'The song starts in ' + secsLeft(status.waitEndsAt) + ' s' : '';
  el('go').addEventListener('click', () => { el('go').disabled = true; send({ type: 'new', mode: choice.mode, name: myName() }); say('Starting…'); setTimeout(render, 1500); });
  el('join').addEventListener('click', () => { send({ type: 'join', name: myName() }); say('Joining…'); });
  el('startNow').addEventListener('click', () => send({ type: 'start' }));
  el('quit').addEventListener('click', () => send({ type: 'quit' }));
