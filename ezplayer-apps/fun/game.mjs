// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Fun: eight extras for visitors on one page, each switched on in the settings.
 *   photo frame, wheel of fortune, pick an animal, paint by numbers: shown on the matrix in turn;
 *   ring the bell: a bell on the player computer's speaker and a gold flash;
 *   snow on request: the app opens a web address to switch a snow (or bubble) machine on, then one to switch it off;
 *   treasure hunt: clues on the phones, word or number answers, a celebration on the matrix;
 *   guess the song: a round for up to 8 phones with WAV songs from a folder on the player computer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { num } from './player.mjs';
import { Anim, Text, Fx, FX_NAMES, PAL, hexRgb, hsv, plain, isBad, bigGlyph } from './lights.mjs';
import { playSound, readWav } from './audio.mjs';

export const minSize = { w: 8, h: 8 };
export const KEYS = ['photo', 'wheel', 'animal', 'paint', 'bell', 'snow', 'hunt', 'song'];
export const FRAMES = [['snow', 'Snowflakes'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['santa', 'Santa'], ['rainbow', 'Rainbow']];
export const ANIMALS = [['penguin', 'Penguin', '🐧'], ['reindeer', 'Reindeer', '🦌'], ['snowman', 'Snowman', '⛄'], ['bear', 'Polar bear', '🐻‍❄️'], ['robin', 'Robin', '🐦']];
const WHEEL_COLS = ['ff2a2a', 'ffd23f', '39d353', '2bb7ff', '9b5cff', 'ff7a1a', 'ff4fd8', 'ffffff', 'ff2a2a', '39d353', '2bb7ff', 'ffd23f'];
const COLOUR_NAMES = { ff2a2a: 'Red', '39d353': 'Green', '2bb7ff': 'Blue', ffd23f: 'Gold', ffffff: 'White', '9b5cff': 'Purple', ff7a1a: 'Orange', ff4fd8: 'Pink' };
const DEFAULTS = {
    target: '', fps: 25, brightness: 100,
    photo: true, photoFrames: FRAMES.map(([k]) => k), photoHold: 8, photoEvery: 30,
    wheel: true, wheelSlices: 'fx: snowfall\ntext: Merry Christmas!\ncolour: ff2a2a\nfx: fireworks\nagain\nfx: twinkle\ncolour: 39d353\ntext: Ho ho ho!', wheelResult: 12, wheelEvery: 30,
    animal: true, animals: ANIMALS.map(([k]) => k), animalCross: 6, animalEvery: 20,
    paint: true, paintHold: 15, paintEvery: 30,
    bell: false, bellVolume: 80, bellFlash: true, bellEvery: 10,
    snow: false, snowOn: '', snowOff: '', snowRun: 10, snowGap: 120, snowNight: 20, snowFrom: 17, snowTo: 23, snowCube: true,
    hunt: false, huntClues: "How many reindeer pull Santa's sleigh (without Rudolph)? | 8\nWhat do you put on top of the Christmas tree? | star\nWhat is the snowman's nose made of? | carrot", huntOrder: true,
    soundBus: 'immediate',
    song: false, songFolder: '', songClip: 6, songRounds: 5, songAnswer: 12, songVolume: 90,
};

export function cleanSettings(raw) {
    const s = { ...DEFAULTS, photoFrames: [...DEFAULTS.photoFrames], animals: [...DEFAULTS.animals] };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    for (const k of KEYS.concat(['bellFlash', 'snowCube', 'huntOrder'])) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['photoHold', 3, 30], ['photoEvery', 0, 600], ['wheelResult', 4, 60], ['wheelEvery', 0, 600],
        ['animalCross', 3, 20], ['animalEvery', 0, 600], ['paintHold', 5, 60], ['paintEvery', 0, 600], ['bellVolume', 5, 100], ['bellEvery', 0, 600],
        ['snowRun', 2, 120], ['snowGap', 10, 3600], ['snowNight', 1, 500], ['snowFrom', 0, 23], ['snowTo', 0, 24],
        ['songClip', 3, 15], ['songRounds', 3, 10], ['songAnswer', 6, 30], ['songVolume', 5, 100]]) s[k] = num(raw[k], lo, hi, s[k]);
    if (Array.isArray(raw.photoFrames)) { const f = FRAMES.map(([k]) => k).filter((k) => raw.photoFrames.includes(k)); if (f.length) s.photoFrames = f; }
    if (Array.isArray(raw.animals)) { const a = ANIMALS.map(([k]) => k).filter((k) => raw.animals.includes(k)); if (a.length) s.animals = a; }
    for (const k of ['wheelSlices', 'huntClues']) if (typeof raw[k] === 'string') s[k] = raw[k].slice(0, 4000);
    for (const k of ['snowOn', 'snowOff']) if (typeof raw[k] === 'string' && (raw[k] === '' || /^https?:\/\/\S+$/.test(raw[k].trim()))) s[k] = raw[k].trim();
    if (['immediate', 'main', 'local'].includes(raw.soundBus)) s.soundBus = raw.soundBus;
    if (typeof raw.songFolder === 'string') s.songFolder = raw.songFolder.trim().slice(0, 400);
    return s;
}

