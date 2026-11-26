  let col = -1, keysKey = '';
  const pressed = new Map();   // pointer id -> key index
  const button = (text, f) => { const b = document.createElement('button'); b.type = 'button'; if (text) b.textContent = text; if (f) b.addEventListener('click', f); return b; };
  const keyCol = (i) => '#' + (col >= 0 ? status.cols[col] : status.cols[i % 8]);
  function press(i, down) {
    const b = el('keys').children[i]; if (!b) return;
    b.classList.toggle('on', down || [...pressed.values()].includes(i));
    send({ type: 'play', a: down ? 'down' : 'up', k: [i], ...(down && col >= 0 ? { c: col } : {}) });
  }
  el('keys').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    e.preventDefault(); try { el('keys').setPointerCapture(e.pointerId); } catch (er) {}
    const i = +b.dataset.k; pressed.set(e.pointerId, i); press(i, true);
  });
  const lift = (e) => { if (!pressed.has(e.pointerId)) return; const i = pressed.get(e.pointerId); pressed.delete(e.pointerId); press(i, false); };
  el('keys').addEventListener('pointerup', lift); el('keys').addEventListener('pointercancel', lift);
  el('keys').addEventListener('pointermove', (e) => {   // sliding a finger over the keys plays them in turn
    if (!pressed.has(e.pointerId)) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('button[data-k]');
    if (!b || !el('keys').contains(b)) return;
    const i = +b.dataset.k, was = pressed.get(e.pointerId);
    if (i !== was) { pressed.set(e.pointerId, i); press(was, false); press(i, true); }
  });
  el('keys').addEventListener('contextmenu', (e) => e.preventDefault());
  // a computer keyboard plays the first 36 keys: 1-0, Q-P, A-L, Z-M
  const KB = '1234567890qwertyuiopasdfghjklzxcvbnm';
  const kdown = new Set();
  document.addEventListener('keydown', (e) => { const i = KB.indexOf(e.key.toLowerCase()); if (i < 0 || e.repeat || !isMine() || i >= (status.keys || []).length || document.activeElement?.tagName === 'INPUT') return; kdown.add(i); el('keys').children[i]?.classList.add('on'); send({ type: 'play', a: 'down', k: [i], ...(col >= 0 ? { c: col } : {}) }); });
  document.addEventListener('keyup', (e) => { const i = KB.indexOf(e.key.toLowerCase()); if (!kdown.has(i)) return; kdown.delete(i); el('keys').children[i]?.classList.remove('on'); send({ type: 'play', a: 'up', k: [i] }); });
  const isMine = () => !!app && status.holder === app.clientId;

  function buildKeys() {
    const ks = status.keys || [], key = JSON.stringify(ks) + col;
    if (key === keysKey) return;
    keysKey = key;
    el('keys').replaceChildren(...ks.map((k, i) => {
      const b = button(''); b.dataset.k = i; b.style.setProperty('--kc', keyCol(i)); b.title = k.g + ': ' + k.n;
      const e = document.createElement('span'); e.className = 'e'; e.textContent = k.e;
      const d = document.createElement('span'); d.className = 'dot'; d.style.background = keyCol(i);
      const n = document.createElement('span'); n.textContent = (i < 36 ? KB[i].toUpperCase() + ' · ' : '') + k.n.replace(/[_-]+/g, ' ');
      b.append(e, n, d); return b;
    }));
  }

  draw = () => {
    const s = status, me = app?.clientId, mine = isMine(), pos = (s.queue || []).indexOf(me);
    el('namePanel').classList.add('hidden');
    el('lobby').classList.toggle('hidden', mine); el('playing').classList.toggle('hidden', !mine);
    if (mine) {
      el('cols').replaceChildren(...[-1, ...(s.cols || []).keys()].map((i) => {
        const b = button(i < 0 ? '🌈' : '', () => { col = i; render(); });
        if (i >= 0) b.style.background = '#' + s.cols[i]; else b.style.background = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
        b.setAttribute('aria-label', i < 0 ? 'Every key its own colour' : 'Colour ' + (i + 1)); b.setAttribute('aria-pressed', String(i === col)); return b;
      }));
      buildKeys();
      say('🎹 Your turn! Play the lights!');
    } else {
      el('turnHead').textContent = s.holder ? '🎹 Someone is playing' : '🎹 Nobody is playing';
      el('turnInfo').textContent = pos >= 0 ? (pos === 0 ? 'You are next! Get ready…' : `You are number ${pos + 1} in line.`) : `${(s.keys || []).length} keys · a turn lasts ${s.turnSecs || 30} s` + ((s.queue || []).length ? ` · ${s.queue.length} waiting` : '');
      el('join').classList.toggle('hidden', pos >= 0); el('leave').classList.toggle('hidden', pos < 0);
      el('join').disabled = !app || s.phase === 'unconfigured';
      say(s.phase === 'unconfigured' ? s.message : '');
    }
  };
  tickGame = () => { if (isMine()) el('left').textContent = `⏱️ ${secsLeft(status.until)} s`; return ''; };
  el('join').addEventListener('click', () => { send({ type: 'play', a: 'join' }); say('Joining…'); });
  el('leave').addEventListener('click', () => send({ type: 'play', a: 'leave' }));
  el('done').addEventListener('click', () => send({ type: 'play', a: 'leave' }));
