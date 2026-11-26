  let tab = 'text', colour = 1, fx = '', gif = '', gifKey = '', pen = 2, grid = null, gw = 0, gh = 0, painting = false;
  el('namePanel').classList.add('hidden');
  const TABS = [['text', '💬 Message'], ['gif', '🎞️ Picture'], ['fx', '✨ Effect'], ['draw', '🖌️ Draw']];
  function swatches(box, cur, set, from = 1) {
    box.replaceChildren(...(status.colors || []).slice(from).map((c, k) => {
      const i = k + from, b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + c; b.setAttribute('aria-label', 'Colour ' + i);
      b.setAttribute('aria-pressed', String(i === cur)); b.addEventListener('click', () => { set(i); render(); }); return b;
    }));
  }
  function paint(e) {
    const r = el('canvas').getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * gw), y = Math.floor((e.clientY - r.top) / r.height * gh);
    if (x < 0 || y < 0 || x >= gw || y >= gh) return;
    grid[y * gw + x] = pen; drawCanvas();
  }
  function drawCanvas() {
    const c = el('canvas'), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, gw, gh);
    for (let i = 0; i < grid.length; i++) if (grid[i]) { g.fillStyle = '#' + status.colors[grid[i]]; g.fillRect(i % gw, Math.floor(i / gw), 1, 1); }
  }
  el('canvas').addEventListener('pointerdown', (e) => { painting = true; el('canvas').setPointerCapture(e.pointerId); paint(e); });
  el('canvas').addEventListener('pointermove', (e) => { if (painting) paint(e); });
  el('canvas').addEventListener('pointerup', () => { painting = false; });
  el('clear').addEventListener('click', () => { grid.fill(0); drawCanvas(); });
  draw = () => {
    const s = status, a = s.allow || { text: true, fx: true, draw: true, gif: false };
    const tabs = TABS.filter(([k]) => a[k] !== false);
    if (!tabs.some(([k]) => k === tab) && tabs.length) tab = tabs[0][0];
    seg(el('tabs'), tabs, tab, (v) => { tab = v; });
    el('tabs').classList.toggle('hidden', tabs.length < 2);
    el('pText').classList.toggle('hidden', tab !== 'text'); el('pGif').classList.toggle('hidden', tab !== 'gif'); el('pFx').classList.toggle('hidden', tab !== 'fx'); el('pDraw').classList.toggle('hidden', tab !== 'draw');
    el('text').classList.toggle('hidden', s.free === false); el('textLabel').textContent = s.free === false ? 'Pick a message' : 'Your message';
    el('presets').replaceChildren(...(s.presets || []).map((p) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = p; b.addEventListener('click', () => { el('text').value = p; }); return b; }));
    swatches(el('colours'), colour, (v) => { colour = v; });
    el('fxs').replaceChildren(...(s.fx || []).map(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', String(k === fx)); b.addEventListener('click', () => { fx = k; render(); }); return b; }));
    swatches(el('pens'), pen, (v) => { pen = v; }, 0);
    const gl = s.gifs || [];
    if (!gl.some(([f]) => f === gif)) gif = '';
    const gk = JSON.stringify(gl) + gif;
    if (gk !== gifKey) {   // the pictures are drawn again only when the list or the choice changes, so they keep animating
      gifKey = gk;
      el('gifs').replaceChildren(...gl.map(([f, n]) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(f === gif));
        const im = document.createElement('img'); im.src = 'gifs/' + f; im.alt = ''; b.append(im, n); b.addEventListener('click', () => { gif = f; render(); }); return b; }));
    }
    if (s.drawSize && (s.drawSize[0] !== gw || s.drawSize[1] !== gh)) {
      [gw, gh] = s.drawSize; grid = new Uint8Array(gw * gh); el('canvas').width = gw; el('canvas').height = gh;
      el('canvas').style.aspectRatio = gw + ' / ' + gh; el('canvas').style.maxHeight = '55vh'; el('canvas').style.width = 'auto'; el('canvas').style.maxWidth = '100%';
    }
    if (grid) drawCanvas();
    el('send').disabled = !app || s.phase === 'unconfigured';
    const mine = (s.queue || []).findIndex((q) => app && q.id === app.clientId);
    let t = s.message || '';
    if (s.now && app && s.now.id === app.clientId) t = '✨ Yours is on the lights now!';
    else if (mine >= 0) t = mine === 0 ? 'Yours is next!' : 'Yours is number ' + (mine + 1) + ' in line.';
    say(t);
  };
  el('send').addEventListener('click', () => {
    if (tab === 'text') { const t = el('text').value.trim(); if (!t) { el('note').textContent = 'Write or pick a message first.'; return; } send({ type: 'text', text: t, color: colour }); }
    else if (tab === 'gif') { if (!gif) { el('note').textContent = 'Pick a picture first.'; return; } send({ type: 'gif', f: gif }); }
    else if (tab === 'fx') { if (!fx) { el('note').textContent = 'Pick an effect first.'; return; } send({ type: 'fx', fx }); }
    else { if (!grid.some((v) => v)) { el('note').textContent = 'Draw something first.'; return; } send({ type: 'draw', w: gw, h: gh, px: Array.from(grid).join('') }); }
    el('send').disabled = true; say('Sending…'); setTimeout(render, 1200);
  });
