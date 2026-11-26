  let who = '', rec = null, clip = null, url = '', busy = false, rate = 11025;
  const button = (cls, text, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.addEventListener('click', f); return b; };
  function wavBlob(a) {   // 16-bit samples -> a WAV to listen to on the phone
    const n = a.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, a[i], true);
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function start() {
    if (!window.isSecureContext) { el('time').textContent = 'Phones only allow the microphone on a secure page: open this page through the show\'s link (https), not the home network address.'; return; }
    if (!navigator.mediaDevices?.getUserMedia) { el('time').textContent = 'This phone\'s browser cannot record. Try Chrome or Safari.'; return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { el('time').textContent = 'The microphone is not allowed. Allow it in the browser to sing!'; return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
    mute.gain.value = 0;
    const ratio = ctx.sampleRate / rate, out = [], max = status.maxSecs || 10; let acc = 0, cnt = 0, pos = 0;
    proc.onaudioprocess = (ev) => {
      const d = ev.inputBuffer.getChannelData(0); let peak = 0;
      for (let i = 0; i < d.length; i++) { acc += d[i]; cnt++; pos++; peak = Math.max(peak, Math.abs(d[i])); if (pos >= ratio) { out.push(acc / cnt); acc = 0; cnt = 0; pos -= ratio; } }
      el('meter').style.width = Math.min(100, peak * 140) + '%';
      const secs = out.length / rate; el('time').textContent = `Recording… ${secs.toFixed(1)} s of ${max}`;
      if (secs >= max) stop();
    };
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    rec = { ctx, stream, proc, out };
    clip = null; if (url) { URL.revokeObjectURL(url); url = ''; }
    el('rec').classList.add('on'); el('rec').innerHTML = '⏹<br>Stop'; render();
  }
  function stop() {
    if (!rec) return;
    const { ctx, stream, proc, out } = rec; rec = null;
    try { proc.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); } catch (e) {}
    el('rec').classList.remove('on'); el('rec').innerHTML = '🎙️<br>Record again'; el('meter').style.width = '0';
    let a = 0, b = out.length; const quiet = (x) => Math.abs(x) < 0.02;   // the silence at both ends goes
    while (a < b && quiet(out[a])) a++;
    while (b > a && quiet(out[b - 1])) b--;
    a = Math.max(0, a - Math.floor(rate * 0.15)); b = Math.min(out.length, b + Math.floor(rate * 0.25));
    const part = out.slice(a, Math.min(b, a + rate * (status.maxSecs || 10)));
    if (part.length < rate * 0.5) { el('time').textContent = 'That was too short or too quiet. Try again, a bit louder!'; render(); return; }
    clip = Int16Array.from(part, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
    url = URL.createObjectURL(wavBlob(clip));
    el('time').textContent = `Recorded ${(clip.length / rate).toFixed(1)} s. Listen to it, or send it!`; render();
  }
  el('rec').addEventListener('click', () => (rec ? stop() : start()));
  async function sendIt() {
    if (!clip || busy || !who) return;
    busy = true; render();
    const bytes = new Uint8Array(clip.buffer, clip.byteOffset, clip.byteLength), PART = 45000, of = Math.ceil(bytes.length / PART), id = Math.random().toString(36).slice(2, 10);
    try {
      for (let n = 0; n < of; n++) {
        let s = ''; const p = bytes.subarray(n * PART, (n + 1) * PART);
        for (let i = 0; i < p.length; i += 8192) s += String.fromCharCode.apply(null, p.subarray(i, i + 8192));
        el('time').textContent = `Sending… ${Math.round(n / of * 100)}%`;
        await app.send({ type: 'sing', a: 'part', id, n, of, s: who, rate, d: btoa(s) });
      }
      el('time').textContent = 'Sent! Listen and watch the lights: your song plays in a moment.';
      clip = null;
    } catch (e) { el('time').textContent = 'Could not send: ' + e.message; send({ type: 'sing', a: 'cancel' }); }
    setTimeout(() => { busy = false; render(); }, 1500);
    render();
  }
  draw = () => {
    const s = status, list = s.singers || [];
    el('namePanel').classList.add('hidden');
    rate = s.rate || 11025; el('maxs').textContent = s.maxSecs || 10;
    if (!list.some((x) => x.k === who)) who = (list[0] || {}).k || '';
    el('who').replaceChildren(...list.map((x) => { const b = button('', `${x.e} ${x.n}`, () => { who = x.k; render(); }); b.setAttribute('aria-pressed', String(x.k === who)); return b; }));
    const bt = [];
    if (clip && !rec) {
      const go = button('btn', '🎤 Send it to the lights!', sendIt); go.disabled = busy || !who || s.phase === 'unconfigured';
      bt.push(go, button('btn ghost', '▶️ Listen', () => { try { new Audio(url).play(); } catch (e) {} }));
    }
    el('btns').replaceChildren(...bt);
    const me = app?.clientId, pos = (s.queue || []).indexOf(me);
    el('sstat').textContent = s.now && s.now.id === me ? `🎶 Your song is playing now! Watch ${s.now.who}!` : pos >= 0 ? `Your song is number ${pos + 1} in line.` : s.now ? `🎶 Now singing: ${s.now.who}` : '';
    el('sstat').parentElement.classList.toggle('hidden', !el('sstat').textContent);
    say(s.phase === 'unconfigured' ? s.message : '');
  };