/** wheel slices from the settings: "fx: <effect>", "text: <message>", "colour: <rrggbb>" or "again", one a line */
export function slicesOf(s) {
    const out = [];
    for (const line of s.wheelSlices.split('\n').slice(0, 12)) {
        const m = /^\s*(fx|text|colou?r|again)\s*:?\s*(.*?)\s*$/i.exec(line);
        if (!m) continue;
        const k = m[1].toLowerCase().replace('color', 'colour'), v = m[2];
        if (k === 'fx' && FX_NAMES[v]) out.push({ k, v, label: FX_NAMES[v] });
        else if (k === 'text') { const t = plain(v).slice(0, 30).trim(); if (t && !isBad(t)) out.push({ k, v: t, label: t }); }
        else if (k === 'colour' && /^#?[0-9a-f]{6}$/i.test(v)) { const c = v.replace('#', '').toLowerCase(); out.push({ k, v: c, label: (COLOUR_NAMES[c] ?? 'A colour') + ' lights' }); }
        else if (k === 'again') out.push({ k, v: '', label: 'Spin again!' });
    }
    return out.length >= 2 ? out : [{ k: 'fx', v: 'snowfall', label: FX_NAMES.snowfall }, { k: 'again', v: '', label: 'Spin again!' }];
}

/** clues from the settings: "question | answer", one a line; an answer of digits only is a number */
export function cluesOf(s) {
    return s.huntClues.split('\n').map((l) => l.split('|')).filter((p) => p.length >= 2)
        .map(([q, a]) => ({ q: q.trim().slice(0, 90), a: a.trim().slice(0, 30) })).filter((c) => c.q && c.a && !isBad(c.q))
        .map((c) => ({ ...c, k: /^-?\d{1,6}$/.test(c.a) ? 'number' : 'word' })).slice(0, 10);
}

export function songsOf(folder) {
    if (!folder) return [];
    let names = [];
    try { names = fs.readdirSync(folder).filter((n) => n.toLowerCase().endsWith('.wav')).sort(); } catch (e) { return []; }
    const out = [];
    for (const n of names) {
        try { const w = readWav(path.join(folder, n)); if (w.seconds >= 4) out.push({ title: n.slice(0, -4).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), file: path.join(folder, n), secs: w.seconds }); }
        catch (e) { /* not a WAV this can read */ }
    }
    return out;
}

// ---------------------------------------------------------------------------- the matrix's animations ----
class PhotoFrame extends Anim {
    constructor(w, h, style) {
        super(w, h);
        this.style = style; this.bw = Math.max(1, Math.floor(Math.min(w, h) / 7));
        this.ring = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.min(x, y, w - 1 - x, h - 1 - y) < this.bw) this.ring.push([x, y]);
    }
    framePx(t) {
        const { w, h, bw } = this;
        this.ring.forEach(([x, y], n) => {
            const d = Math.min(x, y, w - 1 - x, h - 1 - y), tw = 0.55 + 0.45 * Math.sin(t * 3 + n * 1.7);
            let c;
            if (this.style === 'snow') c = (n * 7) % 5 ? [150 * tw, 200 * tw, 255] : [255, 255, 255];
            else if (this.style === 'hearts') c = (x + y) % 3 ? [255, 40 + 60 * tw, 110 + 60 * tw] : [255, 255, 255];
            else if (this.style === 'stars') c = (n * 13) % 7 ? [255, 190 * tw, 0] : [255 * tw, 255 * tw, 200 * tw];
            else if (this.style === 'santa') {
                c = d === bw - 1 && bw > 1 ? [255, 255, 255] : [230, 0, 0];
                if ((x < bw * 2 || x >= w - bw * 2) && (y < bw * 2 || y >= h - bw * 2)) c = (x + y) % 2 ? [0, 170, 40] : [255, 0, 0];
            } else c = hsv(((x + y) / (w + h) - t * 0.3) % 1 + 1);
            this.px(x, y, c);
        });
    }
    frame(t) {
        this.buf.fill(0);
        if (t < 3) {
            this.framePx(t);
            const sc = Math.max(1, Math.floor((Math.min(this.w, this.h) - 2 * this.bw) / 17)), k = 1 - (t % 1) * 0.5;
            bigGlyph(this, String(3 - Math.floor(t)), Math.floor(this.w / 2), Math.floor(this.h / 2), sc, [255 * k, 255 * k, 255 * k]);
        } else if (t < 3.25) this.buf.fill(255);
        else if (t < 3.8) { this.buf.fill(255 * (1 - (t - 3.25) / 0.55)); this.framePx(t); }
        else this.framePx(t);
        return this.buf;
    }
}

