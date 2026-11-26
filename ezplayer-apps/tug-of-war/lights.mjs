// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * ShowPlay's drawing on the lights, shared by the apps that show messages and effects: scrolling text (two public-domain
 * misc-fixed fonts), the 18 effects of the three themes, the visitors' palette and the word filter. Nothing here
 * talks to the player. An animation is made for a w x h grid; frame(t) (t in seconds) returns w*h*3 RGB bytes, top
 * row first.
 */

const FONT8 = Buffer.from('0000000000000000002020202000200000505050000000005050f850f85050002070a07028702000004050205010000040a0a040a0a0500000202020000000000020404040402000004020202020400000009060f060900000002020f8202000000000000030204000000000f00000000000000000207020001010204080800000205050505020000020602020207000006090106080f00000f0206010906000002060a0f020200000f080e010906000006080e09090600000f010202040400000609060909060000060909070106000000060600060600000003030003020400010204040201000000000f000f0000000402010102040000020501020002000304898a8a890403000609090f090900000e090e09090e000006090808090600000e090909090e00000f080e08080f00000f080e08080800000609080b0906000009090f09090900000702020202070000070202020a040000090a0c0a0a09000008080808080f0000090f0f0909090000090d0f0b0b09000006090909090600000e09090e080800000609090d0b0601000e09090e0909000006090402090600000702020202020000090909090906000009090909060600000909090f0f090000090906060909000008888502020200000f010204080f000007040404040700000808040201010000070101010107000002050000000000000000000000000f000402000000000000000007090907000008080e09090e0000000003040403000001010709090700000000060b0c0600000205040e04040000000006090701060008080e0909090000020006020207000001000101010502000808090e09090000060202020207000000000d0a8a8a800000000e0909090000000006090906000000000e090e080800000007090701010000000a0d08080000000003060106000004040e0405020000000009090907000000000505050200000000088a8a8500000000090606090000000009090709060000000f02040f000304020c0204030000020202020202000c02040304020c0000050a00000000000', 'hex');     // 5x8, ASCII 32..126
const FONT16 = Buffer.from('000000000000000000000000000000000000000008080808080808000808000000002222222200000000000000000000000000001212127e24247e484848000000000000083e4948380e09493e08000000000000314a4a340808162929460000000000001c2222221c3945424639000000000808080800000000000000000000000000040808101010101010080804000000002010100808080808081010200000000000000008492a1c2a49080000000000000000000808087f080808000000000000000000000000000000180808100000000000000000007e000000000000000000000000000000000000181800000000000002020408081010204040000000000000182442424242424224180000000000000818280808080808083e0000000000003c4242020c102040407e0000000000003c4242021c020242423c000000000000040c142444447e0404040000000000007e4040407c020202423c0000000000001c2040407c424242423c0000000000007e0202040404080808080000000000003c4242423c424242423c0000000000003c4242423e02020204380000000000000000181800000018180000000000000000001818000000180808100000000000000204081020100804020000000000000000007e0000007e0000000000000000004020100804081020400000000000003c4242020408080008080000000000001c224a565252524e201e00000000000018242442427e424242420000000000007c4242427c424242427c0000000000003c42424040404042423c000000000000784442424242424244780000000000007e4040407c404040407e0000000000007e4040407c40404040400000000000003c424240404e4242463a000000000000424242427e42424242420000000000003e08080808080808083e0000000000001f040404040404444438000000000000424448506060504844420000000000004040404040404040407e000000000000424266665a5a4242424200000000000042626252524a4a4646420000000000003c42424242424242423c0000000000007c4242427c40404040400000000000003c4242424242425a663c0300000000007c4242427c48444442420000000000003c424240300c0242423c0000000000007f0808080808080808080000000000004242424242424242423c00000000000041414122222214140808000000000000424242425a5a6666424200000000000042422424181824244242000000000000414122221408080808080000000000007e02020408102040407e00000000000e080808080808080808080e0000000000404020101008080402020000000000701010101010101010101070000000182442000000000000000000000000000000000000000000000000007f00002010080000000000000000000000000000000000003c42023e4242463a00000000004040405c6242424242625c00000000000000003c4240404040423c00000000000202023a4642424242463a00000000000000003c42427e4040423c00000000000c1010107c10101010101000000000000000023a44444438203c42423c0000004040405c624242424242420000000000080800180808080808083e00000000000404000c04040404040404483000000000404044485060504844420000000000001808080808080808083e0000000000000000764949494949494900000000000000005c6242424242424200000000000000003c4242424242423c00000000000000005c6242424242625c40400000000000003a4642424242463a02020000000000005c6242404040404000000000000000003c4240300c02423c00000000000010107c1010101010100c0000000000000000424242424242463a00000000000000004242422424241818000000000000000041494949494949360000000000000000424224181824424200000000000000004242424242261a02023c0000000000007e0204081020407e00000000000c101008081010080810100c00000008080808080808080808080808080000003008081010080810100808300000000031494600000000000000000000', 'hex');   // 8x16, ASCII 32..126

