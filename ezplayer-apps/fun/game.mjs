// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Fun: eight extras for visitors on one page, each switched on in the settings.
 *   photo frame, wheel of fortune, pick an animal, paint by numbers: shown on the matrix in turn;
 *   ring the bell: a bell on the player computer's speaker and a gold flash;
 *   snow on request: the app switches a snow (or bubble) machine on for a few seconds, by web address (smart plug, relay)
 *     or by DMX (through EZPlayer, DDP, Art-Net or E1.31; see machine.mjs);
 *   treasure hunt: clues on the phones, word or number answers, a celebration on the matrix;
 *   guess the song: a round for up to 8 phones with WAV songs from a folder on the player computer.
 */

import fs from 'node:fs';
import path from 'node:path';
import { num, cleanName } from './player.mjs';
import { cleanEnd } from './ending.mjs';
import { THEME } from './theme.mjs';
import { SPRITES as SPRITES8, spriteCell } from './sprites.mjs';
import { Anim, Text, Fx, FX_NAMES, PAL, hexRgb, hsv, plain, isBad, bigGlyph } from './lights.mjs';
import { playSound, busFor, readWav } from './audio.mjs';
import { runMachine, dmxValues, dmxFrame, machineModes, MachineLink, MACHINE_HOWS, MACHINE_COLOURS } from './machine.mjs';

/** snow can be offered: url needs the on address; DMX needs channels and where to send them */
export function snowReady(s) {
    if ((s.snowHow ?? 'url') === 'url') return !!s.snowOn;
    if (s.snowMulti ? !machineModes(s.snowModes).length : !dmxValues(s.snowChannels)) return false;
    return s.snowHow === 'ezp' ? !!s.snowModel : !!s.snowHost;
}

/** the machine as dmxFrame() wants it, from the settings */
export function machineOf(s) {
    const n = (v) => (Number.isInteger(v) && v >= 1 && v <= 512 ? v : 0);
    return {
        channels: s.snowChannels, multi: !!s.snowMulti, modes: s.snowMulti ? machineModes(s.snowModes) : [], fixed: s.snowFixed,
        lights: s.snowLights ? { dim: n(s.snowChDim), r: n(s.snowChR), g: n(s.snowChG), b: n(s.snowChB), a: n(s.snowChA), w: n(s.snowChW), macro: n(s.snowChMacro),
            macroVal: s.snowMacroVal, speed: n(s.snowChSpeed), speedVal: s.snowSpeedVal, strobe: s.snowStrobeOk ? n(s.snowChStrobe) : 0, strobeVal: s.snowStrobeVal, strobeMax: s.snowStrobeMax } : null,
        runLight: s.snowLightRun, runColour: s.snowRunColour, idle: s.snowIdle, idleColour: s.snowIdleColour,
    };
}