class WheelAnim extends Anim {
    constructor(w, h, slices, pick) {
        super(w, h);
        Object.assign(this, { slices, pick, n: slices.length, T: 5 });
        const turns = 4 + Math.floor(Math.random() * 3);     // whole turns, so it ends on the picked slice
        this.total = turns * 2 * Math.PI + 2 * Math.PI - (pick + 0.5) * (2 * Math.PI / this.n);
        this.cx = (w - 1) / 2; this.cy = (h - 1) / 2 + 0.5; this.R = Math.min(w, h) / 2 - 0.5;
        this.cells = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const dx = x - this.cx, dy = y - this.cy, d = Math.hypot(dx, dy);
            if (d <= this.R) this.cells.push([x, y, ((Math.atan2(dx, -dy) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), d]);
        }
        const s = slices[pick];
        this.res = s.k === 'fx' ? new Fx(w, h, s.v) : s.k === 'text' ? new Text(w, h, s.v, [255, 255, 255]) : s.k === 'again' ? new Text(w, h, 'SPIN AGAIN!', [255, 210, 60]) : null;
        this.col = s.k === 'colour' ? hexRgb(s.v) : null;
    }
    frame(t) {
        if (t >= this.T + 1.5) {
            const tt = t - this.T - 1.5;
            if (this.res) return this.res.frame(tt);
            this.fill(this.col.map((v) => v * (0.6 + 0.4 * Math.sin(tt * 3))));
            return this.buf;
        }
        const x = Math.min(1, t / this.T), ang = this.total * (1 - (1 - x) ** 3), seg = 2 * Math.PI / this.n;
        const blink = t > this.T && Math.floor(t * 6) % 2;
        this.buf.fill(0);
        for (const [px, py, a, d] of this.cells) {
            const i = Math.floor((((a - ang) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / seg) % this.n;
            let c = hexRgb(WHEEL_COLS[i % WHEEL_COLS.length]);
            if (d > this.R - 1) c = [255, 255, 255];
            else if (t > this.T && i !== this.pick) c = c.map((v) => v / 5);
            else if (blink && i === this.pick) c = [255, 255, 255];
            this.px(px, py, c);
        }
        const cx = Math.round(this.cx);
        for (let k = 0; k < Math.max(1, Math.floor(this.h / 10)); k++) for (let dx = -k; dx <= k; dx++) this.px(cx + dx, k, [255, 255, 255]);
        this.px(this.cx, this.cy, [255, 255, 255]);
        return this.buf;
    }
}

const SPRITES = {
    penguin: [['....kkkk....', '...kkkkkk...', '..kkwkkwkk..', '..kkkookkk..', '.kkkwwwwkkk.', '.kkwwwwwwkk.', 'kkkwwwwwwkkk', '.kkwwwwwwkk.', '..kwwwwwwk..', '..kkwwwwkk..', '...kkkkkk...', '..oo....oo..'],
        ['....kkkk....', '...kkkkkk...', '..kkwkkwkk..', '..kkkookkk..', '.kkkwwwwkkk.', '.kkwwwwwwkk.', 'kkkwwwwwwkkk', '.kkwwwwwwkk.', '..kwwwwwwk..', '..kkwwwwkk..', '...kkkkkk...', '...oo..oo...']],
    reindeer: [['........b.b.', '.........bb.', '........bbb.', '........bbkb', '.......bbbbr', 'bbbbbbbbbb..', 'bbbbbbbbbb..', 'bbbbbbbbb...', '.bbbbbbbb...', '.b.b...b.b..', '.b..b..b..b.', '.d..d..d..d.'],
        ['........b.b.', '.........bb.', '........bbb.', '........bbkb', '.......bbbbr', 'bbbbbbbbbb..', 'bbbbbbbbbb..', 'bbbbbbbbb...', '.bbbbbbbb...', '..bb...bb...', '..bb...bb...', '..dd...dd...']],
    snowman: [['....kkkk....', '....kkkk....', '...kkkkkk...', '....wwww....', '...wkwwkw...', '...wwwoow...', '....wwww....', '..wwwwwwww..', '.wwwwkwwwww.', '.wwwwwwwwww.', '.wwwwkwwwww.', '..wwwwwwww..'],
        ['............', '....kkkk....', '....kkkk....', '...kkkkkk...', '....wwww....', '...wkwwkw...', '...wwwoow...', '....wwww....', '..wwwwwwww..', '.wwwwkwwwww.', '.wwwwwwwwww.', '..wwwwwwww..']],
    bear: [['............', '............', '............', '.........ww.', '........wwkw', '........wwwk', 'wwwwwwwwwww.', 'wwwwwwwwwww.', 'wwwwwwwwwww.', '.wwwwwwwwww.', '.ww.ww..ww.w', '.ww.ww..ww.w'],
        ['............', '............', '............', '.........ww.', '........wwkw', '........wwwk', 'wwwwwwwwwww.', 'wwwwwwwwwww.', 'wwwwwwwwwww.', '.wwwwwwwwww.', '..ww.ww.ww..', '..ww.ww.ww..']],
    robin: [['............', '............', '............', '............', '......bbb...', '.....bbbbk..', '.....bbbbbo.', '..bbbrrrbb..', '.bbbrrrrbb..', '..bbrrrrb...', '...bbbbb....', '....o..o....'],
        ['............', '............', '............', '......bbb...', '.....bbbbk..', '.....bbbbbo.', '..bbbrrrbb..', '.bbbrrrrbb..', '..bbrrrrb...', '...bbbbb....', '....o..o....', '............']],
};
const SPRITE_COLS = { k: [50, 60, 110], w: [255, 255, 255], o: [255, 140, 0], b: [140, 80, 30], d: [60, 30, 10], r: [255, 30, 20] };

class AnimalAnim extends Anim {
    /** the animal crosses the matrix twice (there and back is not needed: it crosses, hops in the middle of the second crossing) */
    constructor(w, h, animal, cross) {
        super(w, h);
        this.fr = SPRITES[animal]; this.cross = cross;
        this.sc = Math.max(1, Math.min(Math.floor(h / 16), Math.floor(w / 14)));
        this.sw = 12 * this.sc; this.sh = 12 * this.sc; this.ground = Math.max(1, Math.floor(h / 10));
        this.flakes = [...Array(Math.max(4, Math.floor(w * h / 40)))].map(() => [Math.random(), Math.random(), 0.15 + Math.random() * 0.2]);
    }
    frame(t) {
        const { w, h } = this;
        for (let y = 0; y < h; y++) { const c = y >= h - this.ground ? [255, 255, 255] : [0, 0, 8 + 30 * y / h]; for (let x = 0; x < w; x++) this.px(x, y, c); }
        for (const [fx, fy, sp] of this.flakes) this.px(fx * w, ((fy + t * sp) % 1) * (h - this.ground), [150, 150, 170]);
        const trick = 2, hopAt = 1.5 * this.cross;
        const tt = t < hopAt ? t : t < hopAt + trick ? hopAt : t - trick;
        const hop = t >= hopAt && t < hopAt + trick ? Math.floor(Math.abs(Math.sin((t - hopAt) / trick * 3 * Math.PI)) * this.sh * 0.5) : 0;
        const u = (tt / this.cross) % 1, x = Math.floor(u * (w + this.sw)) - this.sw;
        const f = this.fr[hop ? 0 : Math.floor(t * 4) % 2], y0 = h - this.ground - this.sh - hop;
        f.forEach((row, r) => [...row].forEach((ch, c) => {
            if (ch === '.') return;
            for (let dy = 0; dy < this.sc; dy++) for (let dx = 0; dx < this.sc; dx++) this.px(x + c * this.sc + dx, y0 + r * this.sc + dy, SPRITE_COLS[ch]);
        }));
        if (hop) for (let k = 0; k < 3; k++) this.px(x + Math.random() * this.sw, y0 - 1 - Math.random() * 2, [255, 230, 80]);
        return this.buf;
    }
}

class PaintAnim extends Anim {
    constructor(w, h, dw, dh, px, rg) {
        super(w, h);
        this.order = [...new Set(rg)].filter((c) => c !== '0').sort();
        this.at = (x, y) => Math.floor(y * dh / h) * dw + Math.floor(x * dw / w);
        this.px0 = px; this.rg = rg;
    }
    frame(t) {
        const shown = new Set(this.order.slice(0, Math.floor(t / 0.45) + 1));
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            const i = this.at(x, y), r = this.rg[i];
            this.px(x, y, r !== '0' && !shown.has(r) ? [21, 21, 21] : hexRgb(PAL[+this.px0[i]]));
        }
        return this.buf;
    }
}

class BellFlash extends Anim {
    frame(t) { const k = Math.max(0, 1 - t / 1.6) * (0.6 + 0.4 * Math.cos(t * 18)); this.fill([255 * k, 190 * k, 40 * k]); return this.buf; }
}

class SongPulse extends Anim {
    constructor(w, h, env, hue) { super(w, h); this.env = env; this.hue = hue; }
    frame(t) {
        const i = Math.floor(t * 30), lv = i < this.env.length ? this.env[i] : 0;
        this.buf.fill(0);
        for (let x = 0; x < this.w; x++) {
            const hh = Math.floor(this.h * lv * (0.55 + 0.45 * Math.sin(x * 0.9 + t * 7))), c = hsv(this.hue + x / this.w * 0.3 + t * 0.1);
            for (let y = this.h - hh; y < this.h; y++) this.px(x, y, c);
        }
        return this.buf;
    }
}

// ------------------------------------------------------------------------------------------- the app ----
export class Game {
    static startTypes = ['photo', 'wheel', 'animal', 'paint', 'bell', 'snow', 'hunt', 'song'];