export const PAL = ['000000', 'ffffff', 'ff2a2a', 'ff7a1a', 'ffd23f', '39d353', '2bb7ff', '9b5cff', 'ff4fd8'];
export const FX_LIST = {
    hw: [['haunted', 'Haunted house'], ['eyes', 'Eyes in the dark'], ['fire', 'Fire'], ['lightning', 'Lightning'], ['firenoise', 'Magic flames'], ['blackhole', 'Black hole']],
    xm: [['snowfall', 'Falling snow'], ['candy', 'Candy cane'], ['retro', 'Christmas tree'], ['twinkle', 'Twinkling stars'], ['fireworks', 'Fireworks'], ['bursts', 'Colour bursts']],
    ev: [['rainbow', 'Rainbow'], ['fireworks', 'Fireworks'], ['plasma', 'Plasma'], ['ripple', 'Ripples'], ['matrix', 'Falling code'], ['pacifica', 'Ocean']],
};
export const FX_NAMES = Object.fromEntries(Object.values(FX_LIST).flat());
export const THEMES = { xm: 'Christmas', hw: 'Halloween', ev: 'Other celebrations' };

export const hexRgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
export function hsv(h, s = 1, v = 1) {
    h = ((h % 1) + 1) % 1 * 6;
    const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}
const RAINBOW = [...Array(256)].map((_, i) => hsv(i / 256));
const HEAT = [...Array(256)].map((_, heat) => {
    const t = Math.floor(heat * 191 / 255), ramp = (t & 63) << 2;
    return t >= 128 ? [255, 255, ramp] : t >= 64 ? [255, ramp, 0] : [ramp, 0, 0];
});

// ---- words ----
// Blocked words in Portuguese (Portugal and Brazil) and English. HIDE words are also caught inside another word
// (merdoso, superfuck…); WORD words only on their own (so normal words that contain them still pass). Accents, capitals,
// letters swapped for numbers or symbols (f0d4, $hit), repeated letters (fuuuck) and letters spaced out (m e r d a,
// m.e.r.d.a) are all seen through. setBadExtra() adds the show's own words from the settings.
const HIDE = ['merda', 'merdoso', 'merdosa', 'caralho', 'fodase', 'fodasse', 'foder', 'fodido', 'fodida', 'filhodaputa', 'cabrao', 'cabroes', 'piroca',
    'paneleiro', 'punheta', 'punheteiro', 'boceta', 'buceta', 'arrombado', 'arrombada', 'colhoes', 'cornudo',
    'fuck', 'shit', 'bitch', 'pussy', 'asshole', 'arsehole', 'bastard', 'motherfucker', 'bullshit', 'wanker',
    'whore', 'nigger', 'nigga', 'faggot', 'hitler', 'cunt', 'dildo', 'porno'];
const WORD = ['foda', 'fode', 'fodam', 'fodes', 'fdx', 'fdp', 'pqp', 'vsf', 'krl', 'crl', 'puta', 'putas', 'putaria', 'cona',
    'conas', 'pila', 'pilas', 'pissa', 'corno', 'cu', 'cus', 'porra', 'cacete', 'viado', 'maricas', 'vadia', 'merdas',
    'caralhos', 'cagalhao', 'mongoloide', 'putinha', 'putona', 'fck', 'fuk', 'wtf', 'stfu', 'ass', 'arse', 'dick', 'dicks', 'cock', 'twat',
    'slut', 'piss', 'boobs', 'tits', 'penis', 'porn', 'sex', 'sexy', 'nude', 'nudes', 'fag', 'retard', 'nazi', 'heil'];
