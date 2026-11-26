  const FRAME_E = { snow: '❄️', hearts: '💖', stars: '⭐', santa: '🎅', rainbow: '🌈', confetti: '🎊', gold: '🥇', silver: '🥈', leaves: '🍂', petals: '🌸', spooky: '🎃', pastel: '🍭', babyblue: '💙', babypink: '🩷', night: '🌙', usa: '🇺🇸' };
  let img = null, frame = null, framePicked = false, style = '', pw = 0, ph = 0, px = null;
  el('namePanel').classList.add('hidden');
  el('cam').addEventListener('click', () => el('fileCam').click());
  el('pick').addEventListener('click', () => el('filePick').click());
  for (const id of ['fileCam', 'filePick']) el(id).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { img = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch (err) {
      img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(f); }).catch(() => null);
    }
    if (!img) { el('note').textContent = 'That photo could not be opened.'; return; }
    el('mirror').checked = id === 'fileCam';
    shrink(); render();
  });
  el('zoom').addEventListener('input', () => { shrink(); render(); });
  el('mirror').addEventListener('change', () => { shrink(); render(); });
  // the look, as the lights will show it (the same as the app's)
  function styled(r, g, b) {
    if (style === 'bw') { const v = Math.round(0.3 * r + 0.59 * g + 0.11 * b); return [v, v, v]; }
    if (style === 'warm') { const v = 0.3 * r + 0.59 * g + 0.11 * b; return [Math.min(255, v * 1.15 + 20), Math.min(255, v * 0.95 + 8), Math.max(0, v * 0.7)]; }
    if (style === 'pop') { const q = (v) => (v < 70 ? 0 : v < 170 ? 140 : 255); return [q(r), q(g), q(b)]; }
    const m = (r + g + b) / 3; return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round((m + (v - m) * 1.25) * 1.1))));
  }
  /** the photo cut to the matrix's shape (the middle, zoomed in), shrunk to pw x ph squares */
  function shrink() {
    if (!img || !pw) return;
    const z = +el('zoom').value, iw = img.width, ih = img.height, want = pw / ph;
    let cw = iw, chh = iw / want; if (chh > ih) { chh = ih; cw = ih * want; }
    cw /= z; chh /= z;
    const sx = (iw - cw) / 2, sy = (ih - chh) / 2.4;     // a little above the middle, where faces are
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (el('mirror').checked) { g.translate(pw, 0); g.scale(-1, 1); }
    g.drawImage(img, sx, Math.max(0, sy), cw, chh, 0, 0, pw, ph);
    px = g.getImageData(0, 0, pw, ph).data;
  }
  function drawPreview() {
    const c = el('canvas'), k = Math.max(1, Math.floor(260 / Math.max(pw, ph)));
    c.width = pw * k; c.height = ph * k;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4, [r, gg, b] = styled(px[i], px[i + 1], px[i + 2]);
      g.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')'; g.beginPath(); g.arc(x * k + k / 2, y * k + k / 2, k * 0.42, 0, 7); g.fill();
    }
  }
  function chips(box, list, cur, set) {
    box.replaceChildren(...list.map(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n;
      b.setAttribute('aria-pressed', String(k === cur)); b.addEventListener('click', () => { set(k); render(); }); return b; }));
  }
  draw = () => {
    const s = status;
    if (s.size && (s.size[0] !== pw || s.size[1] !== ph)) { [pw, ph] = s.size; shrink(); }
    const fl = (s.frames || []).map(([k, n]) => [k, (FRAME_E[k] || '🖼️') + ' ' + n]);
    if (s.noFrame !== false) fl.push(['', '⬛ No frame']);
    if (!framePicked || !fl.some(([k]) => k === frame)) frame = fl.length ? fl[0][0] : '';
    chips(el('frames'), fl, frame, (v) => { frame = v; framePicked = true; });
    const sl = s.styles || [['natural', 'Natural colours']];
    if (!sl.some(([k]) => k === style)) style = sl[0][0];
    chips(el('styles'), sl, style, (v) => { style = v; });
    el('pv').classList.toggle('hidden', !px); el('tools').classList.toggle('hidden', !px);
    if (px) drawPreview();
    el('send').disabled = !app || !px || s.phase === 'unconfigured';
    const mine = (s.queue || []).findIndex((q) => app && q.id === app.clientId);
    let t = s.message || '';
    if (s.now && app && s.now.id === app.clientId) t = '📸 Your photo is on the lights now!';
    else if (mine >= 0) t = mine === 0 ? 'Your photo is next!' : 'Your photo is number ' + (mine + 1) + ' in line.';
    else if (!px) t = 'Take a selfie or pick a photo.';
    say(t);
  };
  el('send').addEventListener('click', () => {
    if (!px) return;
    const rgb = new Uint8Array(pw * ph * 3);
    for (let i = 0, j = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
    let bin = ''; for (let i = 0; i < rgb.length; i++) bin += String.fromCharCode(rgb[i]);
    send({ type: 'photo', w: pw, h: ph, px: btoa(bin), frame, style });
    el('send').disabled = true; say('Sending…'); setTimeout(render, 1200);
  });
