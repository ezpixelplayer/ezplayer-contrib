  //@include sprites.mjs
  el('namePanel').classList.add('hidden');
  let kind = 'bauble', fx = [], sfx = null;   // the effects picked (up to 3 together) for the decoration, and for the star
  try { kind = localStorage.getItem('treeKind') || 'bauble'; fx = JSON.parse(localStorage.getItem('treeFx2') || '[]'); } catch (e) {}
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
  // picks: the decorations chosen but not hung yet (spot -> {k, c, f}); sel: the one being changed, or 'star'
  const picks = new Map(); let mine = new Set();
  let sel = -1, col = 0, tcol = 0, nextAt = 0, sentAt = 0, starNext = 0, treeNext = 0;   // sel: a spot, 'star' or 'tree'   // sentAt: a bauble on its way; the button waits for the answer (3 s at most)
  // a spot (u across, v down the tree's grid) drawn on a tree shape: narrow at the top, wide at the bottom
  const P = (u, v) => [50 + (u - 0.5) * (12 + 76 * v), 12 + v * 96];
  // a round tree: a spot comes as where it is round the trunk (turns from the front, + to the right); the phone shows
  // the half facing the visitor (va: how far they turned the tree, 360° only), the front in the middle
  let va = 0, lookTimer = 0, swipeX = null;
  const SIDES = ['Front', 'Front right', 'Right side', 'Back right', 'Back', 'Back left', 'Left side', 'Front left'];
  const turnBy = (k) => { va = ((Math.round(va * 8) + k) % 8 + 8) % 8 / 8;
    clearTimeout(lookTimer); if (status.lookGuide) lookTimer = setTimeout(() => send({ type: 'look', a: va }), 300);   // where they stopped turning
    render(); };
  el('turnL').addEventListener('click', () => turnBy(-1));
  el('turnR').addEventListener('click', () => turnBy(1));
  el('svg').addEventListener('touchstart', (e) => { swipeX = status.turn && e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  el('svg').addEventListener('touchend', (e) => { if (swipeX === null) return; const dx = e.changedTouches[0].clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) turnBy(dx < 0 ? 1 : -1); }, { passive: true });
  draw = () => {
    const s = status, svg = el('svg'), ns = 'http://www.w3.org/2000/svg', sp = s.spots || [], orn = s.orn || '';
    for (const i of [...picks.keys()]) if (orn[i] !== '0' || i >= sp.length) picks.delete(i);
    if (sel === 'star' ? !s.starPick : sel === 'tree' ? !s.treePick : sel >= 0 && !picks.has(sel)) sel = -1;
    const maxD = s.maxDeco || 1;
    svg.replaceChildren();
    // the tree, in its colour (darker on the phone); a visitor can tap it to change its colour
    const tc = sel === 'tree' ? (s.treeCols || [])[tcol] || '1e9e3c' : s.treeCol || '1e9e3c';
    const dk = (h, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
    const tri = document.createElementNS(ns, 'polygon'); tri.setAttribute('points', '50,6 94,110 6,110'); tri.setAttribute('fill', dk(tc, 0.45)); tri.setAttribute('stroke', sel === 'tree' ? '#fff' : dk(tc, 0.8)); tri.setAttribute('stroke-width', sel === 'tree' ? '1' : '0.5');
    if (s.treePick) { tri.style.cursor = 'pointer'; tri.onclick = () => { sel = 'tree'; picks.clear(); render(); }; }
    svg.append(tri);
    const trunk = document.createElementNS(ns, 'rect'); trunk.setAttribute('x', 44); trunk.setAttribute('y', 110); trunk.setAttribute('width', 12); trunk.setAttribute('height', 8); trunk.setAttribute('fill', '#5a3412'); svg.append(trunk);
    // the star: in its colour on the lights (or the colour being picked); a visitor can tap it to change its colour
    const star = document.createElementNS(ns, 'polygon'), pts = [];
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.6 : 6.4; pts.push((50 + r * Math.cos(a)).toFixed(2) + ',' + (7 + r * Math.sin(a)).toFixed(2)); }
    star.setAttribute('points', pts.join(' ')); star.setAttribute('fill', '#' + (sel === 'star' ? s.colors[col] : s.starCol || 'ffbe28'));
    star.setAttribute('stroke', sel === 'star' ? '#fff' : '#0008'); star.setAttribute('stroke-width', sel === 'star' ? '0.9' : '0.5');
    if (s.starPick) { star.style.cursor = 'pointer'; star.onclick = () => { sel = 'star'; picks.clear(); render(); }; }
    svg.append(star);
    const kl = s.kindList || [['bauble', 'Bauble', '🔴']], all = s.allKinds || ['bauble'];
    if (!s.turn) va = 0;
    el('turn').classList.toggle('hidden', !s.turn);
    el('turnLabel').textContent = SIDES[Math.round(va * 8) % 8];
    const uOf = (u) => { if (!s.round) return u; const r = ((u - va) % 1 + 1.5) % 1 - 0.5; return Math.abs(r) <= 0.26 ? Math.max(0.03, Math.min(0.97, 0.5 + 2 * r)) : null; };
    if (!kl.some(([k]) => k === kind)) kind = kl[0][0];
    sp.forEach(([u0, v], i) => {
      const u = uOf(u0);
      if (u === null) return;   // on the other side of the tree
      const [x, y] = P(u, v), o = orn[i];
      let c;
      const pk = picks.get(i);
      if (o === '0' && pk) c = deco(ns, pk.k, x, y, s.colors[pk.c], i === sel ? 4.4 : 3.8, { stroke: i === sel ? '#fff' : '#ffffffaa', 'stroke-width': i === sel ? '0.5' : '0.25', 'stroke-dasharray': i === sel ? '' : '0.8 0.6' });
      else if (o === '0') { c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3.6); c.setAttribute('stroke-width', '0.7'); c.setAttribute('fill', '#ffffff14'); c.setAttribute('stroke', '#ffffff88'); c.setAttribute('stroke-dasharray', '1.2 1'); }
      else c = deco(ns, all[+(s.kinds || '')[i] || 0] || 'bauble', x, y, s.colors[+o - 1], 3.4, mine.has(i) ? { stroke: '#fff', 'stroke-width': '0.4' } : null);
      c.style.cursor = 'pointer';
      c.onclick = () => {
        if (orn[i] !== '0') { el('note').textContent = mine.has(i) ? 'That is yours! ✨' : 'This spot is taken. Pick a free one.'; return; }
        if (sel === 'star' || sel === 'tree') sel = -1;
        if (picks.has(i)) { if (sel === i) { picks.delete(i); sel = picks.size ? [...picks.keys()].pop() : -1; } else { sel = i; const p = picks.get(i); kind = p.k; col = p.c; fx = [...p.f]; } }
        else if (maxD === 1) { picks.clear(); picks.set(i, { k: kind, c: col, f: [...fx] }); sel = i; }
        else if (picks.size >= maxD) el('note').textContent = `Up to ${maxD} decorations at once. Tap a chosen one twice to take it off.`;
        else { picks.set(i, { k: kind, c: col, f: [...fx] }); sel = i; }
        render(); };
      svg.append(c);
    });
    el('kinds').classList.toggle('hidden', kl.length < 2 || sel === 'star' || sel === 'tree');
    // the effect: of the decoration, or of the star while the star is picked
    const fl = sel === 'star' ? s.starFxList || [] : s.fxList || [];
    const okKeys = fl.map(([k]) => k), max = s.maxFx || 3;
    if (sel === 'star') { if (!sfx) sfx = (s.starFx || []).filter((k) => okKeys.includes(k)); sfx = sfx.filter((k) => okKeys.includes(k)).slice(-max); if (!sfx.length && okKeys.length) sfx = [okKeys[0]]; }
    else { fx = fx.filter((k) => okKeys.includes(k)).slice(-max); if (!fx.length && okKeys.length) fx = [okKeys[0]]; }
    const curFx = sel === 'star' ? sfx : fx;
    const upd = () => { if (sel !== 'star' && picks.has(sel)) picks.set(sel, { k: kind, c: col, f: [...fx] }); };   // a change goes to the decoration being changed
    el('fxs').classList.toggle('hidden', fl.length < 2 || sel === 'tree');
    el('fxs').replaceChildren(...fl.map(([k, n, e]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e + ' ' + n; b.setAttribute('aria-pressed', String(curFx.includes(k)));
      b.onclick = () => { if (sel === 'star') sfx = toggle(sfx, k, max); else { fx = toggle(fx, k, max); upd(); try { localStorage.setItem('treeFx2', JSON.stringify(fx)); } catch (er) {} } render(); }; return b; }));
    el('fxHint').textContent = sel === 'tree' ? '' : fl.length > 1 && max > 1 ? `Effects: tap up to ${max}; they take turns on the lights (Steady goes alone).` : '';
    el('kinds').replaceChildren(...kl.map(([k, n, e]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e + ' ' + n; b.setAttribute('aria-pressed', String(k === kind));
      b.onclick = () => { kind = k; upd(); try { localStorage.setItem('treeKind', k); } catch (er) {} render(); }; return b; }));
    if (sel === 'tree') el('cols').replaceChildren(...(s.treeCols || []).map((h, k) => { const b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + h; b.setAttribute('aria-label', 'Tree colour ' + (k + 1)); b.setAttribute('aria-pressed', String(k === tcol)); b.onclick = () => { tcol = k; render(); }; return b; }));
    else el('cols').replaceChildren(...(s.colors || []).map((h, k) => { const b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + h; b.setAttribute('aria-label', 'Colour ' + (k + 1)); b.setAttribute('aria-pressed', String(k === col)); b.onclick = () => { col = k; upd(); render(); }; return b; }));
    const left = Math.ceil(((sel === 'star' ? starNext : sel === 'tree' ? treeNext : nextAt) - Date.now()) / 1000);
    el('hang').textContent = sel === 'star' ? 'Colour the star!' : sel === 'tree' ? 'Colour the tree!' : picks.size > 1 ? `Show my ${picks.size} decorations on the tree!` : 'Show it on the tree!';
    el('hang').disabled = !app || (sel !== 'star' && sel !== 'tree' && !picks.size) || left > 0 || s.party || s.phase === 'unconfigured' || Date.now() - sentAt < 3000;
    const n = sp.length, used = n - [...orn].filter((c) => c === '0').length;
    say(s.phase === 'unconfigured' ? s.message : s.party ? '🎉 The tree is full! Party on the lights!'
      : sel === 'tree' ? (left > 0 ? 'You can change the tree\'s colour again in ' + left + ' s.' : 'Pick a colour for the tree, then press Colour the tree!')
      : sel === 'star' ? (left > 0 ? 'You can change the star again in ' + left + ' s.' : 'Pick a colour and an effect for the star, then press Colour the star!')
      : left > 0 ? 'You can hang more decorations in ' + left + ' s. (' + used + ' of ' + n + ')'
      : !picks.size ? (maxD > 1 ? `Tap free spots on the tree (up to ${maxD})` : 'Tap a free spot on the tree') + (s.starPick || s.treePick ? ', or ' + [s.starPick && 'the star', s.treePick && 'the tree'].filter(Boolean).join(' or ') + ' to change its colour' : '') + '. (' + used + ' of ' + n + ' decorations)' + (s.turn ? ' Turn the tree with ◀ ▶ (or swipe) to decorate it all the way round.' : s.round ? ' This is the front of the tree, as you see it.' : '') : `Pick a decoration, a colour and effects for the one with the white ring. ${picks.size < maxD ? 'Tap more spots, or ' : ''}press Show it on the tree! (tap a chosen one twice to take it off)`);
  };
  tickGame = () => { if (Math.max(nextAt, starNext) > Date.now() - 1000) draw(); return ''; };   // the countdown (draw only: render calls this)
  onStatus = (o, s) => { if (s.lastBy && app && s.lastBy === app.clientId && s.hung !== o.hung) { mine = new Set(s.lastSet || [s.last]); picks.clear(); sel = -1; nextAt = Date.now() + (s.every || 0) * 1000; sentAt = 0; }
    if (s.starLastBy && app && s.starLastBy === app.clientId && s.starAt !== o.starAt) { sfx = null; starNext = Date.now() + (s.starEvery || 0) * 1000; sentAt = 0; sel = -1; }
    if (s.treeLastBy && app && s.treeLastBy === app.clientId && s.treeAt !== o.treeAt) { treeNext = Date.now() + (s.starEvery || 0) * 1000; sentAt = 0; sel = -1; }
    if (app && s.notices && s.notices[app.clientId]) sentAt = 0; };
  el('hang').addEventListener('click', () => {
    if (sel === 'tree') { sentAt = Date.now(); send({ type: 'tree', c: tcol + 1 }); say('Colouring the tree… watch the lights 🎄'); el('hang').disabled = true; return; }
    if (sel === 'star') { sentAt = Date.now(); send({ type: 'star', c: col + 1, ...(sfx && sfx.length ? { f: sfx } : {}) }); say('Colouring the star… watch the lights ✨'); el('hang').disabled = true; return; }
    if (!picks.size) return;
    sentAt = Date.now(); send({ type: 'hang', d: [...picks].map(([i, p]) => [i, p.c + 1, p.k, p.f]) }); say((picks.size > 1 ? 'Hanging them' : 'Hanging it') + '… watch the lights ✨'); el('hang').disabled = true;
  });
