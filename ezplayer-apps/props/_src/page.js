  //@include models.mjs
  let prop = -1, fx = '', pal = '', mine = [0], speed = 1, eng = null, engKey = '';
  try { const v = JSON.parse(localStorage.getItem('propsPick') || '{}'); fx = v.fx || ''; pal = v.pal || ''; speed = v.speed ?? 1; mine = v.mine || [0]; } catch (e) {}
  const keep = () => { try { localStorage.setItem('propsPick', JSON.stringify({ fx, pal, speed, mine })); } catch (e) {} };
  const button = (text, f) => { const b = document.createElement('button'); b.type = 'button'; if (text) b.textContent = text; b.addEventListener('click', f); return b; };
  // the preview: a pair of feathered wings, 12 x 8 pixels each, drawn with the same maths as the app
  const WING = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) if (x <= 11 - Math.abs(y - 2.5) * 1.4 || (y > 3 && x < 12 - (y - 3) * 2.2)) WING.push([x, y]);
  const wingGeom = (side) => new Geom(side === 'L' ? 'WingLeft' : 'WingRight', 'nodes', WING.length,
    WING.map(([x]) => (side === 'L' ? 11 - x : x) / 11), WING.map(([, y]) => 1 - y / 7));
  const GEOMS = [wingGeom('L'), wingGeom('R')];
  let t0 = performance.now(), lastT = 0;
  function preview() {
    const c = el('preview'), g = c.getContext('2d'), t = (performance.now() - t0) / 1000;
    const key = [fx, pal, mine.join(), speed].join('|');
    if (key !== engKey) { engKey = key; eng = new PropFx(GEOMS, fx || 'solid', coloursOf(pal, mine), SPEEDS[speed]); }
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    const dt = Math.min(0.2, t - lastT); lastT = t;
    GEOMS.forEach((gm, gi) => {
      const b = eng.frame(gi, t, dt);
      WING.forEach(([x, y], i) => {
        g.fillStyle = `rgb(${b[i * 3]},${b[i * 3 + 1]},${b[i * 3 + 2]})`;
        g.beginPath(); g.arc(gi === 0 ? 114 - x * 9 : 126 + x * 9, y * 11 + 9, 3.6, 0, 6.3); g.fill();
      });
    });
    requestAnimationFrame(preview);
  }
  requestAnimationFrame(preview);

  draw = () => {
    el('namePanel').classList.add('hidden');
    const s = status, props = s.props || [];
    if (!props[prop]?.ok) prop = props.findIndex((p) => p.ok);
    el('props').replaceChildren(...props.map((p, i) => {
      const b = button('', () => { prop = i; render(); });
      const e = document.createElement('span'); e.className = 'e'; e.textContent = p.e; b.append(e, p.n);
      if (p.now) { const z = document.createElement('span'); z.className = 'busy'; z.textContent = p.now.id === app?.clientId ? 'yours, now' : p.queue.length ? `busy · ${p.queue.length} waiting` : `busy · ${p.now.left} s`; b.append(z); }
      b.disabled = !p.ok; b.setAttribute('aria-pressed', String(i === prop)); return b;
    }));
    const fl = s.fx || [];
    if (!fl.some(([k]) => k === fx)) fx = (fl[0] || [''])[0];
    el('fxs').replaceChildren(...fl.map(([k, n, e]) => {
      const b = button('', () => { fx = k; keep(); render(); });
      const sp = document.createElement('span'); sp.className = 'e'; sp.textContent = e; b.append(sp, n); b.setAttribute('aria-pressed', String(k === fx)); return b;
    }));
    const pl = (s.pals || []).map(([k, n, c]) => [k, n, c]);
    if (s.mine) pl.push(['mine', 'My colours', mine.map((i) => (s.myCols || [])[i] || 'ffffff')]);
    if (!pl.some(([k]) => k === pal)) pal = (pl[0] || [''])[0];
    el('pals').replaceChildren(...pl.map(([k, n, c]) => {
      const b = button('', () => { pal = k; keep(); render(); });
      const bar = document.createElement('span'); bar.className = 'bar'; bar.style.background = c.length > 1 ? `linear-gradient(90deg, ${c.map((x) => '#' + x).join(', ')})` : '#' + c[0];
      b.append(n, bar); b.setAttribute('aria-pressed', String(k === pal)); return b;
    }));
    el('mine').classList.toggle('hidden', pal !== 'mine');
    el('mine').replaceChildren(...(s.myCols || []).map((h, i) => {
      const b = button('', () => { const j = mine.indexOf(i); if (j >= 0) { if (mine.length > 1) mine.splice(j, 1); } else { mine.push(i); if (mine.length > 3) mine.shift(); } keep(); render(); });
      b.style.background = '#' + h; b.setAttribute('aria-label', 'Colour ' + (i + 1)); b.setAttribute('aria-pressed', String(mine.includes(i)));
      if (mine.includes(i)) b.textContent = String(mine.indexOf(i) + 1); return b;
    }));
    seg(el('speed'), [[0, '🐢 Slow'], [1, 'Normal'], [2, '🐇 Fast']], speed, (v) => { speed = v; keep(); });
    el('send').disabled = !app || s.phase === 'unconfigured' || prop < 0;
    const p = props[prop], me = app?.clientId;
    let t = s.message || '';
    const minePos = props.map((q) => q.queue.indexOf(me));
    const on = props.findIndex((q) => q.now && q.now.id === me);
    if (on >= 0) t = `✨ Your ${props[on].n} is lighting up now!`;
    else if (minePos.some((x) => x >= 0)) { const i = minePos.findIndex((x) => x >= 0); t = minePos[i] === 0 ? `Your ${props[i].n} is next!` : `Your ${props[i].n} is number ${minePos[i] + 1} in line.`; }
    else if (p && p.now && !s.queueMode) t = `${p.n} is busy; yours will replace it.`;
    say(t);
  };
  el('send').addEventListener('click', () => {
    if (prop < 0) return;
    send({ type: 'prop', i: prop, fx, pal, mine, speed });
    say('Sending…');
  });
