/* Light Cube: animated GIF maker for the visitors' page (pictures, drawings and texts brought to life on the phone).
 * window.CubeGM = { encode(frames, W, H, delayMs), frames(options), loadSprite(url), FX, BG, TEXTGIF } */
(() => {
	// a tiny 3x5 font for texts on the made GIFs
	// a tiny 3x5 font, only used to draw the preview of the message in the page
	const F35 = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
		G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101',
		N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
		U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
		0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110',
		6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', ' ': '000000000000000', '!': '010010010000010',
		'?': '110001010000010', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', '-': '000000111000000', "'": '010010000000000',
		'+': '000010111010000', '/': '001001010100100', '#': '101111101111101', '♥': '000101111111010', '*': '101010101000000' };
	function gifEncode(frames, W, H, delayMs) {
		const key = c => (c[0] << 16) | (c[1] << 8) | c[2];
		let mask = 0xFFFFFF, cols;
		for (const m of [0xFFFFFF, 0xFCFCFC, 0xF8F8F8, 0xF0F0F0, 0xE0E0E0, 0xC0C0C0]) {
			mask = m; cols = new Map();
			for (const f of frames) for (const c of f) { const k = key(c) & m; if (!cols.has(k)) cols.set(k, cols.size); if (cols.size > 256) break; }
			if (cols.size <= 256) break;
		}
		let bits = 1; while ((1 << bits) < Math.max(2, cols.size)) bits++;
		const out = [];
		const b = v => out.push(v & 255), w16 = v => { b(v); b(v >> 8); }, str = s => [...s].forEach(ch => b(ch.charCodeAt(0)));
		str('GIF89a'); w16(W); w16(H); b(0x80 | ((bits - 1) << 4) | (bits - 1)); b(0); b(0);
		const pal = new Array(1 << bits).fill(0); cols.forEach((i, k) => { pal[i] = k; });
		pal.forEach(k => { b(k >> 16); b(k >> 8); b(k); });
		b(0x21); b(0xFF); b(11); str('NETSCAPE2.0'); b(3); b(1); w16(0); b(0);   // loop forever
		const cs = Math.max(2, Math.round(delayMs / 10)), minCode = Math.max(2, bits);
		for (const f of frames) {
			b(0x21); b(0xF9); b(4); b(0); w16(cs); b(0); b(0);
			b(0x2C); w16(0); w16(0); w16(W); w16(H); b(0);
			const idx = f.map(c => cols.get(key(c) & mask));
			b(minCode);
			const data = [], clear = 1 << minCode, eoi = clear + 1;
			let size = minCode + 1, next = eoi + 1, table = new Map(), cur = 0, sh = 0;
			const emit = c => { cur |= c << sh; sh += size; while (sh >= 8) { data.push(cur & 255); cur >>>= 8; sh -= 8; } };
			emit(clear);
			let code = idx[0];
			for (let i = 1; i < idx.length; i++) {
				const k = idx[i], tk = (code << 8) | k, got = table.get(tk);
				if (got !== undefined) { code = got; continue; }
				emit(code);
				if (next === 4096) { emit(clear); table = new Map(); size = minCode + 1; next = eoi + 1; }
				else { if (next >= (1 << size)) size++; table.set(tk, next++); }
				code = k;
			}
			emit(code); emit(eoi);
			if (sh > 0) data.push(cur & 255);
			for (let i = 0; i < data.length; i += 255) { const part = data.slice(i, i + 255); b(part.length); part.forEach(b); }
			b(0);
		}
		b(0x3B);
		return new Uint8Array(out);
	}
	// v94: the movement of the picture / text and the background effect are two separate choices
	const GM_FX = [['still', 'Still'], ['blink', 'Blink'], ['pulse', 'Pulse'], ['rainbow', 'Rainbow colours'], ['bounce', 'Bounce'], ['shake', 'Shake'],
		['slide', 'Slide to the left'], ['slider', 'Slide to the right'], ['slideup', 'Slide upwards'], ['slidedown', 'Slide downwards'], ['grow', 'Grow'], ['shine', 'Shine']];
	const GM_BG = [['', 'Nothing'], ['snow', 'Falling snow'], ['stars', 'Twinkling stars'], ['confetti', 'Confetti'], ['fireworks', 'Fireworks'],
		['hearts', 'Rising hearts'], ['fire', 'Flames'], ['bats', 'Flying bats'], ['sparkle', 'Sparkles']];
	const BAT = ['10001', '11011', '01110'];
	const rgb2hsv = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
		let hh = 0; if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [((hh / 6) + 1) % 1, mx ? d / mx : 0, mx]; };
	const hsv2rgb = (hh, s, v) => { const i = Math.floor(hh * 6), f = hh * 6 - i, p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s);
		const [r, g, b] = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][((i % 6) + 6) % 6]; return [r * 255 | 0, g * 255 | 0, b * 255 | 0]; };
	const rnd = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
	// pack GIFs that are a scrolling text: one frame of them is half a word, so they are not used as pictures to animate
	const GM_TEXTGIF = new Set(['hw-boo.gif', 'xm-hohoho.gif']);
	const HEART = ['01010', '11111', '11111', '01110', '00100'];
	// the picture of a GIF from the pack: the frame with the most lit LEDs (ImageDecoder where the browser has it, else the first frame)
	async function gmLoadSprite(url) {
		const N = 16, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
		const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
		const read = () => { const d = g.getImageData(0, 0, N, N).data, px = []; let lit = 0;
			for (let i = 0; i < N * N; i++) { const c = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]; const on = d[i * 4 + 3] > 127 && c[0] + c[1] + c[2] > 24; px.push(on ? c : null); if (on) lit++; }
			return { px, lit }; };
		const blob = await (await fetch(url)).blob();
		if (window.ImageDecoder) {
			try {
				const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
				await dec.tracks.ready;
				const n = Math.min(dec.tracks.selectedTrack.frameCount || 1, 60);
				let best = null;
				const frames = [], delays = [];
				for (let i = 0; i < n; i++) {
					const { image } = await dec.decode({ frameIndex: i });
					g.clearRect(0, 0, N, N); g.drawImage(image, 0, 0, N, N);
					delays.push(Math.max(20, Math.round((image.duration || 100000) / 1000)));   // µs -> ms
					image.close();
					const r = read(); frames.push(r.px); if (!best || r.lit > best.lit) best = r;
				}
				// v96: the picture keeps its own animation in the GIFs made from it (px = its fullest frame, px.anim = all of them)
				if (best) { const px = best.px.slice(); if (frames.length > 1) px.anim = { frames, delays, total: delays.reduce((a, b) => a + b, 0) }; return px; }
			} catch (e) {}
		}
		const im = new Image(); im.src = URL.createObjectURL(blob);
		await im.decode(); g.clearRect(0, 0, N, N); g.drawImage(im, 0, 0, N, N); URL.revokeObjectURL(im.src);
		return read().px;
	}
	// the frames of a made GIF:
	// o = { W, H, sprites: [{ w, h, px: [[r,g,b] | null] }] (up to 3, side by side), fx, text, text2 (a 2nd line at the bottom, colour c2), dir1 / dir2 ('left' | 'right': where each line goes), tpos: 'bottom' | 'top' | 'left' | 'right' | 'middle',
	//       c1: [r,g,b], bg: [r,g,b] }   (o.sprite, one picture, still works)
	function gmFrames(o) {
		o = Object.assign({}, o);
		const W = o.W, H = o.H, BG = o.bg, C1 = o.c1, delay = o.delay || 90;
		// the old single list had the backgrounds among the movements: they still work
		let fx = o.fx, bgfx = o.bgfx || '';
		if (['snow', 'sparkle', 'hearts'].includes(fx)) { bgfx = bgfx || fx; fx = 'still'; }
		const sprites = (o.sprites || (o.sprite ? [o.sprite] : [])).filter(Boolean).slice(0, 3);
		const toGl = t => Array.from((t || '').trim().toUpperCase()).map(ch => F35[ch.normalize('NFD').charAt(0)] || F35['?']);
		let glyphs = toGl(o.text), glyphs2 = toGl(o.text2), tp0 = o.tpos || 'bottom';
		// two texts: the first one on top, the second one at the bottom (only the second one: it goes at the bottom)
		if (!glyphs.length && glyphs2.length) { glyphs = glyphs2; glyphs2 = []; tp0 = 'bottom'; }
		const two = glyphs.length > 0 && glyphs2.length > 0;
		if (two) tp0 = 'top';
		const has = sprites.length > 0, tpos = glyphs.length ? tp0 : 'none';
		const vert = tpos === 'left' || tpos === 'right';
		// v102: the slides go in 4 directions; for a text on its own the slide is the direction of the lines
		const SLIDE = { slide: 'left', slider: 'right', slideup: 'up', slidedown: 'down' }, isSlide = fx in SLIDE;
		if (isSlide && fx !== 'slide' && (!has || tpos === 'middle')) { if (!o.dir1) o.dir1 = vert && SLIDE[fx] !== 'up' && SLIDE[fx] !== 'down' ? 'up' : SLIDE[fx]; if (!o.dir2) o.dir2 = SLIDE[fx]; }
		// text: bigger letters when there is no picture (or it goes over the picture); vertical text = letters one under the other
		// v102: o.tsize = 1 | 2 | 3 (letter size) or 'auto' (the biggest that fits, by the way the line moves:
		// across = as tall as fits, still / up / down = as wide as fits); none = as before
		const len1 = glyphs.length, len2 = glyphs2.length;
		const autoS = (len, d, hAvail) => {
			const byH = Math.max(1, Math.floor((hAvail + 1) / 6));
			if (vert) return d === 'up' || d === 'down' ? Math.max(1, Math.floor(W / 6)) : Math.max(1, Math.min(Math.floor(W / 4), Math.floor((H + 1) / (len * 6))));
			return d === 'left' || d === 'right' ? byH : Math.max(1, Math.min(byH, Math.floor((W + 1) / (len * 4))));
		};
		const fixS = v => Math.max(1, Math.min(4, +v || 1));
		const hEach = two ? Math.floor((H - (has ? 0 : 1)) / 2) : H;
		const tScale = o.tsize === 'auto' && len1 ? (has && tpos !== 'middle' ? 1 : autoS(len1, o.dir1, hEach)) : o.tsize ? fixS(o.tsize)
			: !two && (!has || tpos === 'middle') && H >= 12 && !vert ? Math.max(1, Math.floor(Math.min(H / 8, W / 12))) : 1;
		const s2 = !two ? 1 : o.tsize === 'auto' ? (has ? 1 : autoS(len2, o.dir2, hEach)) : o.tsize ? fixS(o.tsize) : 1;
		// v103: a line that stays still and is a bit too long gets its letters closer together (no space between them)
		const step1 = !vert && o.dir1 === 'stay' && len1 * 4 * tScale - tScale > W ? 3 : 4;
		const tw = vert ? 3 * tScale : len1 ? len1 * step1 * tScale - (step1 === 4 ? tScale : 0) : 0;
		const th = vert ? (glyphs.length ? glyphs.length * 6 * tScale - tScale : 0) : 5 * tScale;
		const scroll = vert ? th > H : tw > W;
		const gap = H >= 20 || W >= 20 ? 1 : 0;
		let tx = 0, ty = 0, area = { x: 0, y: 0, w: W, h: H };
		if (tpos === 'bottom') { ty = H - th - gap; if (has) area.h = Math.max(4, ty - 1); }
		else if (tpos === 'top') { ty = gap; if (has) { area.y = ty + th + 1; area.h = Math.max(4, H - area.y); } }
		else if (tpos === 'left') { tx = gap; if (has) { area.x = tx + tw + 1; area.w = Math.max(4, W - area.x); } }
		else if (tpos === 'right') { tx = W - tw - gap; if (has) area.w = Math.max(4, tx - 1); }
		if (!has && !vert && tpos !== 'none') ty = tpos === 'top' ? gap : tpos === 'bottom' ? H - th - gap : Math.floor((H - th) / 2);
		if (tpos === 'middle') ty = Math.floor((H - th) / 2);
		if (vert && !has) tx = tpos === 'left' ? gap : W - tw - gap;
		if (vert && !scroll) ty = Math.floor((H - th) / 2);
		if (!vert && !scroll) tx = Math.floor((W - tw) / 2);
		// the second line, at the bottom
		const step2 = o.dir2 === 'stay' && len2 * 4 * s2 - s2 > W ? 3 : 4;
		const tw2 = len2 ? len2 * step2 * s2 - (step2 === 4 ? s2 : 0) : 0, th2 = 5 * s2, scroll2 = tw2 > W, ty2 = H - th2 - gap, tx2 = Math.floor((W - tw2) / 2);
		// 'stay' is always still (v103): a line that does not fit even with the letters together is cut at the sides
		// no picture: the two lines together in the middle when there is room (else one at the top, one at the bottom)
		const pair = two && !has && H >= th + th2 + 4;
		if (pair) ty = Math.floor((H - th - th2 - 2) / 2);
		const ty2b = pair ? ty + th + 2 : ty2;
		if (two && has) area.h = Math.max(4, ty2 - 1 - area.y);
		// each picture in its own cell (side by side, or one under the other in a tall area), fitted with whole pixels when it grows
		const n = sprites.length, across = area.w >= area.h;
		// o.fit (v95, like "Picture size" on the board): 'fit' = in proportion, 'stretch' = stretched to its place, 'fill' = filling it (edges cut)
		const fit = o.fit || 'fit';
		// stretching or filling: the empty border around the picture is cut first, so the picture itself fills its place
		const trim = sp => {
			let x0 = sp.w, y0 = sp.h, x1 = -1, y1 = -1;
			const all = sp.px.anim ? sp.px.anim.frames : [sp.px];
			all.forEach(fr => fr.forEach((c, i) => { if (c) { const x = i % sp.w, y = Math.floor(i / sp.w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }));
			if (x1 < 0) return sp;
			const w = x1 - x0 + 1, hh = y1 - y0 + 1;
			const cut = fr => { const px = []; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) px.push(fr[(y0 + y) * sp.w + x0 + x]); return px; };
			const px = cut(sp.px);
			if (sp.px.anim) px.anim = Object.assign({}, sp.px.anim, { frames: sp.px.anim.frames.map(cut) });
			return { w, h: hh, px };
		};
		// the frame of an animated picture at a given time (ms), from its own frame times
		const frameAt = (px, ms) => {
			const a = px.anim; if (!a) return px;
			let t = ms % a.total;
			for (let k = 0; k < a.frames.length; k++) { if (t < a.delays[k]) return a.frames[k]; t -= a.delays[k]; }
			return a.frames[a.frames.length - 1];
		};
		const boxes = sprites.map((sp0, j) => {
			const sp = (o.fit || 'fit') === 'fit' ? sp0 : trim(sp0);
			const cw = across ? area.w / n : area.w, ch = across ? area.h : area.h / n;
			const cx = area.x + (across ? j * cw : 0), cy = area.y + (across ? 0 : j * ch);
			const clip = { x0: Math.round(cx), y0: Math.round(cy), x1: Math.round(cx + cw), y1: Math.round(cy + ch) };
			let dw, dh;
			if (fit === 'stretch') { dw = clip.x1 - clip.x0; dh = clip.y1 - clip.y0; }
			else {
				let sc = fit === 'fill' ? Math.max(cw / sp.w, ch / sp.h) : Math.min(cw / sp.w, ch / sp.h);
				if (sc >= 1 && fit !== 'fill') sc = Math.floor(sc);
				dw = Math.max(1, Math.round(sp.w * sc)); dh = Math.max(1, Math.round(sp.h * sc));
			}
			return { sp, dw, dh, clip: fit === 'fill' ? clip : null, x: Math.floor(cx + (cw - dw) / 2), y: Math.floor(cy + (ch - dh) / 2) };
		});
		const groupW = n ? Math.max(...boxes.map(b => b.x + b.dw)) - Math.min(...boxes.map(b => b.x)) : 0;
		const groupX = n ? Math.min(...boxes.map(b => b.x)) : 0;
		const groupY = n ? Math.min(...boxes.map(b => b.y)) : 0, groupH = n ? Math.max(...boxes.map(b => b.y + b.dh)) - groupY : 0;
		let N = { still: 1, blink: 8, pulse: 24, rainbow: 24, bounce: 16, shake: 12, slide: n ? W + groupW : vert ? H + th : W + Math.max(tw, tw2), grow: 20, shine: 24 }[fx] || 16;
		if (fx === 'slider') N = n ? W + groupW : W + Math.max(tw, tw2);
		if (fx === 'slideup' || fx === 'slidedown') N = n ? H + groupH : H + Math.max(th, th2 || 0);
		const bgN = { snow: H * 2, stars: 24, confetti: H * 2, fireworks: 32, hearts: H + 6, fire: 16, bats: W + 6, sparkle: 16 }[bgfx] || 0;
		if (bgN) N = N <= 1 ? bgN : Math.max(N, bgN);
		// animated pictures: at least one full run of their own animation (at most 64 frames)
		const animMs = Math.max(0, ...boxes.map(b => b.sp.px.anim ? b.sp.px.anim.total : 0));
		const N0 = animMs ? Math.max(2, Math.round(animMs / delay)) : 0;
		if (animMs) N = Math.min(64, Math.max(N, N0));
		const msAt = i => N === N0 ? i * animMs / N0 : i * delay;   // when the GIF is exactly one run of the animation, it loops without a jump
		if (scroll && !o.dir1) N = Math.max(N, (vert ? th + H : tw + W) + 2);
		if (scroll2 && !o.dir2) N = Math.max(N, tw2 + W + 2);
		// v101: a direction chosen for a line makes it travel on its own (once per loop): 'left' / 'right' across,
		// 'up' / 'down' from one edge to the other; 'stay' = still. With no direction given it works as before.
		const trav = (d, w, hh) => !d || d === 'stay' ? 0 : d === 'up' || d === 'down' ? H + hh + 1 : vert ? 0 : W + w + 1;
		N = Math.max(N, trav(o.dir1, tw, th), two ? trav(o.dir2, tw2, th2) : 0);
		const R = rnd(7), flakes = Array.from({ length: Math.max(6, Math.round(W * H / 28)) }, () => [Math.floor(R() * W), R() * H, R() < .5 ? 1 : 2]);
		const hearts = Array.from({ length: Math.max(3, Math.round(W / 6)) }, () => [Math.floor(R() * Math.max(1, W - 5)), R() * (H + 6)]);
		const MULTI = [[255, 42, 42], [255, 210, 63], [57, 211, 83], [43, 183, 255], [155, 92, 255], [255, 79, 216], [255, 122, 26]];
		const stars = Array.from({ length: Math.max(5, Math.round(W * H / 24)) }, () => [Math.floor(R() * W), Math.floor(R() * H), R()]);
		const confetti = Array.from({ length: Math.max(6, Math.round(W * H / 22)) }, () => [R() * W, R() * H, R() < .5 ? 1 : 2, MULTI[Math.floor(R() * MULTI.length)]]);
		const nB = Math.max(3, Math.round(W * H / 90)), bursts = Array.from({ length: nB }, (_, k) => [Math.floor(W * (0.2 + 0.6 * R())), Math.floor(H * (0.2 + 0.5 * R())), k / nB + R() * 0.1, MULTI[Math.floor(R() * MULTI.length)]]);
		const bats = Array.from({ length: Math.max(2, Math.round(W / 8)) }, () => [R() * (W + 6), Math.floor(R() * Math.max(1, H - 4)), R() < .5 ? 1 : 2]);
		const frames = [];
		for (let i = 0; i < N; i++) {
			const tt = i / N, f = new Array(W * H).fill(null).map(() => BG.slice());
			const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = c; };
			// background effect first, then the pictures and the text on top (every one loops with the GIF)
			if (bgfx === 'snow') for (const [x, y0, sp] of flakes) put(x, Math.floor((y0 + tt * H * sp) % H), [235, 240, 255]);
			if (bgfx === 'hearts') for (const [x0, y0] of hearts) { const y = Math.floor(H - ((y0 + tt * (H + 6)) % (H + 6))); HEART.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '1') put(x0 + rx, y + ry, [255, 79, 216]); })); }
			if (bgfx === 'sparkle') { const Rf = rnd(100 + i); for (let s = 0; s < Math.round(W * H / 22); s++) { const x = Math.floor(Rf() * W), y = Math.floor(Rf() * H), v = Rf(); put(x, y, C1.map(c => c * (0.35 + 0.65 * v) | 0)); } }
			if (bgfx === 'stars') for (const [x, y, ph] of stars) { const v = 0.5 + 0.5 * Math.sin(2 * Math.PI * (tt * 2 + ph)); if (v > 0.15) put(x, y, [255, 240, 190].map(c => c * v | 0)); }
			if (bgfx === 'confetti') for (const [x0, y0, sp, c] of confetti) { const y = (y0 + tt * H * sp) % H; put(Math.floor((x0 + y * 0.5) % W), Math.floor(y), c); }
			if (bgfx === 'fireworks') for (const [cx, cy, ph, c] of bursts) { const p = (tt + ph) % 1; if (p > 0.75) continue; const q = p / 0.75, r = 1 + q * Math.min(W, H) * 0.32, a = 1 - q * q;
				for (let k = 0; k < 12; k++) { const an = k / 12 * 6.283; put(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), c.map(v => v * a | 0)); } put(cx, cy, p < 0.1 ? [255, 255, 255] : BG); }
			if (bgfx === 'fire') for (let x = 0; x < W; x++) { const hgt = Math.round(H * (0.18 + 0.14 * Math.sin(2 * Math.PI * (tt * 2 + x * 0.37)) + 0.08 * Math.sin(2 * Math.PI * (tt * 3 + x * 0.91 + 0.3))));
				for (let k = 0; k < hgt; k++) { const v = 1 - k / Math.max(1, hgt); put(x, H - 1 - k, [255, 60 + 170 * v | 0, 20 * v | 0]); } }
			if (bgfx === 'bats') for (const [x0, y0, sp] of bats) { const x = Math.floor(((x0 + tt * (W + 6) * sp) % (W + 6)) - 5), y = Math.round(y0 + Math.sin(2 * Math.PI * (tt * 3 + x0)) * 1.2), flap = (i >> 1) % 2;
				BAT.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '1' && !(flap && ry === 0)) put(x + rx, y + ry, [155, 92, 255]); })); }
			const off = fx === 'blink' && i >= N / 2;
			const motion = (ph, seed) => {   // ph: 0..1 phase of this picture (pictures side by side take turns)
				let dx = 0, dy = 0, sc = 1, mul = 1;
				if (fx === 'bounce') dy = -Math.round(Math.abs(Math.sin(Math.PI * ph)) * Math.max(1, Math.round(H / 8)));
				if (fx === 'shake') { const Rs = rnd(30 + i + seed * 97); dx = Math.round(Rs() * 2 - 1); dy = Math.round(Rs() * 2 - 1); }
				if (fx === 'grow') sc = Math.min(1, 0.15 + 0.85 * Math.min(1, tt / 0.7));
				if (fx === 'pulse') mul = 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(2 * Math.PI * ph));
				return { dx, dy, sc, mul };
			};
			if (!off) boxes.forEach((b, j) => {
				// v97: pictures move together; o.turns = they take turns (bounce, pulse, shake)
				const ph = (tt + (o.turns && n > 1 && (fx === 'bounce' || fx === 'pulse') ? j / n : 0)) % 1;
				let { dx, dy, sc, mul } = motion(ph, o.turns ? j : 0);
				if (fx === 'slide') dx = W - groupX - Math.round(tt * (W + groupW));
				if (fx === 'slider') dx = Math.round(tt * (W + groupW)) - groupX - groupW;
				if (fx === 'slideup') dy = H - groupY - Math.round(tt * (H + groupH));
				if (fx === 'slidedown') dy = Math.round(tt * (H + groupH)) - groupY - groupH;
				const band = (tt * (W + H + 8)) - 4, sp = b.sp, cur = frameAt(sp.px, msAt(i));
				for (let y = 0; y < b.dh; y++) for (let x = 0; x < b.dw; x++) {
					let sxp = x, syp = y;
					if (sc < 1) { sxp = Math.floor((x - b.dw / 2) / sc + b.dw / 2); syp = Math.floor((y - b.dh / 2) / sc + b.dh / 2); if (sxp < 0 || syp < 0 || sxp >= b.dw || syp >= b.dh) continue; }
					let c = cur[Math.floor(syp * sp.h / b.dh) * sp.w + Math.floor(sxp * sp.w / b.dw)];
					if (!c) continue;
					if (fx === 'rainbow') { const [hh, s, v] = rgb2hsv(c); c = hsv2rgb((hh + tt + j / 4) % 1, Math.max(s, 0.6), Math.max(v, 0.6)); }
					if (fx === 'shine') { const d = Math.abs((b.x + x) + (b.y + y) - band); if (d < 2.5) { const a = 0.75 * (1 - d / 2.5); c = c.map(v => v + (255 - v) * a | 0); } }
					if (mul !== 1) c = c.map(v => v * mul | 0);
					const px = b.x + x + dx, py = b.y + y + dy;
					if (b.clip && !isSlide && (px < b.clip.x0 || py < b.clip.y0 || px >= b.clip.x1 || py >= b.clip.y1)) continue;   // edges cut
					put(px, py, c);
				}
			});
			if (glyphs.length && !off) {
				// with no picture (or text over it) the text itself does the animation: bounces, shakes, pulses, slides across,
				// grows (the letters come in one by one) or shines
				const subj = !has || tpos === 'middle';
				const m = subj ? motion(tt, 9) : { dx: 0, dy: 0, mul: 1 };
				const band = (tt * (W + H + 8)) - 4;
				const tc = (gi, x, y, col) => {
					let c = fx === 'rainbow' ? hsv2rgb((tt + gi / 8) % 1, 1, 1) : col || C1;
					if (subj && fx === 'shine') { const d = Math.abs(x + y - band); if (d < 2.5) { const k = 0.8 * (1 - d / 2.5); c = c.map(v => v + (255 - v) * k | 0); } }
					return m.mul !== 1 ? c.map(v => v * m.mul | 0) : c;
				};
				// letters close together: every other letter a little darker, so they can still be told apart
				const dimOdd = (step, gi, c) => step === 3 && gi % 2 ? c.map(v => v * 0.5 | 0) : c;
				const shown = len => subj && fx === 'grow' ? Math.max(1, Math.ceil(Math.min(1, tt / 0.7) * len)) : len;
				// v16: each line goes to the side chosen ('left' = comes in on the right and goes out on the left, as usual)
				const slideX = (len, d) => d === 'right' ? Math.round(tt * (W + len)) - len : W - Math.round(tt * (W + len));   // across, once per loop
				const scrollX = (len, d) => d === 'right' ? Math.round(i * (len + W) / N) - len : W - Math.round(i * (len + W) / N);
				const d1 = o.dir1 || 'left', d2 = o.dir2 || (fx === 'slide' ? 'right' : 'left');
				// v100: 'stay' = this line stands still (centred; a text longer than the matrix is cut)
				const upDown = (d, hh, y) => d === 'up' ? H - Math.round(tt * (H + hh)) : d === 'down' ? Math.round(tt * (H + hh)) - hh : y;
				const ud1 = o.dir1 === 'up' || o.dir1 === 'down', lr1 = !vert && (o.dir1 === 'left' || o.dir1 === 'right');
				const x0 = (ud1 || (d1 === 'stay' && !vert) ? (vert ? tx : Math.floor((W - tw) / 2)) : lr1 ? slideX(tw, d1) : scroll && !vert ? scrollX(tw, d1) : subj && fx === 'slide' && !vert ? slideX(tw, d1) : tx) + m.dx;
				const y0 = (ud1 ? upDown(o.dir1, th, ty) : d1 === 'stay' && vert ? Math.floor((H - th) / 2) : scroll && vert ? H - Math.round(i * (th + H) / N) : subj && fx === 'slide' && vert ? H - Math.round(tt * (H + th)) : ty) + m.dy;
				const n1 = shown(glyphs.length);
				glyphs.slice(0, n1).forEach((gl, gi) => {
					const gx0 = vert ? x0 : x0 + gi * step1 * tScale, gy0 = vert ? y0 + gi * 6 * tScale : y0;
					for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (gl[gy * 3 + gx] === '1')
						for (let a = 0; a < tScale; a++) for (let b2 = 0; b2 < tScale; b2++) { const px = gx0 + gx * tScale + a, py = gy0 + gy * tScale + b2; put(px, py, dimOdd(step1, gi, tc(gi, px, py))); }
				});
				if (two) {
					// the bottom line goes the other way when sliding across
					const ud2 = o.dir2 === 'up' || o.dir2 === 'down';
					const x2 = (d2 === 'stay' || ud2 ? tx2 : o.dir2 === 'left' || o.dir2 === 'right' ? slideX(tw2, d2) : scroll2 ? scrollX(tw2, d2) : subj && fx === 'slide' ? slideX(tw2, d2) : tx2) + m.dx, y2 = (ud2 ? upDown(o.dir2, th2, ty2b) : ty2b) + m.dy;
					glyphs2.slice(0, shown(glyphs2.length)).forEach((gl, gi) => { for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (gl[gy * 3 + gx] === '1')
						for (let a = 0; a < s2; a++) for (let b2 = 0; b2 < s2; b2++) { const px = x2 + gi * step2 * s2 + gx * s2 + a, py = y2 + gy * s2 + b2; put(px, py, dimOdd(step2, gi, tc(gi + 3, px, py, o.c2))); } });
				}
			}
			frames.push(f);
		}
		return frames;
	}
	const api = { encode: gifEncode, frames: gmFrames, loadSprite: gmLoadSprite, FX: GM_FX, BG: GM_BG, TEXTGIF: GM_TEXTGIF };
	if (typeof window !== 'undefined') window.CubeGM = api;
	if (typeof module !== 'undefined') module.exports = api;
})();