export const minSize = { w: 8, h: 8 };
export const KEYS = ['photo', 'wheel', 'animal', 'paint', 'bell', 'snow', 'hunt', 'song'];
export const FRAMES = THEME.frames ?? [['snow', 'Snowflakes'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['santa', 'Santa'], ['rainbow', 'Rainbow']];
export const ANIMALS = THEME.animals ?? [['penguin', 'Penguin', '🐧'], ['reindeer', 'Reindeer', '🦌'], ['snowman', 'Snowman', '⛄'], ['bear', 'Polar bear', '🐻‍❄️'], ['robin', 'Robin', '🐦']];
const WHEEL_COLS = ['ff2a2a', 'ffd23f', '39d353', '2bb7ff', '9b5cff', 'ff7a1a', 'ff4fd8', 'ffffff', 'ff2a2a', '39d353', '2bb7ff', 'ffd23f'];
const BUSY = 'The lights are busy. Try again in a moment.';
const COLOUR_NAMES = { ff2a2a: 'Red', '39d353': 'Green', '2bb7ff': 'Blue', ffd23f: 'Gold', ffffff: 'White', '9b5cff': 'Purple', ff7a1a: 'Orange', ff4fd8: 'Pink' };
const DEFAULTS = {
    target: '', fps: 25, brightness: 100,
    photo: true, photoFrames: FRAMES.map(([k]) => k), photoHold: 8, photoEvery: 30,
    wheel: true, wheelSlices: THEME.wheelSlices ?? 'fx: snowfall\ntext: Merry Christmas!\ncolour: ff2a2a\nfx: fireworks\nagain\nfx: twinkle\ncolour: 39d353\ntext: Ho ho ho!', wheelResult: 12, wheelEvery: 30,
    animal: true, animals: ANIMALS.map(([k]) => k), animalCross: 6, animalEvery: 20,
    paint: true, paintHold: 15, paintEvery: 30,
    bell: false, bellVolume: 80, bellFlash: true, bellEvery: 10,
    snow: false, snowHow: 'url', snowOn: '', snowOff: '', snowHost: '', snowUniverse: 1, snowChannels: '1=255', snowModel: '',
    snowMulti: false, snowModes: '🫧 Bubbles | 1=255, 3=200\n🌫️ Fog | 2=200, 3=150 | 8\n🎉 Everything | 1=255, 2=180, 3=220', snowFixed: '4=0',
    snowLights: false, snowChDim: 5, snowChR: 6, snowChG: 7, snowChB: 8, snowChA: 9, snowChW: 0, snowChMacro: 10, snowMacroVal: 200, snowChSpeed: 12, snowSpeedVal: 128,
    snowChStrobe: 11, snowStrobeOk: false, snowStrobeVal: 100, snowStrobeMax: 150, snowPickColour: true, snowPickRainbow: true, snowPickStrobe: false,
    snowLightRun: 'colour', snowRunColour: 'ffffff', snowIdle: 'off', snowIdleColour: '402000', snowLightOnly: true, snowRun: 10, snowGap: 120, snowNight: 20, snowFrom: 17, snowTo: 23, snowCube: true,
    hunt: false, huntClues: THEME.huntClues ?? "How many reindeer pull Santa's sleigh (without Rudolph)? | 8\nWhat do you put on top of the Christmas tree? | star\nWhat is the snowman's nose made of? | carrot", huntOrder: true,
    soundBus: 'immediate', piHost: '', piKey: '',
    song: false, songFolder: '', songClip: 6, songRounds: 5, songAnswer: 12, songVolume: 90,
};

function cleanGame(raw) {
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
    if (MACHINE_HOWS.includes(raw.snowHow)) s.snowHow = raw.snowHow;
    for (const k of ['snowMulti', 'snowLights', 'snowStrobeOk', 'snowPickColour', 'snowPickRainbow', 'snowPickStrobe', 'snowLightOnly']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    for (const [k, lo, hi] of [['snowChDim', 0, 512], ['snowChR', 0, 512], ['snowChG', 0, 512], ['snowChB', 0, 512], ['snowChA', 0, 512], ['snowChW', 0, 512], ['snowChMacro', 0, 512],
        ['snowChSpeed', 0, 512], ['snowChStrobe', 0, 512], ['snowMacroVal', 0, 255], ['snowSpeedVal', 0, 255], ['snowStrobeVal', 0, 255], ['snowStrobeMax', 0, 255]])
        if (raw[k] !== '' && raw[k] !== null && Number.isFinite(+raw[k])) s[k] = Math.max(lo, Math.min(hi, Math.round(+raw[k])));
    if (typeof raw.snowModes === 'string') s.snowModes = raw.snowModes.slice(0, 1500);
    if (typeof raw.snowFixed === 'string' && (raw.snowFixed.trim() === '' || dmxValues(raw.snowFixed))) s.snowFixed = raw.snowFixed.trim().slice(0, 300);
    if (['off', 'colour', 'rainbow'].includes(raw.snowLightRun)) s.snowLightRun = raw.snowLightRun;
    if (['off', 'colour'].includes(raw.snowIdle)) s.snowIdle = raw.snowIdle;
    for (const k of ['snowRunColour', 'snowIdleColour']) if (typeof raw[k] === 'string' && /^#?[0-9a-f]{6}$/i.test(raw[k])) s[k] = raw[k].replace('#', '').toLowerCase();
    if (typeof raw.snowHost === 'string' && (raw.snowHost === '' || /^[\w.-]{1,253}$/.test(raw.snowHost.trim()))) s.snowHost = raw.snowHost.trim();
    if (typeof raw.snowChannels === 'string' && (raw.snowChannels.trim() === '' || dmxValues(raw.snowChannels))) s.snowChannels = raw.snowChannels.trim().slice(0, 300);
    if (typeof raw.snowModel === 'string') s.snowModel = raw.snowModel.trim().slice(0, 200);
    if (Number.isFinite(+raw.snowUniverse) && raw.snowUniverse !== '' && raw.snowUniverse !== null) s.snowUniverse = Math.max(0, Math.min(63999, Math.round(+raw.snowUniverse)));
    for (const k of ['snowOn', 'snowOff']) if (typeof raw[k] === 'string' && (raw[k] === '' || /^https?:\/\/\S+$/.test(raw[k].trim()))) s[k] = raw[k].trim();
    if (['immediate', 'main', 'local', 'pi'].includes(raw.soundBus)) s.soundBus = raw.soundBus;
    if (typeof raw.piHost === 'string' && (raw.piHost.trim() === '' || /^[\w.-]{1,253}(:\d{1,5})?$/.test(raw.piHost.trim()))) s.piHost = raw.piHost.trim();
    if (typeof raw.piKey === 'string') s.piKey = raw.piKey.trim().slice(0, 64);
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

let songCache = new Map();   // file -> { at, size, song }: a WAV is read again only when it changes
export function songsOf(folder) {
    if (!folder) return [];
    let names = [];
    try { names = fs.readdirSync(folder).filter((n) => n.toLowerCase().endsWith('.wav')).sort(); } catch (e) { return []; }
    const out = [], seen = new Map();
    for (const n of names) {
        const file = path.join(folder, n);
        try {
            const st = fs.statSync(file), old = songCache.get(file);
            let song = old && old.at === st.mtimeMs && old.size === st.size ? old.song : undefined;
            if (song === undefined) {
                song = null;
                try { const w = readWav(file); if (w.seconds >= 4) song = { title: n.slice(0, -4).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), file, secs: w.seconds }; }
                catch (e) { /* not a WAV this can read */ }
            }
            seen.set(file, { at: st.mtimeMs, size: st.size, song });
            if (song) out.push(song);
        } catch (e) { /* gone meanwhile */ }
    }
    songCache = seen;
    return out;
}

// ---------------------------------------------------------------------------- the matrix's animations ----
/** the colours of the theme packs' photo frames */
const FRAME_PALS = {
    confetti: [[255, 60, 60], [255, 200, 60], [60, 160, 255], [80, 220, 100], [255, 110, 200], [170, 90, 255]], gold: [[255, 200, 60], [255, 230, 140], [255, 255, 255], [200, 150, 30]],
    silver: [[200, 205, 220], [255, 255, 255], [150, 160, 190]], leaves: [[255, 120, 20], [200, 70, 10], [255, 190, 40], [150, 60, 20]], petals: [[255, 150, 200], [255, 255, 255], [255, 90, 160]],
    spooky: [[255, 120, 0], [140, 60, 255], [80, 220, 60], [255, 120, 0]], pastel: [[255, 170, 210], [170, 220, 255], [255, 240, 150], [180, 255, 190], [210, 180, 255]],
    babyblue: [[140, 200, 255], [255, 255, 255], [90, 160, 255]], babypink: [[255, 160, 200], [255, 255, 255], [255, 110, 170]], night: [[40, 60, 160], [255, 255, 255], [255, 200, 60]],
    usa: [[255, 40, 40], [255, 255, 255], [50, 90, 255]],
};

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
            } else if (FRAME_PALS[this.style]) { const pal = FRAME_PALS[this.style], q = pal[(n * 7 + Math.floor(t * 2)) % pal.length]; c = q.map((v) => v * tw); }   // a theme pack's frame
            else c = hsv(((x + y) / (w + h) - t * 0.3) % 1 + 1);
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
        if (!this.fr && SPRITES8[animal]) {   // a theme pack's animal: an 8 x 8 picture of sprites.mjs, in the middle of the 12 x 12 box
            const rows = [...Array(12)].map((_, r) => [...Array(12)].map((__, c) => (r >= 3 && r < 11 && c >= 2 && c < 10 ? `${animal}:${c - 2}:${r - 3}` : null)));
            this.fr = [rows, rows]; this.map8 = animal;
        }
        this.sc = Math.max(1, Math.min(Math.floor(h / 16), Math.floor(w / 14)));
        this.sw = 12 * this.sc; this.sh = 12 * this.sc; this.ground = Math.max(1, Math.floor(h / 10));
        this.flakes = [...Array(Math.max(4, Math.floor(w * h / 40)))].map(() => [Math.random(), Math.random(), 0.15 + Math.random() * 0.2]);
    }
    frame(t) {
        const { w, h } = this;
        const ground = THEME.ground ?? [255, 255, 255], sky = THEME.sky ?? [0, 0, 38], flake = THEME.flake ?? [150, 150, 170];
        for (let y = 0; y < h; y++) { const c = y >= h - this.ground ? ground : [sky[0] * y / h, sky[1] * y / h, 8 + (sky[2] - 8) * y / h]; for (let x = 0; x < w; x++) this.px(x, y, c); }
        for (const [fx, fy, sp] of this.flakes) this.px(fx * w, ((fy + t * sp) % 1) * (h - this.ground), flake);
        const trick = 2, hopAt = 1.5 * this.cross;
        const tt = t < hopAt ? t : t < hopAt + trick ? hopAt : t - trick;
        const hop = t >= hopAt && t < hopAt + trick ? Math.floor(Math.abs(Math.sin((t - hopAt) / trick * 3 * Math.PI)) * this.sh * 0.5) : 0;
        const u = (tt / this.cross) % 1, x = Math.floor(u * (w + this.sw)) - this.sw;
        const f = this.fr[hop ? 0 : Math.floor(t * 4) % 2], y0 = h - this.ground - this.sh - hop;
        f.forEach((row, r) => [...row].forEach((ch, c) => {
            let col;
            if (this.map8) { if (!ch) return; const [, gx, gy] = ch.split(':'); col = spriteCell(this.map8, +gx, +gy, THEME.animalCol ?? [255, 255, 255]); if (!col) return; }
            else { if (ch === '.') return; col = SPRITE_COLS[ch]; }
            for (let dy = 0; dy < this.sc; dy++) for (let dx = 0; dx < this.sc; dx++) this.px(x + c * this.sc + dx, y0 + r * this.sc + dy, col);
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
export const END_TEXTS = { endWinText: '{winner} wins!' };
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    static startTypes = ['photo', 'wheel', 'animal', 'paint', 'bell', 'snow', 'hunt', 'song'];

    constructor(s) {
        this.s = s; this.w = 32; this.h = 16;
        this.phase = 'idle'; this.queue = []; this.cur = null; this.players = [];
        this.by = new Map(); this.results = new Map(); this.solved = new Map();
        this.snowBusy = false; this.snowNext = 0; this.snowRuns = []; this.audioBusy = false;
        this.songs = []; this.songsAt = 0;
        this.usesBy = {};   // what visitors did, for the statistics (player.mjs sends it): { extra: total }
        this.quiz = { st: 'idle', id: 0, players: [], scores: new Map(), answers: new Map(), n: 0, of: 0, opts: [], right: -1, until: 0 };
    }

    size(w, h) { this.w = w; this.h = h; }
    reset() { this.queue = []; this.cur = null; this.phase = 'idle'; }

    ready() {
        const s = this.s;
        if (this.songsFor !== s.songFolder || Date.now() - this.songsAt > 30000) { this.songs = songsOf(s.songFolder); this.songsAt = Date.now(); this.songsFor = s.songFolder; }
        return KEYS.filter((k) => s[k] && (k !== 'snow' || snowReady(s)) && (k !== 'hunt' || cluesOf(s).length) && (k !== 'song' || this.songs.length >= 4));
    }

    wait(client, key, every, now) {
        const left = Math.ceil(((this.by.get(client + key) ?? -Infinity) + every * 1000 - now) / 1000);
        if (left > 0) return left;
        this.by.set(client + key, now);
        if (this.by.size > 2000) for (const [k, v] of this.by) if (now - v > 3600000) this.by.delete(k);
        return 0;
    }

    /** false when too many are waiting */
    enqueue(item) { if (this.queue.length >= 12) return false; this.queue.push(item); return true; }

    handle(client, d, now) {
        const s = this.s, k = d.type;
        if (!KEYS.includes(k)) return '';
        if (!this.ready().includes(k)) return 'That is closed right now.';
        if (k === 'photo') {
            if (!s.photoFrames.includes(d.frame)) return '';
            const w = this.wait(client, k, s.photoEvery, now); if (w) return `You can do this again in ${w} s.`;
            if (!this.enqueue({ kind: k, client, label: 'a photo frame', frame: d.frame, secs: 3.8 + s.photoHold })) { this.by.delete(client + k); return BUSY; }
        } else if (k === 'wheel') {
            const w = this.wait(client, k, s.wheelEvery, now); if (w) return `You can spin again in ${w} s.`;
            const sl = slicesOf(s), pick = Math.floor(Math.random() * sl.length);
            if (!this.enqueue({ kind: k, client, label: 'the wheel of fortune', slices: sl, pick, secs: 6.5 + (sl[pick].k === 'again' ? 3 : s.wheelResult) })) { this.by.delete(client + k); return BUSY; }
        } else if (k === 'animal') {
            if (!s.animals.includes(d.animal)) return '';
            const w = this.wait(client, k, s.animalEvery, now); if (w) return `You can send another in ${w} s.`;
            if (!this.enqueue({ kind: k, client, label: ANIMALS.find((a) => a[0] === d.animal)[1], animal: d.animal, secs: 2 * s.animalCross + 2 })) { this.by.delete(client + k); return BUSY; }
        } else if (k === 'paint') {
            const px = String(d.px ?? ''), rg = String(d.r ?? '');
            if (!Number.isInteger(d.w) || !Number.isInteger(d.h) || d.w < 4 || d.h < 4 || d.w > 64 || d.h > 64 || px.length !== d.w * d.h || rg.length !== px.length
                || !/^[0-8]+$/.test(px) || !/^[0-9a-z]+$/.test(rg)) return 'The painting did not arrive right. Try again.';
            const w = this.wait(client, k, s.paintEvery, now); if (w) return `You can send another in ${w} s.`;
            const nreg = new Set(rg.replace(/0/g, '')).size;
            if (!this.enqueue({ kind: k, client, label: 'a painting', dw: d.w, dh: d.h, px, rg, secs: Math.min(12, nreg * 0.45) + s.paintHold })) { this.by.delete(client + k); return BUSY; }
        } else if (k === 'bell') {
            const w = this.wait(client, k, s.bellEvery, now); if (w) return `You can ring again in ${w} s.`;
            void this.ring();
            if (s.bellFlash) this.queue.unshift({ kind: 'bell', client, label: 'the bell', secs: 2 });
        } else if (k === 'snow') return this.snow(client, now, d);
        else if (k === 'hunt') return this.hunt(client, d, now);
        else if (k === 'song') return this.songMsg(client, d, now);
        this.usesBy[k] = (this.usesBy[k] ?? 0) + 1;
        this.results.set(client, { k, ok: true, at: now });
        return '';
    }

    // --- the bell
    async ring() {
        if (this.audioBusy) return;
        this.audioBusy = true;
        const rate = 22050, n = Math.floor(rate * 1.8), a = new Int16Array(n), hz = THEME.bellHz ?? 880;
        const parts = [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.18]];
        for (let i = 0; i < n; i++) {
            const t = i / rate;
            const v = parts.reduce((acc, [m, amp]) => acc + amp * Math.sin(2 * Math.PI * hz * m * t) * Math.exp(-t * (2.2 + m * 0.9)), 0);
            a[i] = Math.max(-1, Math.min(1, v / 2.1)) * 32000;
        }
        try { if (!(await playSound(a, rate, this.s.bellVolume / 100, busFor(this.s.soundBus, this.s.piHost, this.s.piKey)))) console.log('bell: nothing could play the sound here'); }
        catch (e) { console.log('bell:', e.message); }
        finally { this.audioBusy = false; }
    }

    // --- snow on request
    nightKey(now) { return new Date(now - 12 * 3600000).toDateString(); }   // a night runs from noon to noon
    snowState(now = Date.now()) {
        const s = this.s, h = new Date(now).getHours();
        const hours = s.snowFrom < s.snowTo ? h >= s.snowFrom && h < s.snowTo : h >= s.snowFrom || h < s.snowTo;
        const runs = this.snowRuns.filter((r) => r === this.nightKey(now)).length;
        const st = { busy: this.snowBusy, next: Math.max(0, Math.ceil((this.snowNext - now) / 1000)), hours, left: Math.max(0, s.snowNight - runs), from: s.snowFrom, to: s.snowTo };
        if (s.snowHow !== 'url') {   // a machine with several functions and lights (DMX only)
            const m = machineOf(s), L = m.lights;
            if (m.multi) st.modes = m.modes.map((x) => x.name);
            if (L) {
                if (s.snowPickColour && (L.r || L.g || L.b)) st.colours = MACHINE_COLOURS.map(([k, n, e]) => [k, n, e]);
                if (s.snowPickRainbow && L.macro) st.rainbow = true;
                if (s.snowPickStrobe && L.strobe) st.strobe = true;
                if (s.snowLightOnly && (L.r || L.g || L.b || L.macro)) st.lightOnly = true;
            }
        }
        return st;
    }
    /** what the phone picked: { mode, colour, strobe }, checked against the settings ('' when fine, else why not) */
    snowChoice(d) {
        const st = this.snowState(), c = { mode: 0, colour: '', strobe: false };
        if (d.light === true) { if (!st.lightOnly) return null; c.mode = -1; }
        else if (st.modes) { if (!Number.isInteger(d.mode) || d.mode < 0 || d.mode >= st.modes.length) return null; c.mode = d.mode; }
        if (typeof d.colour === 'string' && d.colour) {
            if (d.colour === 'rainbow' ? !st.rainbow : !(st.colours ?? []).some((x) => x[0] === d.colour)) return null;
            c.colour = d.colour;
        }
        if (d.strobe === true) { if (!st.strobe) return null; c.strobe = true; }
        return c;
    }
    snow(client, now, d = {}) {
        const st = this.snowState(now), s = this.s, c = this.snowChoice(d);
        if (!c) return 'That choice is not offered right now.';
        if (st.busy) return 'The machine is on already!';
        if (c.mode === -1) {   // only the lights: allowed while the machine rests and out of hours, not counted in the night's runs
            const w = this.wait(client, 'snowlight', 10, now); if (w) return `You can light it again in ${w} s.`;
            void this.snowRun(s.snowRun, c);
            this.usesBy['snow'] = (this.usesBy['snow'] ?? 0) + 1;
            this.results.set(client, { k: 'snow', ok: true, light: true, at: now });
            return '';
        }
        if (!st.hours) return `Snow is open from ${s.snowFrom}:00 to ${s.snowTo}:00.`;
        if (st.next) return `The snow machine is resting. Try again in ${st.next} s.`;
        if (!st.left) return 'No more snow tonight. Come back tomorrow!';
        const mode = st.modes ? machineModes(s.snowModes)[c.mode] : null, secs = mode?.secs ? Math.min(s.snowRun, mode.secs) : s.snowRun;
        this.snowRuns = this.snowRuns.filter((r) => r === this.nightKey(now)).concat(this.nightKey(now));
        this.snowNext = now + (secs + s.snowGap) * 1000;
        void this.snowRun(secs, c);
        if (s.snowCube) this.enqueue({ kind: 'fx', client, label: mode ? mode.name : 'falling snow', fx: 'snowfall', secs: secs + 2 });
        this.usesBy['snow'] = (this.usesBy['snow'] ?? 0) + 1;
        this.results.set(client, { k: 'snow', ok: true, at: now });
        return '';
    }
    machineCfg() {
        const s = this.s;
        return { how: s.snowHow, on: s.snowOn, off: s.snowOff, host: s.snowHost, universe: s.snowUniverse, channels: s.snowChannels, model: s.snowModel };
    }
    /** the waiting colour, when the lights stay on between runs (DMX only) */
    idleFrame() {
        const s = this.s;
        if (s.snowHow === 'url' || !s.snow || !s.snowLights || s.snowIdle !== 'colour' || !snowReady(s)) return null;
        return dmxFrame(machineOf(s), { wait: true });
    }
    async snowRun(secs, choice = { mode: 0 }) {
        const s = this.s, cfg = this.machineCfg();
        this.snowBusy = true;
        this.link ??= new MachineLink((...a) => console.log('snow:', ...a));
        try {
            if (cfg.how !== 'url') { cfg.values = dmxFrame(machineOf(s), choice); cfg.after = this.idleFrame(); }
            await runMachine(cfg, secs, (...a) => console.log('snow:', ...a), this.link);
        } catch (e) { console.log('snow: the machine could not be switched on:', e.message); }
        finally { this.snowBusy = false; }
    }
    /** keeps the waiting colour alive (every 0.5 s), and switches it off when it is no longer wanted */
    machineStep(now) {
        if (this.snowBusy || this.idleSending || now - (this.idleAt ?? 0) < 500) return;
        this.idleAt = now;
        let f = this.idleFrame();
        const cfg = this.machineCfg();
        if (f && this.idleOn && JSON.stringify(this.idleOn.cfg) !== JSON.stringify(cfg)) f = null;   // moved: the old one goes dark first
        if (!f && !this.idleOn) return;
        this.link ??= new MachineLink((...a) => console.log('snow:', ...a));
        this.idleSending = true;
        const job = f ? this.link.send(cfg, f).then(() => { this.idleOn = { cfg, n: f.length }; })
            : (async () => { const o = this.idleOn; this.idleOn = null; for (let i = 0; i < 3; i++) await this.link.send(o.cfg, new Uint8Array(o.n)).catch(() => undefined); await this.link.close(); })();
        job.catch((e) => { if (!this.idleWarned) { this.idleWarned = true; console.log('snow: the waiting colour could not be sent:', e.message); } })
            .finally(() => { this.idleSending = false; });
    }

    // --- treasure hunt
    hunt(client, d, now) {
        const cl = cluesOf(this.s), i = d.i;
        if (!Number.isInteger(i) || i < 0 || i >= cl.length) return '';
        // the clues this phone solved (a new set of clues starts again); in order, all the ones before come first
        const id = cl.map((c) => c.q + '|' + c.a).join('\n');
        let me = this.solved.get(client);
        if (!me || me.id !== id) { me = { id, done: new Set(), at: now }; this.solved.set(client, me); }
        me.at = now;
        if (this.solved.size > 2000) for (const [k, v] of this.solved) if (now - v.at > 6 * 3600000) this.solved.delete(k);
        if (this.s.huntOrder) { const first = cl.findIndex((c, j) => !me.done.has(j)); if (first >= 0 && i > first) return `Solve clue ${first + 1} first.`; }
        const w = this.wait(client, 'hunt', 3, now); if (w) return `Wait ${w} s before answering again.`;
        const c = cl[i], a = String(d.a ?? '').slice(0, 30);
        const norm = (x) => plain(x).toLowerCase().replace(/[^a-z0-9]/g, '');
        const ok = c.k === 'number' ? /^\s*-?\d{1,6}\s*$/.test(a) && +a === +c.a : norm(a) !== '' && norm(a) === norm(c.a);
        const last = ok && cl.every((x, j) => j === i || me.done.has(j));   // the treasure: every clue solved
        if (ok && !this.enqueue(last ? { kind: 'fx', client, label: 'treasure found!', fx: 'fireworks', secs: 10 } : { kind: 'fx', client, label: `clue ${i + 1} solved`, fx: 'bursts', secs: 5 })) { this.by.delete(client + 'hunt'); return BUSY; }
        if (ok) me.done.add(i);
        if (ok) this.usesBy['hunt'] = (this.usesBy['hunt'] ?? 0) + 1;
        if (ok && last) this.ending?.fire(this.s, 'win', { winner: 'The treasure hunter', colour: '', score: '' });
        this.results.set(client, { k: 'hunt', ok, i, last, at: now });
        return '';
    }

    // --- guess the song
    songMsg(client, d, now) {
        const q = this.quiz;
        const nameOf = (n) => { const v = plain(cleanName(d.name, '')).trim(); return v && !isBad(v) ? v : 'Player ' + n; };   // said aloud and shown on the lights
        if (d.a === 'new') {
            if (q.st !== 'idle' && q.st !== 'over') return 'A round is already on.';
            Object.assign(q, { st: 'lobby', id: q.id + 1, players: [{ id: client, name: nameOf(1) }], scores: new Map([[client, 0]]), answers: new Map(), n: 0, of: 0, opts: [], right: -1, until: now + 15000 });
            void this.runQuiz();
            this.usesBy['song'] = (this.usesBy['song'] ?? 0) + 1;
            return '';
        }
        if (d.a === 'join') {
            if (q.st !== 'lobby' || d.id !== q.id) return 'You cannot join this round now.';
            if (q.players.some((p) => p.id === client)) return '';
            if (q.players.length >= 8) return 'The round is full (8 players).';
            q.players.push({ id: client, name: nameOf(q.players.length + 1) });
            q.scores.set(client, 0);
            this.usesBy['song'] = (this.usesBy['song'] ?? 0) + 1;
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
                void playSound(clip, wav.rate, s.songVolume / 100, busFor(s.soundBus, s.piHost, s.piKey)).catch(() => false).finally(() => { this.audioBusy = false; });
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
            if (best > 0) this.ending?.fire(this.s, 'win', { winner: q.players.filter((p) => (q.scores.get(p.id) ?? 0) === best).map((p) => p.name).join(' and '), colour: '', score: best });
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
        this.machineStep(now);
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