    constructor(s) {
        this.s = s; this.w = 32; this.h = 16;
        this.phase = 'idle'; this.queue = []; this.cur = null; this.players = [];
        this.by = new Map(); this.results = new Map();
        this.snowBusy = false; this.snowNext = 0; this.snowRuns = []; this.audioBusy = false;
        this.songs = []; this.songsAt = 0;
        this.quiz = { st: 'idle', id: 0, players: [], scores: new Map(), answers: new Map(), n: 0, of: 0, opts: [], right: -1, until: 0 };
    }

    size(w, h) { this.w = w; this.h = h; }
    reset() { this.queue = []; this.cur = null; this.phase = 'idle'; }

    ready() {
        const s = this.s;
        if (this.songsFor !== s.songFolder || Date.now() - this.songsAt > 30000) { this.songs = songsOf(s.songFolder); this.songsAt = Date.now(); this.songsFor = s.songFolder; }
        return KEYS.filter((k) => s[k] && (k !== 'snow' || s.snowOn) && (k !== 'hunt' || cluesOf(s).length) && (k !== 'song' || this.songs.length >= 4));
    }

    wait(client, key, every, now) {
        const left = Math.ceil(((this.by.get(client + key) ?? -Infinity) + every * 1000 - now) / 1000);
        if (left > 0) return left;
        this.by.set(client + key, now);
        return 0;
    }

