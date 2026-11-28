  //@include sprites.mjs
  el('namePanel').classList.add('hidden');
  const NS = 'http://www.w3.org/2000/svg';
  // the choices in the tray: the decoration, its colour, effects (up to maxFx together) and size; sfx: the star's effects
  let kind = '', col = 0, fx = [], size = 1, sfx = null;
  try { kind = localStorage.getItem('tree2Kind') || ''; fx = JSON.parse(localStorage.getItem('tree2Fx') || '[]'); size = +(localStorage.getItem('tree2Size') || 1); } catch (e) {}
  // tapping an effect adds it or takes it away; Steady goes alone; at most maxFx together (the oldest goes)
  const toggle = (list, k, max) => { if (list.includes(k)) return list.length > 1 ? list.filter((x) => x !== k) : list;
    if (k === 'steady' || max < 2) return [k]; const l = list.filter((x) => x !== 'steady').concat(k); return l.slice(-max); };
  // a decoration drawn on the phone's tree, in its colour (r: its size in the drawing)
  function deco(ns, k, x, y, colour, r, extra) {
    const mk = (tag, at) => { const e = document.createElementNS(ns, tag); for (const [a, v] of Object.entries(at)) e.setAttribute(a, v); return e; };
    const g = mk('g', { transform: `translate(${x} ${y})` }), c = '#' + colour, gold = colour === 'ffc83c' ? '#fff' : '#ffc83c';
    if (k === 'star') { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r * 1.1; p.push((q * Math.cos(a)).toFixed(2) + ',' + (q * Math.sin(a)).toFixed(2)); } g.append(mk('polygon', { points: p.join(' '), fill: c })); }
    else if (k === 'cane') { const d = `M${-r * 0.3} ${r} L${-r * 0.3} ${-r * 0.2} A${r * 0.45} ${r * 0.45} 0 0 1 ${r * 0.6} ${-r * 0.2}`;
      g.append(mk('path', { d, fill: 'none', stroke: c, 'stroke-width': r * 0.5, 'stroke-linecap': 'round' }), mk('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': r * 0.5, 'stroke-dasharray': `${r * 0.35} ${r * 0.35}` })); }
    else if (k === 'bell') g.append(mk('path', { d: `M${-r} ${r * 0.7} Q${-r * 0.7} ${r * 0.5} ${-r * 0.6} ${-r * 0.2} Q${-r * 0.5} ${-r} 0 ${-r} Q${r * 0.5} ${-r} ${r * 0.6} ${-r * 0.2} Q${r * 0.7} ${r * 0.5} ${r} ${r * 0.7} Z`, fill: c }), mk('circle', { cx: 0, cy: r * 0.85, r: r * 0.22, fill: gold }));
    else if (k === 'present') g.append(mk('rect', { x: -r * 0.8, y: -r * 0.6, width: r * 1.6, height: r * 1.5, fill: c }), mk('rect', { x: -r * 0.15, y: -r * 0.6, width: r * 0.3, height: r * 1.5, fill: gold }),
      mk('rect', { x: -r * 0.8, y: r * 0.05, width: r * 1.6, height: r * 0.3, fill: gold }), mk('circle', { cx: -r * 0.25, cy: -r * 0.8, r: r * 0.22, fill: gold }), mk('circle', { cx: r * 0.25, cy: -r * 0.8, r: r * 0.22, fill: gold }));
    else if (k === 'flake') for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.append(mk('line', { x1: -r * Math.cos(a), y1: -r * Math.sin(a), x2: r * Math.cos(a), y2: r * Math.sin(a), stroke: c, 'stroke-width': r * 0.32, 'stroke-linecap': 'round' })); }
    else if (typeof SPRITES !== 'undefined' && SPRITES[k] && !['bauble', 'cane', 'star', 'bell', 'present', 'flake', 'heart'].includes(k)) {   // a theme pack's picture
      const rgb = [parseInt(colour.slice(0, 2), 16), parseInt(colour.slice(2, 4), 16), parseInt(colour.slice(4, 6), 16)], cs = r * 2.2 / 8;
      for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) { const cc = spriteCell(k, gx, gy, rgb); if (cc) g.append(mk('rect', { x: (-r * 1.1 + gx * cs).toFixed(2), y: (-r * 1.1 + gy * cs).toFixed(2), width: (cs + 0.05).toFixed(2), height: (cs + 0.05).toFixed(2), fill: `rgb(${cc.join(',')})` })); }
    }
    else if (k === 'heart') g.append(mk('path', { d: `M0 ${r} C${-r * 1.6} ${-r * 0.1} ${-r * 0.6} ${-r * 1.3} 0 ${-r * 0.35} C${r * 0.6} ${-r * 1.3} ${r * 1.6} ${-r * 0.1} 0 ${r} Z`, fill: c }));
    else g.append(mk('circle', { r, fill: c }), mk('circle', { cx: -r * 0.35, cy: -r * 0.35, r: r * 0.25, fill: '#ffffff88' }));
    if (extra) for (const [a, v] of Object.entries(extra)) g.setAttribute(a, v);
    return g;
  }
  // placed: the decorations put on the drawing but not hung yet ({u, v, k, c, f, s, bad}); sel: the one being changed
  // (an index), -1 (the tray: a new one), 'star' or 'tree'
  let placed = [], sentList = [], sel = -1, tcol = 0, nextAt = 0, sentAt = 0, starNext = 0, treeNext = 0, mine = new Set();
  // the phone's drawing: a triangle 100 x 120, at v (0 top, 1 bottom) this wide; fx across it 0..1
  const PW = (v) => 12 + 76 * v;
  const P = (fx, v) => [50 + (fx - 0.5) * PW(v), 12 + v * 96];
  const wrapT = (x) => ((x % 1) + 1.5) % 1 - 0.5;
  // a round tree: u is where it is round the trunk (turns from the front, + to the right); the phone shows the half
  // facing the visitor (va: how far they turned the tree, 360° only), the front in the middle
  let va = 0, lookTimer = 0, swipeX = null;
  const SIDES = ['Front', 'Front right', 'Right side', 'Back right', 'Back', 'Back left', 'Left side', 'Front left'];
  const fxOf = (u) => { if (!status.round) return u; const r = wrapT(u - va); return Math.abs(r) <= 0.26 ? 0.5 + 2 * r : null; };   // null: the other side
  const uOfFx = (fx) => (status.round ? Math.round(wrapT((fx - 0.5) / 2 + va) * 1000) / 1000 : Math.round(fx * 1000) / 1000);
  const rOf = (s) => Math.max(2.2, Math.min(11, (status.rPhone || 4) * ((status.sizeMul || [0.7, 1, 1.5])[s] || 1)));   // a decoration's size on the drawing
  const turnBy = (k) => { va = ((Math.round(va * 8) + k) % 8 + 8) % 8 / 8;
    clearTimeout(lookTimer); if (status.lookGuide) lookTimer = setTimeout(() => send({ type: 'look', a: va }), 300);   // where they stopped turning
    render(); };
  el('turnL').addEventListener('click', () => turnBy(-1));
  el('turnR').addEventListener('click', () => turnBy(1));
  el('svg').addEventListener('touchstart', (e) => { swipeX = status.turn && !drag && e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  el('svg').addEventListener('touchend', (e) => { if (swipeX === null || drag) { swipeX = null; return; } const dx = e.changedTouches[0].clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) turnBy(dx < 0 ? 1 : -1); }, { passive: true });

  // ---- the live preview: at most 5 a second while the finger moves, the last position always sent
  let prevAt = 0, prevTimer = 0, prevPending = null, lastPrev = null;
  function flushPreview() {
    clearTimeout(prevTimer); prevTimer = 0;
    if (!prevPending || !app) return;
    prevAt = Date.now(); lastPrev = prevPending; prevPending = null;
    send({ type: 'preview', u: lastPrev.u, v: lastPrev.v, k: lastPrev.k, c: lastPrev.c + 1, f: lastPrev.f, s: lastPrev.s });
  }
  function preview(p, now) {
    prevPending = { u: p.u, v: p.v, k: p.k, c: p.c, f: [...p.f], s: p.s };
    const wait = 200 - (Date.now() - prevAt);
    if (now && wait <= 0) flushPreview();
    else if (!prevTimer) prevTimer = setTimeout(flushPreview, Math.max(0, wait));
  }
  // placed but not hung: the ghost on the tree is kept alive every 2 s (it goes 1.5 s after the last preview otherwise)
  setInterval(() => { if (!drag && placed.length && !sentAt && !status.party && status.phase !== 'unconfigured') preview(placed[typeof sel === 'number' && sel >= 0 ? sel : placed.length - 1], true); }, 2000);

  // the effects are folded away (the tray stays small, so the tree is on the screen too); a tap opens them
  let fxOpen = false;
  el('fxToggle').addEventListener('click', () => { fxOpen = !fxOpen; render(); });

  // ---- dragging (pointer events: touch and mouse)
  let drag = null;   // { from: -1 (the tray) or a placed index, id, sx, sy, moved, touch, at: {u, v, on} }
  const svgPoint = (cx, cy) => { const m = el('svg').getScreenCTM(); if (!m) return null; const p = el('svg').createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(m.inverse()); };
  function pointOf(cx, cy) {   // a point of the screen -> where it is on the tree: {u, v, on}
    const p = svgPoint(cx, cy);
    if (!p) return { on: false };
    const v = (p.y - 12) / 96, fx = 0.5 + (p.x - 50) / PW(Math.max(0, Math.min(1, v)));
    return { on: v >= -0.01 && v <= 1.01 && fx >= -0.03 && fx <= 1.03, u: uOfFx(Math.max(0, Math.min(1, fx))), v: Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 };
  }
  const trayItem = () => ({ k: kind, c: col, f: [...fx], s: size });
  function startDrag(e, from) {
    if (e.button > 0 || drag || sel === 'star' || sel === 'tree' || status.party || status.phase === 'unconfigured') return;
    if (from === -1 && placed.length >= (status.maxDeco || 1)) { note(`Up to ${status.maxDeco || 1} at once: hang them, or take one off (✕).`); return; }
    e.preventDefault();
    drag = { from, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse', at: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) {}
    el('svg').classList.add('dragging'); document.body.classList.add('dragging');
    const p = from === -1 ? trayItem() : placed[from];
    const d = el('drag'); d.replaceChildren(deco(NS, p.k, 0, 0, status.colors[p.c], 6 * ((status.sizeMul || [0.7, 1, 1.5])[p.s] || 1)));
    moveDrag(e);
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const y = e.clientY - (drag.touch ? 44 : 0);   // a finger hides what it drags: the decoration is shown (and goes) a little above it
    const d = el('drag'); d.classList.remove('hidden'); d.style.transform = `translate(${e.clientX}px, ${y}px)`;
    drag.at = pointOf(e.clientX, y);
    d.classList.toggle('off', !drag.at.on);
    if (drag.at.on) preview({ ...(drag.from === -1 ? trayItem() : placed[drag.from]), u: drag.at.u, v: drag.at.v });
  }
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const g = drag; drag = null;
    el('drag').classList.add('hidden'); el('svg').classList.remove('dragging'); document.body.classList.remove('dragging');
    if (!g.moved && !cancel) {   // a tap: on a placed one, change it in the tray; on the tray, how it works
      if (g.from >= 0) { sel = g.from; const p = placed[sel]; kind = p.k; col = p.c; fx = [...p.f]; size = p.s; }
      else note('Drag it with your finger onto the tree.');
      render(); return;
    }
    const at = g.at || { on: false };
    if (cancel || !at.on) {
      if (g.from >= 0) { placed.splice(g.from, 1); sel = -1; note('Taken off.'); }
      else if (!cancel) note('Not on the tree: drop it on the tree.');
      render(); return;
    }
    if (g.from === -1) { placed.push({ ...trayItem(), u: at.u, v: at.v, bad: '' }); sel = placed.length - 1; }
    else { Object.assign(placed[g.from], { u: at.u, v: at.v, bad: '' }); sel = g.from; }
    preview(placed[sel], true);
    render();
  }
  el('trayDeco').addEventListener('pointerdown', (e) => startDrag(e, -1));
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });   // no page scroll while dragging
  const note = (t) => { el('note').textContent = t; lastNoteAt = Date.now(); };

  draw = () => {
    if (drag) return;   // the drawing stays as it is while something is dragged
    if (!Array.isArray(status.colors)) return;   // nothing to draw before the first status (the tree, colours and decorations come with it)
    const s = status, svg = el('svg'), decos = s.decos || [], all = s.allKinds || ['bauble'], maxD = s.maxDeco || 1;
    const kl = s.kindList || [['bauble', 'Bauble', '🔴']], sizes = s.sizes || [];
    if (!kl.some(([k]) => k === kind)) kind = kl[0][0];
    if (!sizes.length) size = 1; else if (!sizes.some(([i]) => i === size)) size = sizes.some(([i]) => i === 1) ? 1 : sizes[0][0];
    placed = placed.filter((p) => kl.some(([k]) => k === p.k));
    if (sel === 'star' ? !s.starPick : sel === 'tree' ? !s.treePick : sel >= placed.length) sel = -1;
    if (!s.turn) va = 0;
    el('turn').classList.toggle('hidden', !s.turn);
    el('turnLabel').textContent = SIDES[Math.round(va * 8) % 8];
    // my ghost on the real tree: the app says whether that place is allowed (and why not)
    const myG = (s.ghosts || []).find((x) => app && x.by === app.clientId);
    if (myG) for (const p of placed) if (p.u === myG.u && p.v === myG.v) p.bad = myG.ok ? '' : myG.why || '';
    svg.replaceChildren();
    // the tree, in its colour (darker on the phone); a visitor can tap it to change its colour
    const tc = sel === 'tree' ? (s.treeCols || [])[tcol] || '1e9e3c' : s.treeCol || '1e9e3c';
    const dk = (h, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(at)) e.setAttribute(a, v); return e; };
    const tri = mk('polygon', { points: '50,6 94,108 6,108', fill: dk(tc, 0.45), stroke: sel === 'tree' ? '#fff' : dk(tc, 0.8), 'stroke-width': sel === 'tree' ? '1' : '0.5' });
    if (s.treePick) { tri.style.cursor = 'pointer'; tri.onclick = () => { if (sel === 'tree') sel = -1; else sel = 'tree'; render(); }; }
    svg.append(tri, mk('rect', { x: 44, y: 108, width: 12, height: 9, fill: '#5a3412' }));
    // the star: in its colour on the lights (or the colour being picked); a visitor can tap it to change it
    const pts = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.6 : 6.4; pts.push((50 + r * Math.cos(a)).toFixed(2) + ',' + (7 + r * Math.sin(a)).toFixed(2)); }
    const star = mk('polygon', { points: pts.join(' '), fill: '#' + (sel === 'star' ? s.colors[col] : s.starCol || 'ffbe28'), stroke: sel === 'star' ? '#fff' : '#0008', 'stroke-width': sel === 'star' ? '0.9' : '0.5' });
    if (s.starPick) { star.style.cursor = 'pointer'; star.onclick = () => { if (sel === 'star') sel = -1; else sel = 'star'; render(); }; }
    svg.append(star);
    // the decorations hung (yours with a white ring), then the others' ghosts (blinking), then yours not hung yet
    decos.forEach(([u, v, k, c, f, sz], i) => {
      const x = fxOf(u); if (x === null) return;
      const [px, py] = P(x, v);
      svg.append(deco(NS, all[k] || 'bauble', px, py, s.colors[c - 1], rOf(sz), mine.has(i) ? { stroke: '#fff', 'stroke-width': '0.5' } : null));
    });
    for (const g of s.ghosts || []) {
      if (app && g.by === app.clientId) continue;
      const x = fxOf(g.u); if (x === null) continue;
      const [px, py] = P(x, g.v);
      svg.append(mk('circle', { cx: px, cy: py, r: rOf(g.s) + 1, fill: 'none', stroke: '#' + s.colors[g.c - 1], 'stroke-width': '0.8', 'stroke-dasharray': '1.5 1', class: 'ghost' }));
    }
    placed.forEach((p, i) => {
      const x = fxOf(p.u); if (x === null) return;
      const [px, py] = P(x, p.v), r = rOf(p.s), on = i === sel;
      const g = deco(NS, p.k, px, py, s.colors[p.c], r, { class: 'placed', stroke: p.bad ? '#ff5050' : on ? '#fff' : '#ffffffcc', 'stroke-width': on ? '0.6' : '0.4', 'stroke-dasharray': on ? '' : '1 0.7' });
      g.addEventListener('pointerdown', (e) => startDrag(e, i));
      const xb = mk('g', { class: 'xbtn', transform: `translate(${(px + r * 0.95).toFixed(2)} ${(py - r * 0.95).toFixed(2)})` });
      xb.append(mk('circle', { r: 2.6, fill: '#000c', stroke: '#fff', 'stroke-width': '0.4' }), mk('path', { d: 'M-1.1 -1.1 L1.1 1.1 M1.1 -1.1 L-1.1 1.1', stroke: '#fff', 'stroke-width': '0.6', 'stroke-linecap': 'round' }));
      xb.setAttribute('aria-label', 'Take it off');
      xb.addEventListener('pointerdown', (e) => e.stopPropagation());
      xb.addEventListener('click', (e) => { e.stopPropagation(); placed.splice(i, 1); sel = -1; render(); });
      svg.append(g, xb);
    });
    // the tray: the decoration drawn big, the choices; or the star's / the tree's colours while one of them is picked
    const pickStar = sel === 'star', pickTree = sel === 'tree';
    el('trayDeco').classList.toggle('off', pickStar || pickTree || placed.length >= maxD);
    el('traySvg').replaceChildren(pickStar ? mk('polygon', { points: pts.map((q) => q.split(',').map((n, j) => ((+n - (j ? 7 : 50)) * 1.6).toFixed(2)).join(',')).join(' '), fill: '#' + s.colors[col] })
      : pickTree ? mk('polygon', { points: '0,-11 10,10 -10,10', fill: '#' + ((s.treeCols || [])[tcol] || '1e9e3c') })
      : deco(NS, kind, 0, 0, s.colors[col], 6 * ((s.sizeMul || [0.7, 1, 1.5])[size] || 1)));
    el('step1').textContent = pickStar ? 'The star: pick its colour and effects' : pickTree ? 'The tree: pick its colour' : typeof sel === 'number' && sel >= 0 ? 'Changing the one with the white outline' : '1 · Pick your decoration';
    el('trayHint').textContent = pickStar || pickTree ? 'Then press the button below.' : placed.length >= maxD ? `That is ${maxD}: hang them, or take one off (✕).` : '2 · Drag it onto the tree ⬇';
    const upd = () => { if (typeof sel === 'number' && sel >= 0 && placed[sel]) { Object.assign(placed[sel], { k: kind, c: col, f: [...fx], s: size, bad: '' }); preview(placed[sel], true); } };   // a change goes to the one being changed
    el('kinds').classList.toggle('hidden', kl.length < 2 || pickStar || pickTree);
    el('kinds').replaceChildren(...kl.map(([k, n, e]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e + ' ' + n; b.setAttribute('aria-pressed', String(k === kind));
      b.onclick = () => { kind = k; upd(); try { localStorage.setItem('tree2Kind', k); } catch (er) {} render(); }; return b; }));
    el('sizes').classList.toggle('hidden', sizes.length < 2 || pickStar || pickTree);
    el('sizes').replaceChildren(...sizes.map(([i, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', String(i === size));
      b.onclick = () => { size = i; upd(); try { localStorage.setItem('tree2Size', String(i)); } catch (er) {} render(); }; return b; }));
    const fl = pickStar ? s.starFxList || [] : s.fxList || [], okKeys = fl.map(([k]) => k), max = s.maxFx || 3;
    if (pickStar) { if (!sfx) sfx = (s.starFx || []).filter((k) => okKeys.includes(k)); sfx = sfx.filter((k) => okKeys.includes(k)).slice(-max); if (!sfx.length && okKeys.length) sfx = [okKeys[0]]; }
    else { fx = fx.filter((k) => okKeys.includes(k)).slice(-max); if (!fx.length && okKeys.length) fx = [okKeys[0]]; }
    const curFx = pickStar ? sfx : fx;
    el('fxToggle').classList.toggle('hidden', fl.length < 2 || pickTree);
    el('fxToggle').textContent = '✨ ' + (curFx.length ? curFx.map((k) => (fl.find(([x]) => x === k) || [k, k])[1]).join(' + ') : 'Effects') + (fxOpen ? ' ▴' : ' ▾');
    el('fxToggle').setAttribute('aria-expanded', String(fxOpen));
    el('fxBox').classList.toggle('hidden', !fxOpen || fl.length < 2 || pickTree);
    el('fxs').replaceChildren(...fl.map(([k, n, e]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e + ' ' + n; b.setAttribute('aria-pressed', String(curFx.includes(k)));
      b.onclick = () => { if (pickStar) sfx = toggle(sfx, k, max); else { fx = toggle(fx, k, max); upd(); try { localStorage.setItem('tree2Fx', JSON.stringify(fx)); } catch (er) {} } render(); }; return b; }));
    el('fxHint').textContent = pickTree ? '' : fl.length > 1 && max > 1 ? `Effects: tap up to ${max}; they take turns on the lights (Steady goes alone).` : '';
    const sw = (list, cur, set, label) => list.map((h, k) => { const b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + h; b.setAttribute('aria-label', label + ' ' + (k + 1)); b.setAttribute('aria-pressed', String(k === cur)); b.onclick = () => { set(k); render(); }; return b; });
    el('cols').replaceChildren(...(pickTree ? sw(s.treeCols || [], tcol, (k) => { tcol = k; }, 'Tree colour') : sw(s.colors || [], col, (k) => { col = k; upd(); }, 'Colour')));
    const left = Math.ceil(((pickStar ? starNext : pickTree ? treeNext : nextAt) - Date.now()) / 1000);
    el('hang').textContent = pickStar ? 'Colour the star!' : pickTree ? 'Colour the tree!' : placed.length > 1 ? `Hang them on the tree! (${placed.length})` : 'Hang it on the tree!';
    el('hang').disabled = !app || (!pickStar && !pickTree && !placed.length) || left > 0 || s.party || s.phase === 'unconfigured' || Date.now() - sentAt < 3000;
    const bad = placed.find((p) => p.bad);
    el('placedHint').textContent = bad ? '⚠️ ' + bad.bad + '. Drag it somewhere else.' : placed.length ? `${placed.length} placed (dashed): drag to move, ✕ to take off.` : '';
    el('placedHint').classList.toggle('bad', !!bad);
    const others = (s.ghosts || []).filter((g) => !app || g.by !== app.clientId).length;
    const n = decos.length, of = ' (' + n + ' of ' + (s.maxOn || n) + ')';
    say(s.phase === 'unconfigured' ? s.message : s.party ? '🎉 The tree is full! Party on the lights!'
      : pickTree ? (left > 0 ? 'You can change the tree\'s colour again in ' + left + ' s.' : 'Pick a colour for the tree, then press Colour the tree!')
      : pickStar ? (left > 0 ? 'You can change the star again in ' + left + ' s.' : 'Pick a colour and effects for the star, then press Colour the star!')
      : left > 0 ? 'You can hang more decorations in ' + left + ' s.' + of
      : !placed.length ? 'Drag your decoration onto the tree: it blinks on the real tree where you hold it.' + of + (s.turn ? ' Turn the tree with ◀ ▶ (or swipe) to decorate it all the way round.' : s.round ? ' This is the front of the tree, as you see it.' : '') + (s.starPick || s.treePick ? ' Tap ' + [s.starPick && 'the star', s.treePick && 'the tree'].filter(Boolean).join(' or ') + ' to change its colour.' : '') + (others ? ' 👀 Someone else is placing one too.' : '')
      : (placed.length < maxD ? 'Drag more, or press ' : 'Press ') + (placed.length > 1 ? 'Hang them on the tree!' : 'Hang it on the tree!') + of);
  };
  tickGame = () => { if (Math.max(nextAt, starNext, treeNext) > Date.now() - 1000) draw(); return ''; };
  onStatus = (o, s) => {
    if (s.lastBy && app && s.lastBy === app.clientId && s.hung !== o.hung) {   // mine were hung: those go from the placed ones (refused ones stay, with why)
      const okSet = new Set(s.lastOk || []), hungNow = sentList.filter((_, i) => okSet.has(i));
      placed = placed.filter((p) => !hungNow.includes(p));
      mine = new Set(s.lastSet || []); sel = -1; nextAt = Date.now() + (s.every || 0) * 1000; sentAt = 0; sentList = [];
    }
    if (s.starLastBy && app && s.starLastBy === app.clientId && s.starAt !== o.starAt) { sfx = null; starNext = Date.now() + (s.starEvery || 0) * 1000; sentAt = 0; sel = -1; }
    if (s.treeLastBy && app && s.treeLastBy === app.clientId && s.treeAt !== o.treeAt) { treeNext = Date.now() + (s.starEvery || 0) * 1000; sentAt = 0; sel = -1; }
    if (s.party && !o.party) { placed = []; sel = -1; }
    if (app && s.notices && s.notices[app.clientId]) sentAt = 0;
  };
  el('hang').addEventListener('click', () => {
    if (sel === 'tree') { sentAt = Date.now(); send({ type: 'tree', c: tcol + 1 }); say('Colouring the tree… watch the lights 🎄'); el('hang').disabled = true; return; }
    if (sel === 'star') { sentAt = Date.now(); send({ type: 'star', c: col + 1, ...(sfx && sfx.length ? { f: sfx } : {}) }); say('Colouring the star… watch the lights ✨'); el('hang').disabled = true; return; }
    if (!placed.length) return;
    sentAt = Date.now(); sentList = [...placed];
    send({ type: 'hang', d: placed.map((p) => [p.u, p.v, p.k, p.c + 1, p.f, p.s]) });
    say((placed.length > 1 ? 'Hanging them' : 'Hanging it') + '… watch the lights ✨'); el('hang').disabled = true;
  });