let BAD_EXTRA = [];
export const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
// A blocked word matches a written word that only stretches its letters (fuck: fuuuck, ffuck), never one with fewer
// letters (ass does not match "as", boobs does not match "bobs", nigger does not match "nigeria").
const stretch = (w) => w.replace(/([a-z])\1*/g, (run, c) => `${c}{${run.length},}`);
const WORD_ALL = [...new Set([...WORD, ...HIDE])];
const RE_WORD = new RegExp(`^(?:${WORD_ALL.map(stretch).join('|')})$`);
const RE_HIDE = new RegExp(HIDE.map(stretch).join('|'));
let RE_EXTRA_W = null, RE_EXTRA_H = null;
/** the show's own blocked words (a comma or line separated list from the settings) */
export function setBadExtra(list) {
    BAD_EXTRA = String(list || '').split(/[\n,;]+/).map((w) => plain(w).toLowerCase().replace(/[^a-z]/g, '')).filter((w) => w.length >= 2).slice(0, 200);
    RE_EXTRA_W = BAD_EXTRA.length ? new RegExp(`^(?:${BAD_EXTRA.map(stretch).join('|')})$`) : null;
    const long = BAD_EXTRA.filter((b) => b.length >= 5);
    RE_EXTRA_H = long.length ? new RegExp(long.map(stretch).join('|')) : null;
}
const badWord = (w) => RE_WORD.test(w) || RE_HIDE.test(w) || !!(RE_EXTRA_W && RE_EXTRA_W.test(w)) || !!(RE_EXTRA_H && RE_EXTRA_H.test(w));
export function isBad(s) {
    const n = plain(s).toLowerCase().replace(/[0@1!|345$7]/g, (c) => ({ 0: 'o', '@': 'a', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', 5: 's', $: 's', 7: 't' })[c]);
    const toks = n.split(/[^a-z*]+/).map((t) => (/^\*.*\*$/.test(t) ? t.replace(/^\*+|\*+$/g, '') : t)).filter((t) => /[a-z]/.test(t)), words = [], pairs = [];
    for (const t of toks) {
        if (!t.includes('*')) { words.push(t); continue; }
        const re = new RegExp(`^${t.replace(/\*/g, '[a-z]')}$`);       // f*ck, sh**: a star stands for one letter
        if (WORD_ALL.some((b) => re.test(b))) return true;
        words.push(...t.split('*').filter(Boolean));
    }
    const plainToks = toks.map((t) => t.replace(/\*/g, ''));
    for (let i = 0; i < plainToks.length;) {            // letters spaced out (m e r d a): joined back into a word
        let j = i; while (j < plainToks.length && plainToks[j].length === 1) j++;
        if (j - i >= 3) words.push(plainToks.slice(i, j).join(''));
        i = Math.max(j, i + 1);
    }
    for (let i = 0; i + 1 < plainToks.length; i++) {    // a word cut in two short pieces (fu ck, sh it)
        const a = plainToks[i], b = plainToks[i + 1];
        if ((a.length <= 2 || b.length <= 2) && a.length + b.length >= 4) pairs.push(a + b);
    }
    if (pairs.some((w) => RE_WORD.test(w) || !!(RE_EXTRA_W && RE_EXTRA_W.test(w)))) return true;   // only a whole blocked word
    return words.some((w) => badWord(w) || (w.startsWith('ph') && badWord('f' + w.slice(2))));
}

// ---- animations ----
export class Anim {
    constructor(w, h) { this.w = w; this.h = h; this.buf = new Uint8Array(w * h * 3); }
    px(x, y, c) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 3;
        this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
    }
    fill(c) { for (let i = 0; i < this.buf.length; i += 3) { this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; } }
    fade(k) { for (let i = 0; i < this.buf.length; i++) this.buf[i] = this.buf[i] * k; }
    frame() { return this.buf; }
}

/** text scrolling from right to left, repeating; once = true scrolls it through once (done() tells when) */
export class Text extends Anim {
    constructor(w, h, text, color) {
        super(w, h);
        const big = h >= 16;
        this.font = big ? FONT16 : FONT8; this.fw = big ? 8 : 5; this.fh = big ? 16 : 8;
        this.sc = Math.max(1, Math.floor(h / this.fh));
        this.text = plain(text) || '?';
        this.color = color;
        this.top = Math.floor((h - this.fh * this.sc) / 2);
        this.speed = 22 * this.sc;
        this.cols = [];
        for (const ch of this.text) {
            const g = (ch.charCodeAt(0) - 32) * this.fh;
            for (let cx = 0; cx < this.fw; cx++) {
                const rows = [];
                for (let r = 0; r < this.fh; r++) if (this.font[g + r] & (0x80 >> cx)) rows.push(r);
                for (let k = 0; k < this.sc; k++) this.cols.push(rows);
            }
        }
        this.tw = this.cols.length;
    }
    seconds() { return (this.tw + this.w) / this.speed; }
    frame(t) {
        const { w, sc, buf } = this;
        buf.fill(0);
        const off = Math.floor(t * this.speed) % (this.tw + w);
        for (let x = 0; x < w; x++) {
            const ci = x + off - w;
            if (ci < 0 || ci >= this.tw) continue;
            for (const r of this.cols[ci]) for (let k = 0; k < sc; k++) this.px(x, this.top + r * sc + k, this.color);
        }
        return buf;
    }
}

/** one character of the big font, scaled, centred on (cx, cy) */
export function bigGlyph(anim, ch, cx, cy, sc, col) {
    const g = (ch.charCodeAt(0) - 32) * 16, x0 = cx - 4 * sc, y0 = cy - 8 * sc;
    for (let r = 0; r < 16; r++) {
        const bits = FONT16[g + r];
        if (!bits) continue;
        for (let c = 0; c < 8; c++) if (bits & (0x80 >> c)) for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) anim.px(x0 + c * sc + dx, y0 + r * sc + dy, col);
    }
}

/** a still picture (w*h*3 bytes) */
export class Still extends Anim {
    constructor(w, h, rgb) { super(w, h); this.buf.set(rgb.subarray ? rgb.subarray(0, this.buf.length) : rgb); }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (l) => l[Math.floor(Math.random() * l.length)];

/** the effects visitors pick, drawn here (the same keys as ShowPlay's page) */
export class Fx extends Anim {
    constructor(w, h, key, cols = null) {
        super(w, h);
        this.key = FX_NAMES[key] ? key : 'rainbow';
        this.cols = cols; this.last = 0; this.st = {};
        this['init_' + this.key]?.();
    }
    c(i, d) { return this.cols && this.cols[i] && this.cols[i].some((v) => v) ? this.cols[i] : d; }
    frame(t) {
        const dt = Math.max(0, Math.min(0.2, t - this.last));
        this.last = t;
        this['fx_' + this.key](t, dt);
        return this.buf;
    }

    // --- Halloween
    fx_haunted(t) {
        const { w, h, buf: b } = this;
        const flick = Math.random() > 0.02 ? 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3) : 0.3;
        for (let y = 0; y < h; y++) {
            const sy = Math.sin(y * 0.37 - t * 1.3);
            for (let x = 0; x < w; x++) {
                const v = (Math.sin(x * 0.29 + t) + sy + Math.sin((x + y) * 0.19 + t * 0.7) + 3) / 6, i = (y * w + x) * 3;
                b[i] = (40 + 110 * v) * flick; b[i + 1] = 255 * Math.max(0, v - 0.75) * 2.2 * flick; b[i + 2] = (60 + 140 * v) * flick;
            }
        }
    }
    init_eyes() { this.st.eyes = []; }
    fx_eyes(t, dt) {
        const { w, h } = this, s = Math.max(1, Math.floor(h / 16));
        const eyes = (this.st.eyes = this.st.eyes.filter((e) => t < e.end));
        if (eyes.length < Math.max(1, Math.floor(w * h / 220)) && Math.random() < dt * 1.5)
            eyes.push({ x: Math.floor(rnd(0, Math.max(1, w - 4 * s))), y: Math.floor(rnd(0, Math.max(1, h - s))), start: t, end: t + rnd(2.5, 5), blink: t + rnd(0.8, 2.2),
                c: this.c(0, pickOne([[255, 30, 0], [255, 120, 0], [120, 255, 0], [255, 220, 0]])) });
        this.fill([0, 0, 0]);
        for (const e of eyes) {
            if (e.blink <= t && t < e.blink + 0.15) continue;
            const k = Math.min(1, (t - e.start) / 0.6, (e.end - t) / 0.6), c = e.c.map((v) => v * k);
            for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) { this.px(e.x + dx, e.y + dy, c); this.px(e.x + 3 * s + dx, e.y + dy, c); }
        }
    }
    init_fire() { this.st.heat = [...Array(this.w)].map(() => new Array(this.h).fill(0)); }
    fx_fire() {
        const { w, h, buf: b } = this, cool = Math.floor(550 / h) + 2;
        this.st.heat.forEach((col, x) => {
            for (let y = 0; y < h; y++) col[y] = Math.max(0, col[y] - Math.floor(Math.random() * (cool + 1)));
            for (let y = h - 1; y > 1; y--) col[y] = Math.floor((col[y - 1] + col[y - 2] * 2) / 3);
            if (Math.random() < 0.5) { const y = Math.floor(Math.random() * Math.min(3, h)); col[y] = Math.min(255, col[y] + 160 + Math.floor(Math.random() * 96)); }
            for (let y = 0; y < h; y++) { const i = ((h - 1 - y) * w + x) * 3, c = HEAT[col[y]]; b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; }
        });
    }
    init_lightning() { this.st.next = 0.5; }
    fx_lightning(t) {
        this.fade(0.72);
        const { w, h } = this;
        if (t >= this.st.next) {
            this.st.next = t + rnd(1.5, 4);
            this.fill([30, 30, 60]);
            let x = Math.floor(Math.random() * w);
            const col = this.c(0, [220, 220, 255]);
            for (let y = 0; y < h; y++) {
                this.px(x, y, col);
                if (Math.random() < 0.15) { let bx = x; const d = Math.random() < 0.5 ? -1 : 1; for (let yy = y; yy < Math.min(h, y + h / 4); yy++) { if (Math.random() < 0.6) bx += d; this.px(bx, yy, col.map((v) => v / 2)); } }
                x = Math.max(0, Math.min(w - 1, x + pickOne([-1, 0, 0, 1])));
            }
        } else for (let i = 2; i < this.buf.length; i += 3) this.buf[i] = Math.max(this.buf[i], 6);
    }
    fx_firenoise(t) {
        const { w, h, buf: b } = this;
        for (let y = 0; y < h; y++) {
            const up = (h - 1 - y) / h;
            for (let x = 0; x < w; x++) {
                const n = (Math.sin(x * 0.45 + t * 1.7 + Math.sin(y * 0.3 + t * 2.3)) + Math.sin(y * 0.5 + t * 4.1 + x * 0.2) + 2) / 4;
                const c = HEAT[Math.floor(Math.max(0, Math.min(1, (1.15 - up * 1.3) * (0.45 + 0.75 * n))) * 255)], i = (y * w + x) * 3;
                b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2];
            }
        }
    }
    init_blackhole() { this.st.dots = [...Array(8)].map((_, i) => [rnd(0, 6.3), rnd(0.6, 1.8) * (Math.random() < 0.5 ? -1 : 1), (i + 1) / 9, i / 8]); }
    fx_blackhole(t) {
        this.fade(0.82);
        const cx = (this.w - 1) / 2, cy = (this.h - 1) / 2, rad = Math.min(this.w, this.h) / 2 * 0.95;
        for (const [a0, sp, r0, hue] of this.st.dots) {
            const rr = r0 * (0.85 + 0.15 * Math.sin(t * 0.7 + a0)), a = a0 + t * sp;
            this.px(Math.round(cx + Math.cos(a) * rad * rr), Math.round(cy + Math.sin(a) * rad * rr), hsv(hue + t * 0.05));
        }
    }
    // --- Christmas
    init_snowfall() { this.st.flakes = [...Array(Math.max(4, Math.floor(this.w * this.h / 40)))].map(() => [rnd(0, this.w), rnd(0, this.h), rnd(0.15, 0.45) * this.h]); }
    fx_snowfall(t, dt) {
        this.fill([0, 0, 18]);
        const col = this.c(0, [255, 255, 255]);
        for (const f of this.st.flakes) {
            f[1] += f[2] * dt; f[0] += Math.sin(t * 1.5 + f[2]) * dt * 1.5;
            if (f[1] >= this.h) { f[0] = rnd(0, this.w); f[1] = 0; }
            const k = f[2] / (0.45 * this.h);
            this.px(((Math.floor(f[0]) % this.w) + this.w) % this.w, f[1], col.map((v) => v * (0.5 + 0.5 * k)));
        }
    }
    fx_candy(t) {
        const { w, h } = this, c1 = this.c(0, [255, 0, 0]), c2 = this.c(1, [255, 255, 255]), sw = Math.max(2, Math.floor(w / 6)), off = Math.floor(t * 8);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.px(x, y, Math.floor((x + y + off) / sw) % 2 ? c1 : c2);
    }
    init_retro() {
        const { w, h } = this, top = Math.max(1, Math.floor(h * 0.12)), bot = Math.floor(h * 0.82), mask = [];
        for (let y = top; y < bot; y++) { const half = (y - top + 1) / (bot - top) * (w * 0.42); for (let x = 0; x < w; x++) if (Math.abs(x - (w - 1) / 2) <= half) mask.push([x, y]); }
        const trunk = [];
        for (let y = bot; y < Math.min(h, bot + Math.max(1, Math.floor(h / 8))); y++) for (let x = 0; x < w; x++) if (Math.abs(x - (w - 1) / 2) <= Math.max(0.5, w / 16)) trunk.push([x, y]);
        const lights = [...mask].sort(() => Math.random() - 0.5).slice(0, Math.min(mask.length, Math.max(3, Math.floor(mask.length / 10))))
            .map(([x, y]) => [x, y, pickOne([[255, 0, 0], [255, 200, 0], [0, 120, 255], [255, 0, 200], [255, 255, 255]]), rnd(0, 6.3), rnd(1.5, 4)]);
        Object.assign(this.st, { mask, trunk, lights, top });
    }
    fx_retro(t) {
        this.fill([0, 0, 0]);
        for (const [x, y] of this.st.mask) this.px(x, y, [0, 90, 10]);
        for (const [x, y] of this.st.trunk) this.px(x, y, [90, 45, 0]);
        for (const [x, y, c, ph, sp] of this.st.lights) { const k = 0.25 + 0.75 * Math.max(0, Math.sin(t * sp + ph)); this.px(x, y, c.map((v) => v * k)); }
        const cx = Math.floor((this.w - 1) / 2), ty = this.st.top - 1, k = 0.7 + 0.3 * Math.sin(t * 5), star = [255 * k, 210 * k, 0];
        for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) this.px(cx + dx, ty + dy, star);
    }
    init_twinkle() {
        let warm = [[255, 180, 60], [255, 120, 20], [255, 230, 150], [255, 60, 30], [200, 200, 255]];
        if (this.cols) warm = [this.c(0, warm[0]), this.c(1, warm[1])];
        this.st.p = [...Array(this.w * this.h)].map(() => [rnd(0, 6.3), rnd(0.6, 2.2), pickOne(warm)]);
    }
    fx_twinkle(t) {
        const b = this.buf;
        this.st.p.forEach(([ph, sp, c], i) => { const k = Math.max(0, Math.sin(t * sp + ph)) ** 6, o = i * 3; b[o] = c[0] * k; b[o + 1] = c[1] * k; b[o + 2] = c[2] * k; });
    }
    init_fireworks() { Object.assign(this.st, { rockets: [], parts: [], next: 0.2 }); }
    fx_fireworks(t, dt) {
        const { w, h } = this;
        this.fade(0.78);
        if (t >= this.st.next) { this.st.next = t + rnd(0.5, 1.3); this.st.rockets.push([rnd(w * 0.15, w * 0.85), h - 1, -h * rnd(0.9, 1.2), h * rnd(0.15, 0.45)]); }
        this.st.rockets = this.st.rockets.filter((k) => {
            k[1] += k[2] * dt;
            if (k[1] <= k[3]) {
                const hue = Math.random(), n = 18 + Math.floor(Math.random() * 17);
                for (let i = 0; i < n; i++) { const a = rnd(0, 6.3), sp = rnd(0.15, 0.45) * h; this.st.parts.push([k[0], k[1], Math.cos(a) * sp, Math.sin(a) * sp, t + rnd(0.8, 1.5), hsv(hue + rnd(-0.05, 0.05), 0.8)]); }
                return false;
            }
            this.px(k[0], k[1], [255, 200, 120]);
            return true;
        });
        this.st.parts = this.st.parts.filter((p) => {
            if (t >= p[4]) return false;
            p[3] += h * 0.35 * dt; p[0] += p[2] * dt; p[1] += p[3] * dt;
            this.px(p[0], p[1], p[5]);
            return true;
        });
    }
    init_bursts() { Object.assign(this.st, { rings: [], next: 0 }); }
    fx_bursts(t) {
        this.fade(0.8);
        const { w, h } = this;
        if (t >= this.st.next) { this.st.next = t + rnd(0.25, 0.7); this.st.rings.push([rnd(0, w), rnd(0, h), t, Math.random(), rnd(0.4, 0.8) * Math.max(w, h)]); }
        this.st.rings = this.st.rings.filter(([cx, cy, t0, hue, sp]) => {
            const rad = (t - t0) * sp;
            if (rad > Math.max(w, h)) return false;
            const col = hsv(hue), n = Math.floor(6.3 * rad) + 8;
            for (let k = 0; k < n; k++) { const a = k / n * 6.283; this.px(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, col); }
            return true;
        });
    }
    // --- Other celebrations
    fx_rainbow(t) {
        const { w, h } = this, off = Math.floor(t * 60), k = 256 / (w + h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.px(x, y, RAINBOW[(Math.floor((x + y) * k) + off) & 255]);
    }
    fx_plasma(t) {
        const { w, h } = this;
        const sx = [...Array(w)].map((_, x) => Math.sin(x * 0.31 + t)), sy = [...Array(h)].map((_, y) => Math.sin(y * 0.27 + t * 1.3)), sxy = [...Array(w + h)].map((_, d) => Math.sin(d * 0.17 + t * 0.7));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.px(x, y, RAINBOW[Math.floor((sx[x] + sy[y] + sxy[x + y] + 3) * 42.6 + t * 20) & 255]);
    }
    init_ripple() { Object.assign(this.st, { drops: [], next: 0 }); }
    fx_ripple(t) {
        const { w, h, buf: b } = this;
        if (t >= this.st.next) { this.st.next = t + rnd(0.6, 1.4); this.st.drops.push([rnd(0, w), rnd(0, h), t]); }
        this.st.drops = this.st.drops.filter((d) => t - d[2] < 2.5);
        const c = this.c(0, [0, 160, 255]);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let v = 0;
            for (const [cx, cy, t0] of this.st.drops) { const d = Math.hypot(x - cx, y - cy) - (t - t0) * Math.max(w, h) * 0.45; if (d > -2.5 && d < 2.5) v += Math.cos(d * 1.3) * (1 - (t - t0) / 2.5); }
            v = Math.max(0, Math.min(1, v));
            const i = (y * w + x) * 3; b[i] = c[0] * v; b[i + 1] = c[1] * v; b[i + 2] = 10 + (c[2] - 10) * v;
        }
    }
    init_matrix() { this.st.cols = [...Array(this.w)].map(() => [rnd(-this.h, 0), rnd(0.4, 1) * this.h]); }
    fx_matrix(t, dt) {
        this.fade(0.86);
        const c = this.c(0, [0, 255, 40]), head = c.map((v) => Math.min(255, v + 150));
        this.st.cols.forEach((col, x) => {
            col[0] += col[1] * dt;
            if (col[0] > this.h + rnd(0, this.h)) { col[0] = rnd(-this.h / 2, 0); col[1] = rnd(0.4, 1) * this.h; }
            const y = Math.floor(col[0]);
            this.px(x, y - 1, c); this.px(x, y, head);
        });
    }
    fx_pacifica(t) {
        const { w, h, buf: b } = this;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = (Math.sin(x * 0.25 + t * 0.9 + Math.sin(y * 0.2 + t * 0.3)) + Math.sin(y * 0.3 - t * 0.7 + x * 0.1) + 2) / 4, i = (y * w + x) * 3;
            if (v < 0.75) { const k = v / 0.75; b[i] = 0; b[i + 1] = 10 + 120 * k; b[i + 2] = 40 + 110 * k; }
            else { const k = (v - 0.75) / 0.25; b[i] = 130 * k; b[i + 1] = 130 + 100 * k; b[i + 2] = 150 + 105 * k; }
        }
    }
}