    enqueue(item) { if (this.queue.length < 12) this.queue.push(item); }

    handle(client, d, now) {
        const s = this.s, k = d.type;
        if (!KEYS.includes(k)) return '';
        if (!this.ready().includes(k)) return 'That is closed right now.';
        if (k === 'photo') {
            if (!s.photoFrames.includes(d.frame)) return '';
            const w = this.wait(client, k, s.photoEvery, now); if (w) return `You can do this again in ${w} s.`;
            this.enqueue({ kind: k, client, label: 'a photo frame', frame: d.frame, secs: 3.8 + s.photoHold });
        } else if (k === 'wheel') {
            const w = this.wait(client, k, s.wheelEvery, now); if (w) return `You can spin again in ${w} s.`;
            const sl = slicesOf(s), pick = Math.floor(Math.random() * sl.length);
            this.enqueue({ kind: k, client, label: 'the wheel of fortune', slices: sl, pick, secs: 6.5 + (sl[pick].k === 'again' ? 3 : s.wheelResult) });
        } else if (k === 'animal') {
            if (!s.animals.includes(d.animal)) return '';
            const w = this.wait(client, k, s.animalEvery, now); if (w) return `You can send another in ${w} s.`;
            this.enqueue({ kind: k, client, label: ANIMALS.find((a) => a[0] === d.animal)[1], animal: d.animal, secs: 2 * s.animalCross + 2 });
        } else if (k === 'paint') {
            const px = String(d.px ?? ''), rg = String(d.r ?? '');
            if (!Number.isInteger(d.w) || !Number.isInteger(d.h) || d.w < 4 || d.h < 4 || d.w > 64 || d.h > 64 || px.length !== d.w * d.h || rg.length !== px.length
                || !/^[0-8]+$/.test(px) || !/^[0-9a-z]+$/.test(rg)) return 'The painting did not arrive right. Try again.';
            const w = this.wait(client, k, s.paintEvery, now); if (w) return `You can send another in ${w} s.`;
            const nreg = new Set(rg.replace(/0/g, '')).size;
            this.enqueue({ kind: k, client, label: 'a painting', dw: d.w, dh: d.h, px, rg, secs: Math.min(12, nreg * 0.45) + s.paintHold });
        } else if (k === 'bell') {
            const w = this.wait(client, k, s.bellEvery, now); if (w) return `You can ring again in ${w} s.`;
            void this.ring();
            if (s.bellFlash) this.queue.unshift({ kind: 'bell', client, label: 'the bell', secs: 2 });
        } else if (k === 'snow') return this.snow(client, now);
        else if (k === 'hunt') return this.hunt(client, d, now);
        else if (k === 'song') return this.songMsg(client, d, now);
        this.results.set(client, { k, ok: true, at: now });
        return '';
    }

