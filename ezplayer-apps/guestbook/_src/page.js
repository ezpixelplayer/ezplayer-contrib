  let colour = 1;
  function swatches(box, cur, set) {
    box.replaceChildren(...(status.colors || []).slice(1).map((c, k) => {
      const i = k + 1, b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + c; b.setAttribute('aria-label', 'Colour ' + i);
      b.setAttribute('aria-pressed', String(i === cur)); b.addEventListener('click', () => { set(i); render(); }); return b;
    }));
  }
  draw = () => {
    const s = status;
    el('text').classList.toggle('hidden', s.free === false); el('textLabel').textContent = s.free === false ? 'Pick a note' : 'Your note';
    el('presets').replaceChildren(...(s.presets || []).map((p) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = p; b.addEventListener('click', () => { el('text').value = p; }); return b; }));
    swatches(el('colours'), colour, (v) => { colour = v; });
    el('bookTitle').textContent = '📝 ' + (s.title || 'The guestbook') + (s.count ? ' (' + s.count + ')' : '');
    const list = s.latest || [];
    el('book').replaceChildren(...(list.length ? list.map((x) => {
      const d = document.createElement('div'), b = document.createElement('b'); b.style.color = '#' + x.c; b.textContent = x.n; d.append(b, x.t); return d;
    }) : [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Nobody has written yet. Be the first!' })]));
    el('send').disabled = !app || s.phase === 'unconfigured';
    const mine = (s.queue || []).findIndex((q) => app && q.id === app.clientId);
    let t = s.message || '';
    if (s.now && app && s.now.id === app.clientId) t = '✨ Your note is on the lights now!';
    else if (mine >= 0) t = mine === 0 ? 'Your note is next!' : 'Your note is number ' + (mine + 1) + ' in line.';
    say(t);
  };
  el('send').addEventListener('click', () => {
    const n = myName(), t = el('text').value.trim();
    if (!n) { el('note').textContent = 'Write your name first.'; return; }
    if (!t) { el('note').textContent = 'Write or pick a note first.'; return; }
    send({ type: 'sign', name: n, text: t, color: colour });
    el('text').value = ''; el('send').disabled = true; say('Sending…'); setTimeout(render, 1200);
  });
