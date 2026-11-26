  // The visitors' page of the raffle: how many are in, Join with a name (when visitors can join), the draw spinning
  // live with the lights (the same reel and timing, from the status), the winners big and "You won!" on their phone.
  let raf = 0, wonFor = '';
  const mine = (c) => !!(app && c && c === app.clientId);
  const colOf = (j) => { const c = (status.colors && status.colors.names) || ['ffffff']; return '#' + c[j % c.length]; };
  function spinFrame() {
    raf = 0;
    const s = status, sp = s.spin;
    if (s.phase !== 'spinning' || !sp) return;
    const u = Math.min(1, Math.max(0, (nowMs() - sp.t0) / sp.dur)), p = sp.N * (1 - Math.pow(1 - u, 3)), i = Math.floor(p), f = p - i;
    const nm = (j) => (sp.names[j] !== undefined ? sp.names[j] : '…');
    el('r0').textContent = nm(i); el('r0').style.color = colOf(i);
    el('r1').textContent = nm(i + 1); el('r1').style.color = colOf(i + 1);
    el('reel').style.transform = 'translateY(' + ((f - 1) * 50) + '%)';   // the names come down from the top, like the lights
    raf = requestAnimationFrame(spinFrame);
  }
  draw = () => {
    const s = status, inIt = !!(app && (s.ins || []).includes(app.clientId));
    const win = '#' + ((s.colors && s.colors.win) || 'ffd23f');
    el('title').textContent = '🎟️ ' + (s.title || 'Raffle');
    el('greet').textContent = s.greeting || '';
    el('count').innerHTML = '';
    if (s.count) {
      const b = document.createElement('b'); b.textContent = s.count;
      el('count').append(b, ' in the draw');
      if (s.removeWinners && s.left < s.count) el('count').append(' · ' + s.left + ' still to win');
    } else el('count').textContent = s.phase === 'unconfigured' ? '' : 'Nobody is in the draw yet.';
    // joining: only when the host lets visitors in
    const canJoin = s.visitorsOn && s.phase !== 'unconfigured';
    el('joinP').classList.toggle('hidden', !canJoin);
    el('namePanel').classList.toggle('hidden', !canJoin || !s.open);
    el('inMsg').classList.toggle('hidden', !inIt);
    el('inMsg').textContent = "✅ You're in the draw!";
    el('join').classList.toggle('hidden', inIt && !s.open);
    el('join').disabled = !app || !s.open;
    el('join').textContent = !s.open ? (inIt ? '' : 'The entries are closed') : inIt ? 'Change my name' : 'Join the draw';
    el('leave').classList.toggle('hidden', !inIt || s.phase !== 'idle');
    // the draw, live
    const spinning = s.phase === 'spinning' && s.spin, shown = s.phase === 'over' && s.shown;
    el('spinP').classList.toggle('hidden', !spinning && !shown);
    el('slot').classList.toggle('stop', !!shown);
    if (spinning) {
      el('spinOf').textContent = s.spin.of > 1 ? 'Winner ' + (s.spin.k + 1) + ' of ' + s.spin.of + '…' : 'Who will it be?';
      if (!raf) raf = requestAnimationFrame(spinFrame);
    } else if (shown) {
      el('r0').textContent = shown.name; el('r0').style.color = win; el('reel').style.transform = 'translateY(-50%)';
      el('spinOf').textContent = shown.of > 1 ? 'Winner ' + (shown.k + 1) + ' of ' + shown.of : '';
    }
    // the winners of the last draw, and "You won!"
    const ws = (s.last && s.last.winners) || [];
    el('winP').classList.toggle('hidden', !ws.length);
    el('winLabel').textContent = ws.length > 1 ? 'The winners' : 'The winner';
    el('winners').replaceChildren(...ws.map((w) => { const d = document.createElement('div'); d.textContent = w.name; d.style.color = win; return d; }));
    const iWon = ws.some((w) => mine(w.c));
    el('you').classList.toggle('hidden', !iWon);
    if (iWon && wonFor !== String(s.last.d)) { wonFor = String(s.last.d); try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {} }
    const past = s.past || [];
    el('pastP').classList.toggle('hidden', past.length <= ws.length);
    el('past').replaceChildren(...past.map((p) => {
      const d = document.createElement('div'), n = document.createElement('b'), t = document.createElement('span');
      n.textContent = p.name + (mine(p.c) ? ' (you)' : ''); t.textContent = 'draw ' + p.d; d.append(n, t); return d;
    }));
    let m = s.message || '';
    if (shown && mine(shown.c)) m = '🎉 You won! ' + (s.greeting || '');
    else if (spinning && inIt) m = 'Fingers crossed…';
    say(m);
  };
  el('join').addEventListener('click', () => {
    const n = myName();
    if (!n) { el('note').textContent = 'Write your name first.'; return; }
    send({ type: 'join', name: n }); say('Joining…'); setTimeout(render, 1200);
  });
  el('leave').addEventListener('click', () => { send({ type: 'leave' }); say('Leaving…'); });