    // --- the bell
    async ring() {
        if (this.audioBusy) return;
        this.audioBusy = true;
        const rate = 22050, n = Math.floor(rate * 1.8), a = new Int16Array(n);
        const parts = [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.18]];
        for (let i = 0; i < n; i++) {
            const t = i / rate;
            const v = parts.reduce((acc, [m, amp]) => acc + amp * Math.sin(2 * Math.PI * 880 * m * t) * Math.exp(-t * (2.2 + m * 0.9)), 0);
            a[i] = Math.max(-1, Math.min(1, v / 2.1)) * 32000;
        }
        try { if (!(await playSound(a, rate, this.s.bellVolume / 100, this.s.soundBus))) console.log('bell: nothing could play the sound here'); }
        catch (e) { console.log('bell:', e.message); }
        finally { this.audioBusy = false; }
    }

    // --- snow on request
    nightKey(now) { return new Date(now - 12 * 3600000).toDateString(); }   // a night runs from noon to noon
    snowState(now = Date.now()) {
        const s = this.s, h = new Date(now).getHours();
        const hours = s.snowFrom < s.snowTo ? h >= s.snowFrom && h < s.snowTo : h >= s.snowFrom || h < s.snowTo;
        const runs = this.snowRuns.filter((r) => r === this.nightKey(now)).length;
        return { busy: this.snowBusy, next: Math.max(0, Math.ceil((this.snowNext - now) / 1000)), hours, left: Math.max(0, s.snowNight - runs), from: s.snowFrom, to: s.snowTo };
    }
    snow(client, now) {
        const st = this.snowState(now), s = this.s;
        if (!st.hours) return `Snow is open from ${s.snowFrom}:00 to ${s.snowTo}:00.`;
        if (st.busy) return 'It is snowing already!';
        if (st.next) return `The snow machine is resting. Try again in ${st.next} s.`;
        if (!st.left) return 'No more snow tonight. Come back tomorrow!';
        this.snowRuns = this.snowRuns.filter((r) => r === this.nightKey(now)).concat(this.nightKey(now));
        this.snowNext = now + (s.snowRun + s.snowGap) * 1000;
        void this.snowRun(s.snowRun);
        if (s.snowCube) this.enqueue({ kind: 'fx', client, label: 'falling snow', fx: 'snowfall', secs: s.snowRun + 2 });
        this.results.set(client, { k: 'snow', ok: true, at: now });
        return '';
    }
    async snowRun(secs) {
        const call = (u) => (u ? fetch(u, { signal: AbortSignal.timeout(6000) }).then((r) => r.text()) : Promise.resolve());
        this.snowBusy = true;
        try { await call(this.s.snowOn); console.log(`snow: on for ${secs} s`); await new Promise((r) => setTimeout(r, secs * 1000)); }
        catch (e) { console.log('snow: the machine could not be switched on:', e.message); }
        finally { await call(this.s.snowOff).catch((e) => console.log('snow: the machine could not be switched off:', e.message)); this.snowBusy = false; }
    }

