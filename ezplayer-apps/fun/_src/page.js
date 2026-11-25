  const PBT = {"tree":{"n":"Tree","e":"🎄","g":[".......11.......","......1111......",".......22.......","......2222......",".....223222.....","....22222222....","....22224222....","...2222222222...","...2322222232...","..222222222222..","..222242222422..",".22222222222222.",".......55.......",".......55.......","6666666666666666","6666666666666666"],"c":{"1":4,"2":5,"3":2,"4":6,"5":3,"6":1}},"star":{"n":"Star","e":"⭐","g":[".......11.......",".......11.......","......1111......","......1111......","1111111111111111",".11111222211111.","..111122221111..","...1112222111...","....11222211....","....11111111....","...1111..1111...","...111....111...","..111......111..","..11........11..",".11..........11.","................"],"c":{"1":4,"2":3}},"snowman":{"n":"Snowman","e":"⛄","g":["......1111......","......1111......",".....111111.....","......2222......",".....222222.....",".....224222.....","......2222......",".....555555.....","....33333333....","...3333633333...","...3333333333...","...3333633333...","...3333333333...","....33333333....",".....333333.....","................"],"c":{"1":7,"2":1,"3":1,"4":3,"5":2,"6":6}},"present":{"n":"Present","e":"🎁","g":["................","....33....33....","...3333..3333...","....33333333....","......3333......","..111112211111..","..111112211111..","..111112211111..","..111112211111..","..222222222222..","..111112211111..","..111112211111..","..111112211111..","..111112211111..","..111112211111..","................"],"c":{"1":2,"2":4,"3":5}},"bauble":{"n":"Bauble","e":"🔴","g":[".......33.......",".......33.......","......3333......","......1111......","....11111111....","...1111111111...","..111111111111..","..111111111111..","..222222222222..","..222222222222..","..222222222222..","..111111111111..","..111111111111..","...1111111111...","....11111111....","......1111......"],"c":{"1":2,"2":4,"3":1}},"bell":{"n":"Bell","e":"🔔","g":[".....33..33.....",".....333333.....",".......33.......","......1111......","......1111......",".....111111.....",".....111111.....","....11111111....","....11111111....","...1111111111...","...1111111111...",".11111111111111.",".11111111111111.",".......22.......",".......22.......","................"],"c":{"1":4,"2":3,"3":2}}};
  const PAL = ['000000', 'ffffff', 'ff2a2a', 'ff7a1a', 'ffd23f', '39d353', '2bb7ff', '9b5cff', 'ff4fd8'];
  const FUNS = { photo: ['📸', 'Photo frame'], wheel: ['🎰', 'Wheel'], animal: ['🐾', 'Animals'], paint: ['🖍️', 'Paint'],
    bell: ['🔔', 'Bell'], snow: ['🌨️', 'Snow'], hunt: ['🔦', 'Treasure hunt'], song: ['🎶', 'Guess the song'] };
  const PANE = { photo: 'fPhoto', wheel: 'fWheel', animal: 'fAnimal', paint: 'fPaint', bell: 'fBell', snow: 'fSnow', hunt: 'fHunt', song: 'fSong' };
  const FRAME_E = { snow: '❄️', hearts: '💖', stars: '⭐', santa: '🎅', rainbow: '🌈' };
  let cur = '', frame = '', animal = '', pbT = 'tree', pbCol = 2, pbFill = {}, wheelKey = '', huAt = -1, huPick = -1, soPick = -1, soFor = '', seenRes = 0, statusAt = Date.now();
  try { cur = localStorage.getItem('funCur') || ''; } catch (e) {}
  const closed = () => !app || status.phase === 'unconfigured';
  const button = (cls, text, f) => { const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.textContent = text; if (f) b.addEventListener('click', f); return b; };
  function chooser(box, list, sel, set) {
    box.replaceChildren(...list.map(([k, n, e]) => {
      const b = button('', '', () => { set(k); render(); });
      if (e) { const s = document.createElement('span'); s.className = 'e'; s.textContent = e; b.append(s); }
      b.append(n); b.setAttribute('aria-pressed', String(k === sel)); return b;
    }));
  }
  const pick = (list, sel) => (list.some((x) => x[0] === sel) ? sel : (list[0] || [''])[0]);

  // --- the wheel, drawn again only when its slices change
  function wheelDraw() {
    const sl = status.wheel || [], key = JSON.stringify(sl);
    if (key === wheelKey) return;
    wheelKey = key;
    const svg = el('wheel'), ns = 'http://www.w3.org/2000/svg', n = sl.length || 1, R = 48, g = document.createElementNS(ns, 'g');
    g.id = 'wheelTurn';
    sl.forEach(([lab, col], i) => {
      const a0 = i / n * 2 * Math.PI - Math.PI / 2, a1 = (i + 1) / n * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`);
      p.setAttribute('fill', '#' + col); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '0.8'); g.append(p);
      const t = document.createElementNS(ns, 'text'), tx = 30 * Math.cos(am), ty = 30 * Math.sin(am);
      t.setAttribute('x', tx); t.setAttribute('y', ty); t.setAttribute('font-size', n > 8 ? '4.2' : '5'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('fill', col === 'ffffff' || col === 'ffd23f' ? '#222' : '#fff'); t.setAttribute('font-weight', '700');
      t.setAttribute('transform', `rotate(${am * 180 / Math.PI + (Math.cos(am) < 0 ? 180 : 0)} ${tx} ${ty})`);
      t.textContent = lab.length > 11 ? lab.slice(0, 10) + '…' : lab; g.append(t);
    });
    const ptr = document.createElementNS(ns, 'polygon'); ptr.setAttribute('points', '-5,-56 5,-56 0,-45'); ptr.setAttribute('fill', '#fff');
    svg.replaceChildren(g, ptr);
  }

  // --- paint by numbers: the same six drawings as the ShowPlay page
  function pbDraw() {
    const T = PBT[pbT];
    chooser(el('pbList'), Object.entries(PBT).map(([k, v]) => [k, v.n, v.e]), pbT, (k) => { if (k !== pbT) { pbT = k; pbFill = {}; } });
    const cells = [], seen = {};
    T.g.forEach((row) => [...row].forEach((ch) => {
      const d = document.createElement('div');
      if (ch === '.') d.className = 'bg';
      else {
        d.style.background = pbFill[ch] !== undefined ? '#' + PAL[pbFill[ch]] : '#e8e8e8';
        if (!seen[ch] && pbFill[ch] === undefined) { seen[ch] = 1; d.textContent = T.c[ch]; }
        d.addEventListener('click', () => { pbFill[ch] = pbCol; render(); });
      }
      cells.push(d);
    }));
    el('pbGrid').replaceChildren(...cells);
    el('pbCols').replaceChildren(...PAL.slice(1).map((h, i) => {
      const b = button('', String(i + 1), () => { pbCol = i + 1; render(); }); b.style.background = '#' + h;
      b.setAttribute('aria-label', 'Colour ' + (i + 1)); b.setAttribute('aria-pressed', String(i + 1 === pbCol)); return b;
    }));
    const regs = new Set(T.g.join('').replace(/\./g, '')).size, done = Object.keys(pbFill).length;
    el('pbInfo').textContent = done >= regs ? 'All coloured! Send it to the lights.' : `Coloured ${done} of ${regs} areas (the numbers show the colour to use).`;
  }
  function pbPicture() {   // the drawing at the size the app asks for, with an area for each pixel
    const [w, h] = status.paintSize || [16, 16], T = PBT[pbT], s = Math.min(w, h) / 16, ox = Math.floor((w - 16 * s) / 2), oy = Math.floor((h - 16 * s) / 2);
    const ids = {}, px = [], rg = []; let nid = 0;
    for (const ch of T.g.join('')) if (ch !== '.' && !ids[ch]) ids[ch] = '123456789abcdefghijklmnopqrstuvwxyz'[nid++];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = Math.floor((x - ox) / s), gy = Math.floor((y - oy) / s), ch = gx >= 0 && gx < 16 && gy >= 0 && gy < 16 ? T.g[gy][gx] : '.';
      if (ch === '.') { px.push(0); rg.push('0'); } else { px.push(pbFill[ch] !== undefined ? pbFill[ch] : +T.c[ch]); rg.push(ids[ch]); }
    }
    return { w, h, px: px.join(''), r: rg.join('') };
  }

  // --- treasure hunt: progress kept on the phone
  const huKey = () => 'funHunt' + (status.huntId || '');
  const huDone = () => { try { return JSON.parse(localStorage.getItem(huKey()) || '[]'); } catch (e) { return []; } };
  function huDraw() {
    const cl = status.hunt || [], done = huDone(), left = cl.map((c, k) => k).filter((k) => !done.includes(k));
    el('huReset').classList.toggle('hidden', !done.length);
    if (!left.length) {
      el('huHead').textContent = '🏆 Treasure found!'; el('huClue').textContent = `You solved all ${cl.length} clues. Well done!`;
      for (const id of ['huAns', 'huGo', 'huList']) el(id).classList.add('hidden'); return;
    }
    el('huAns').classList.remove('hidden'); el('huGo').classList.remove('hidden');
    let i = left[0];
    if (status.huntOrder === false) {
      if (!left.includes(huPick)) huPick = left[0];
      i = huPick;
      el('huList').classList.remove('hidden');
      chooser(el('huList'), cl.map((c, k) => [k, done.includes(k) ? '✅ ' + (k + 1) : 'Clue ' + (k + 1)]), i, (k) => { if (!done.includes(k)) huPick = k; });
    } else el('huList').classList.add('hidden');
    if (huAt !== i) { huAt = i; el('huAns').value = ''; }
    el('huHead').textContent = `🔦 Clue ${i + 1} of ${cl.length}`; el('huClue').textContent = cl[i][0];
    el('huAns').type = cl[i][1] === 'number' ? 'number' : 'text'; el('huAns').inputMode = cl[i][1] === 'number' ? 'numeric' : 'text';
    el('huGo').disabled = closed();
  }

  // --- guess the song
  function soDraw() {
    const q = status.song || { st: 'idle', pl: [] }, mine = app ? q.pl.findIndex((p) => p.id === app.clientId) : -1, left = secsLeft(q.until);
    if (soFor !== q.id + ':' + q.n) { soFor = q.id + ':' + q.n; soPick = -1; }
    el('soOpts').replaceChildren(); el('soBtns').replaceChildren(); el('soScores').replaceChildren();
    const go = (text, d) => el('soBtns').append(button('btn', text, () => send({ type: 'song', name: myName(), ...d })));
    if (q.st === 'idle' || (q.st === 'over' && mine < 0)) {
      el('soHead').textContent = '🎶 Guess the song'; el('soInfo').textContent = 'Listen to a few seconds of a song at the show and pick its title. Up to 8 players!';
      go('Start a round', { a: 'new' });
    } else if (q.st === 'lobby') {
      el('soHead').textContent = `🎶 Players: ${q.pl.length} / 8`;
      el('soInfo').textContent = mine >= 0 ? `You are in! The round starts in ${left} s.` : `A round starts in ${left} s. Join now!`;
      if (mine < 0) go('Join the round', { a: 'join', id: q.id });
    } else if (q.st === 'question' || q.st === 'reveal') {
      el('soHead').textContent = `🎶 Song ${q.n} of ${q.of}` + (q.st === 'question' ? ` · ${left} s` : '');
      q.opts.forEach((t, i) => {
        const b = button('', t, () => { if (mine < 0 || soPick >= 0 || q.st !== 'question') return; soPick = i; send({ type: 'song', a: 'ans', id: q.id, n: q.n, c: i }); render(); });
        if (q.st === 'reveal') b.className = i === q.right ? 'right' : i === soPick ? 'wrong' : '';
        if (i === soPick) b.classList.add('mine');
        el('soOpts').append(b);
      });
      el('soInfo').textContent = mine < 0 ? 'A round is on. You can play in the next one!' : q.st === 'reveal' ? (soPick === q.right ? '🎉 Right!' : 'It was: ' + q.opts[q.right])
        : soPick >= 0 ? `Answer sent. ${q.ans} of ${q.pl.length} answered…` : 'Listen and pick the title!';
    } else if (q.st === 'over') {
      el('soHead').textContent = '🏆 Round over';
      const order = [...q.pl].sort((a, b) => b.score - a.score), pos = order.findIndex((p) => p.id === app.clientId);
      el('soInfo').textContent = (['🥇 You won', '🥈 Second place', '🥉 Third place'][pos] || 'Place ' + (pos + 1)) + ` with ${order[pos].score} points!`;
      go('Play again', { a: 'new' });
    }
    if (q.st !== 'idle') el('soScores').replaceChildren(...[...q.pl].sort((a, b) => b.score - a.score).map((p) => {
      const d = document.createElement('div'); if (app && p.id === app.clientId) d.className = 'me';
      const a = document.createElement('span'), b = document.createElement('span'); a.textContent = p.name; b.textContent = p.score; d.append(a, b); return d;
    }));
    el('namePanel').classList.toggle('hidden', !(q.st === 'idle' || q.st === 'over' || (q.st === 'lobby' && mine < 0)));
  }

  let snowMode = 0, snowCol = '', snowStrobe = false;
  function snowDraw() {
    const sn = status.snow, next = sn ? Math.max(0, sn.next - Math.floor((Date.now() - statusAt) / 1000)) : 0;
    const modes = (sn && sn.modes) || [], cols = ((sn && sn.colours) || []).concat(sn && sn.rainbow ? [['rainbow', 'Rainbow', '🌈']] : []);
    if (snowMode >= modes.length) snowMode = 0;
    if (snowCol && !cols.some((c) => c[0] === snowCol)) snowCol = '';
    el('snowModes').classList.toggle('hidden', !modes.length);
    if (modes.length) chooser(el('snowModes'), modes.map((n, i) => [i, n]), snowMode, (k) => { snowMode = k; });
    el('snowCols').classList.toggle('hidden', !cols.length);
    if (cols.length) chooser(el('snowCols'), cols, snowCol, (k) => { snowCol = snowCol === k ? '' : k; });
    if (!(sn && sn.strobe)) snowStrobe = false;
    el('snowStrobe').classList.toggle('hidden', !(sn && sn.strobe));
    el('snowStrobe').setAttribute('aria-pressed', String(snowStrobe)); el('snowStrobe').textContent = snowStrobe ? '⚡ Strobe: on' : '⚡ Strobe: off';
    el('snowLight').classList.toggle('hidden', !(sn && sn.lightOnly));
    el('snowLight').disabled = closed() || !sn || sn.busy;
    el('snowGo').disabled = closed() || !sn || sn.busy || !sn.hours || sn.left <= 0 || next > 0;
    el('snowInfo').textContent = !sn ? '' : sn.busy ? '❄️ The machine is on right now!' : !sn.hours ? `Snow is open from ${sn.from}:00 to ${sn.to}:00.`
      : sn.left <= 0 ? 'No more snow tonight. Come back tomorrow!' : next > 0 ? `The snow machine is resting. Try again in ${next} s.`
      : modes.length ? 'Pick what the machine does, then tap the snowflake!' : 'Tap the snowflake to make it snow!';
  }


  onStatus = (old, s) => {
    statusAt = Date.now();
    const r = app && s.results && s.results[app.clientId];
    if (!r || r.at <= seenRes) return;
    seenRes = r.at;
    if (r.k === 'hunt') {
      if (r.ok) { const d = huDone(); if (!d.includes(r.i)) d.push(r.i); try { localStorage.setItem(huKey(), JSON.stringify(d)); } catch (e) {} huAt = -1;
        el('note').textContent = ''; say(r.last ? '🏆 You found the treasure! Watch the lights!' : '✅ Right! Watch the lights, then the next clue.'); }
      else { el('note').textContent = '❌ Not quite. Try again!'; lastNoteAt = Date.now(); }
    } else if (r.k === 'snow') say(r.light ? '💡 Watch the machine light up!' : '❄️ Let it snow! Watch the show!');
  };

  draw = () => {
    el('namePanel').classList.add('hidden');
    const on = (status.on || []).filter((k) => FUNS[k]);
    if (!on.includes(cur)) cur = on[0] || '';
    el('pick').replaceChildren(...on.map((k) => {
      const b = button('', '', () => { cur = k; try { localStorage.setItem('funCur', k); } catch (e) {} render(); });
      const e = document.createElement('span'); e.className = 'e'; e.textContent = FUNS[k][0]; b.append(e, FUNS[k][1]); b.setAttribute('aria-pressed', String(k === cur)); return b;
    }));
    el('pick').classList.toggle('hidden', on.length < 2);
    for (const [k, id] of Object.entries(PANE)) el(id).classList.toggle('hidden', k !== cur);
    for (const id of ['photoGo', 'wheelGo', 'animalGo', 'paintGo', 'bellGo']) el(id).disabled = closed();
    if (cur === 'photo') { const fr = status.frames || []; frame = pick(fr, frame); chooser(el('frames'), fr.map(([k, n]) => [k, n, FRAME_E[k]]), frame, (k) => { frame = k; }); }
    if (cur === 'wheel') wheelDraw();
    if (cur === 'animal') { const al = status.animals || []; animal = pick(al, animal); chooser(el('animals'), al, animal, (k) => { animal = k; }); }
    if (cur === 'paint') pbDraw();
    if (cur === 'snow') snowDraw();
    if (cur === 'hunt') huDraw();
    if (cur === 'song') soDraw();
    let t = status.phase === 'unconfigured' ? 'The lights are not set up yet.' : !on.length ? 'Nothing is open right now. Come back soon!' : status.message || '';
    const mine = (status.queue || []).findIndex((q) => app && q.id === app.clientId);
    if (status.now && app && status.now.id === app.clientId) t = '✨ Yours is on the lights now!';
    else if (mine >= 0) t = mine === 0 ? 'Yours is next!' : `Yours is number ${mine + 1} in line.`;
    if (cur === 'hunt' || cur === 'song' || cur === 'bell') { if (!(status.now && app && status.now.id === app.clientId) && mine < 0) t = ''; }
    say(t);
  };
  tickGame = () => { if (cur === 'song' || cur === 'snow') { if (cur === 'song') soDraw(); else snowDraw(); } return ''; };

  const sent = (text) => { say(text); };
  el('photoGo').addEventListener('click', () => { send({ type: 'photo', frame }); sent('Sent! Get ready for 3-2-1…'); });
  el('wheelGo').addEventListener('click', () => {
    send({ type: 'wheel' }); sent('Sent! Watch the wheel spin on the lights…');
    const g = el('wheelTurn'); if (g) { g.style.transition = 'transform 2.5s cubic-bezier(.2,.8,.2,1)'; g.style.transform = `rotate(${(Number(g.dataset.r || 0) + 1080 + Math.random() * 360).toFixed(0)}deg)`; g.dataset.r = parseFloat(g.style.transform.slice(7)); }
  });
  el('animalGo').addEventListener('click', () => { send({ type: 'animal', animal }); sent('Sent! Watch it walk…'); });
  el('paintGo').addEventListener('click', () => {
    if (!Object.keys(pbFill).length) { el('note').textContent = 'Colour some areas first.'; lastNoteAt = Date.now(); return; }
    send({ type: 'paint', ...pbPicture() }); sent('Sent! Watch each area fill in…');
  });
  el('bellGo').addEventListener('click', () => { const b = el('bellGo'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); send({ type: 'bell' }); });
  el('snowGo').addEventListener('click', () => { send({ type: 'snow', mode: snowMode, colour: snowCol, strobe: snowStrobe }); sent('Asking for snow…'); });
  el('snowLight').addEventListener('click', () => { send({ type: 'snow', light: true, colour: snowCol, strobe: snowStrobe }); sent('Asking for the lights…'); });
  el('snowStrobe').addEventListener('click', () => { snowStrobe = !snowStrobe; snowDraw(); });
  el('huGo').addEventListener('click', () => {
    const a = el('huAns').value.trim();
    if (!a) { el('note').textContent = 'Write your answer first.'; lastNoteAt = Date.now(); return; }
    send({ type: 'hunt', i: huAt, a }); say('Checking…');
  });
  el('huReset').addEventListener('click', () => { try { localStorage.removeItem(huKey()); } catch (e) {} huAt = -1; render(); });