    // --- treasure hunt
    hunt(client, d, now) {
        const cl = cluesOf(this.s), i = d.i;
        if (!Number.isInteger(i) || i < 0 || i >= cl.length) return '';
        const w = this.wait(client, 'hunt', 3, now); if (w) return `Wait ${w} s before answering again.`;
        const c = cl[i], a = String(d.a ?? '').slice(0, 30);
        const norm = (x) => plain(x).toLowerCase().replace(/[^a-z0-9]/g, '');
        const ok = c.k === 'number' ? /^\s*-?\d{1,6}\s*$/.test(a) && +a === +c.a : norm(a) !== '' && norm(a) === norm(c.a);
        const last = i === cl.length - 1;
        if (ok) this.enqueue(last ? { kind: 'fx', client, label: 'treasure found!', fx: 'fireworks', secs: 10 } : { kind: 'fx', client, label: `clue ${i + 1} solved`, fx: 'bursts', secs: 5 });
        this.results.set(client, { k: 'hunt', ok, i, last, at: now });
        return '';
    }

    // --- guess the song
    songMsg(client, d, now) {
        const q = this.quiz;
        if (d.a === 'new') {
            if (q.st !== 'idle' && q.st !== 'over') return 'A round is already on.';
            Object.assign(q, { st: 'lobby', id: q.id + 1, players: [{ id: client, name: String(d.name ?? '').slice(0, 16) || 'Player 1' }], scores: new Map([[client, 0]]), answers: new Map(), n: 0, of: 0, opts: [], right: -1, until: now + 15000 });
            void this.runQuiz();
            return '';
        }
        if (d.a === 'join') {
            if (q.st !== 'lobby' || d.id !== q.id) return 'You cannot join this round now.';
            if (q.players.some((p) => p.id === client)) return '';
            if (q.players.length >= 8) return 'The round is full (8 players).';
            q.players.push({ id: client, name: String(d.name ?? '').slice(0, 16) || 'Player ' + (q.players.length + 1) });
            q.scores.set(client, 0);
            return '';
        }
        if (d.a === 'ans') {
            if (q.st !== 'question' || d.id !== q.id || d.n !== q.n || !q.players.some((p) => p.id === client) || q.answers.has(client)) return '';
            if (!Number.isInteger(d.c) || d.c < 0 || d.c >= q.opts.length) return '';
            q.answers.set(client, [d.c, now]);
        }
        return '';
    }
    async runQuiz() {
        const q = this.quiz, s = this.s, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        try {
            while (Date.now() < q.until) await sleep(200);
            const songs = this.songs;
            if (songs.length < 4) { q.st = 'idle'; return; }
            const picks = [...songs.keys()].sort(() => Math.random() - 0.5).slice(0, Math.min(s.songRounds, songs.length));
            q.of = picks.length;
            for (let n = 0; n < picks.length; n++) {
                const si = picks[n], song = songs[si];
                const opts = [si, ...[...songs.keys()].filter((j) => j !== si).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
                const wav = readWav(song.file), start = Math.min(Math.max(0, song.secs / 3), Math.max(0, song.secs - s.songClip));
                const clip = wav.mono(start, s.songClip), step = Math.max(1, Math.floor(wav.rate / 30)), env = [];
                for (let i = 0; i < clip.length; i += step) { let sum = 0, c = 0; for (let j = i; j < Math.min(clip.length, i + step); j += 4) { sum += clip[j] * clip[j]; c++; } env.push(Math.sqrt(sum / Math.max(1, c)) / 32768); }
                const peak = Math.max(1e-6, ...env);
                Object.assign(q, { st: 'question', n: n + 1, answers: new Map(), opts: opts.map((j) => songs[j].title), right: opts.indexOf(si), until: Date.now() + s.songAnswer * 1000 });
                this.queue.unshift({ kind: 'pulse', label: `guess the song: song ${n + 1}`, env: env.map((v) => Math.min(1, v / peak * 1.1)), hue: Math.random(), secs: s.songClip + 0.5 });
                if (this.cur && this.cur.kind !== 'pulse') this.cur.until = 0;
                while (this.audioBusy) await sleep(100);
                this.audioBusy = true;
                void playSound(clip, wav.rate, s.songVolume / 100, s.soundBus).catch(() => false).finally(() => { this.audioBusy = false; });
                const start0 = Date.now();
                while (Date.now() < q.until && q.answers.size < q.players.length) await sleep(150);
                for (const [pid, [c, at]] of q.answers) if (c === q.right) q.scores.set(pid, (q.scores.get(pid) ?? 0) + 100 + Math.round(Math.max(0, s.songAnswer - (at - start0) / 1000) * 5));
                q.st = 'reveal'; q.until = Date.now() + 5000;
                this.queue.unshift({ kind: 'title', label: song.title, text: song.title, color: 'ffd23f', secs: 5 });
                if (this.cur) this.cur.until = 0;
                await sleep(5000);
            }
            q.st = 'over'; q.until = Date.now() + 60000;
            const best = Math.max(...q.players.map((p) => q.scores.get(p.id) ?? 0));
            this.enqueue({ kind: 'title', label: 'guess the song: winner', text: `WINNER ${best} POINTS!`, color: '39d353', secs: 8 });
        } catch (e) { console.log('guess the song:', e.message); q.st = 'idle'; }
    }

    // --- the matrix
    make(it) {
        const { w, h } = this;
        switch (it.kind) {
            case 'photo': return new PhotoFrame(w, h, it.frame);
            case 'wheel': return new WheelAnim(w, h, it.slices, it.pick);
            case 'animal': return new AnimalAnim(w, h, it.animal, this.s.animalCross);
            case 'paint': return new PaintAnim(w, h, it.dw, it.dh, it.px, it.rg);
            case 'bell': return new BellFlash(w, h);
            case 'pulse': return new SongPulse(w, h, it.env, it.hue);
            case 'title': return new Text(w, h, it.text, hexRgb(it.color));
            default: return new Fx(w, h, it.fx);
        }
    }

    step(now) {
        if (this.quiz.st === 'over' && now > this.quiz.until) this.quiz.st = 'idle';
        for (const [c, r] of this.results) if (now - r.at > 60000) this.results.delete(c);
        if (this.cur && now < this.cur.until) return;
        const it = this.queue.shift();
        if (!it) { this.cur = null; this.phase = 'idle'; return; }
        it.anim = this.make(it); it.t0 = now; it.until = now + it.secs * 1000;
        if (it.kind === 'title') it.until = now + Math.max(it.secs, it.anim.seconds()) * 1000;
        this.cur = it; this.phase = 'showing';
    }

    render(out, w, h, now) {
        if (!this.cur) return;
        if (this.cur.anim.w !== w || this.cur.anim.h !== h) { this.size(w, h); this.cur.anim = this.make(this.cur); }
        out.set(this.cur.anim.frame((now - this.cur.t0) / 1000));
    }

    message() { return this.cur ? `On the lights now: ${this.cur.label}` : 'Pick something fun!'; }

    status() {
        const s = this.s, ready = this.ready(), q = this.quiz, now = Date.now();
        const st = { on: ready, players: [], now: this.cur ? { label: this.cur.label, id: this.cur.client ?? null } : null, queue: this.queue.map((x) => ({ id: x.client ?? null })),
            results: Object.fromEntries(this.results), paintSize: [Math.min(32, this.w), Math.min(32, this.h)] };
        if (ready.includes('photo')) st.frames = FRAMES.filter(([k]) => s.photoFrames.includes(k));
        if (ready.includes('wheel')) st.wheel = slicesOf(s).map((x, i) => [x.label.slice(0, 18), WHEEL_COLS[i % WHEEL_COLS.length]]);
        if (ready.includes('animal')) st.animals = ANIMALS.filter(([k]) => s.animals.includes(k));
        if (ready.includes('snow')) st.snow = this.snowState(now);
        if (ready.includes('hunt')) { const cl = cluesOf(s); st.hunt = cl.map((c) => [c.q, c.k]); st.huntId = cl.map((c) => c.q + c.a).join('|').length + ':' + cl.length; st.huntOrder = s.huntOrder; }
        if (ready.includes('song')) st.song = { st: q.st, id: q.id, pl: q.players.map((p) => ({ id: p.id, name: p.name, score: q.scores.get(p.id) ?? 0 })), n: q.n, of: q.of, opts: q.opts,
            right: q.st === 'reveal' || q.st === 'over' ? q.right : -1, until: q.until, ans: q.answers.size };
        return st;
    }
}
