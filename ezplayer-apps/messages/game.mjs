// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Messages on the lights: visitors send a message (their own words or one of the show's), an effect of the season, or
 * a drawing, and each is shown on the matrix in turn. A word filter, a wait between requests per phone and a queue.
 */

import { num } from './player.mjs';
import fs from 'node:fs';
import { Text, Fx, Anim, FX_LIST, FX_NAMES, PAL, hexRgb, plain, isBad } from './lights.mjs';
import { readGif } from './gif.mjs';

/** the pictures: the GIFs of the ShowPlay page, in page/gifs (served with the phones' page) */
const GIF_DIR = new URL('./page/gifs/', import.meta.url);
const GIF_THEMES = { Halloween: 'hw', Christmas: 'xm', Celebrations: 'ev' };
let PACK = [];
try { PACK = JSON.parse(fs.readFileSync(new URL('pack.json', GIF_DIR), 'utf8')).filter((g) => /^[\w-]+\.gif$/.test(g.f) && fs.existsSync(new URL(g.f, GIF_DIR))); }
catch (e) { console.log('pictures:', e.message); }
const gifCache = new Map();
function gifOf(f) {
    if (!gifCache.has(f)) { if (gifCache.size > 40) gifCache.clear(); gifCache.set(f, readGif(fs.readFileSync(new URL(f, GIF_DIR)))); }
    return gifCache.get(f);
}

export const minSize = { w: 8, h: 5 };
const DEFAULTS = { target: '', fps: 25, brightness: 100, theme: 'xm', free: true, presets: 'Merry Christmas!\nHappy holidays!\nHo ho ho!\nLet it snow!',
    textSecs: 15, fxSecs: 15, drawSecs: 15, gifSecs: 10, waitSecs: 20, queueMax: 10, text: true, fx: true, draw: true, gif: true, gifAll: false };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (FX_LIST[raw.theme]) s.theme = raw.theme;
    for (const k of ['free', 'text', 'fx', 'draw', 'gif', 'gifAll']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (typeof raw.presets === 'string') s.presets = raw.presets.slice(0, 2000);
    for (const [k, lo, hi] of [['textSecs', 5, 120], ['fxSecs', 5, 120], ['drawSecs', 5, 120], ['gifSecs', 3, 120], ['waitSecs', 0, 600], ['queueMax', 1, 50]]) s[k] = num(raw[k], lo, hi, s[k]);
    return s;
}

/** the pictures visitors can pick: the ones of the theme, or all of them */
export const gifsOf = (s) => PACK.filter((g) => s.gifAll || GIF_THEMES[g.t] === s.theme);

/** an animated picture, as big as fits on the matrix (keeping its shape), in the middle, looping */
class GifAnim extends Anim {
    constructor(w, h, gif) {
        super(w, h);
        this.g = gif; this.total = gif.frames.reduce((a, f) => a + f.ms, 0);
        const k = Math.min(w / gif.w, h / gif.h);
        this.dw = Math.max(1, Math.floor(gif.w * k)); this.dh = Math.max(1, Math.floor(gif.h * k));
        this.ox = Math.floor((w - this.dw) / 2); this.oy = Math.floor((h - this.dh) / 2);
    }
    frame(t) {
        let ms = (t * 1000) % this.total, f = this.g.frames[0];
        for (const x of this.g.frames) { if (ms < x.ms) { f = x; break; } ms -= x.ms; }
        const { w, dw, dh, ox, oy, g } = this;
        this.buf.fill(0);
        for (let y = 0; y < dh; y++) {
            const sy = Math.floor(y * g.h / dh);
            for (let x = 0; x < dw; x++) {
                const si = (sy * g.w + Math.floor(x * g.w / dw)) * 3, o = ((oy + y) * w + ox + x) * 3;
                this.buf[o] = f.rgb[si]; this.buf[o + 1] = f.rgb[si + 1]; this.buf[o + 2] = f.rgb[si + 2];
            }
        }
        return this.buf;
    }
}

export const presetsOf = (s) => s.presets.split('\n').map((x) => plain(x).trim().slice(0, 40)).filter((x) => x && !isBad(x)).slice(0, 20);

/** a drawing made on the phone (colour indexes of PAL), stretched to the matrix */
class Drawing extends Anim {
    constructor(w, h, dw, dh, px) {
        super(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = +px[Math.floor(y * dh / h) * dw + Math.floor(x * dw / w)];
            if (v) this.px(x, y, hexRgb(PAL[v]));
        }
    }
}

export class Game {
    static startTypes = ['text', 'fx', 'draw', 'gif'];

    constructor(s) { this.s = s; this.w = 32; this.h = 16; this.reset(); this.byPhone = new Map(); this.n = 0; }

    size(w, h) { this.w = w; this.h = h; }
    drawSize() {      // the phone draws at most 32 squares a side, keeping the matrix's shape
        const k = Math.min(1, 32 / Math.max(this.w, this.h));
        return [Math.max(4, Math.round(this.w * k)), Math.max(4, Math.round(this.h * k))];
    }

    reset() { this.phase = 'idle'; this.queue = []; this.cur = null; this.players = []; }

    handle(client, d, now) {
        const kind = d.type;
        if (!['text', 'fx', 'draw', 'gif'].includes(kind)) return '';
        if (!this.s[kind]) return 'That is switched off right now.';
        const last = this.byPhone.get(client) ?? 0;
        const left = Math.ceil((last + this.s.waitSecs * 1000 - now) / 1000);
        if (left > 0) return `You can send another in ${left} s.`;
        if (this.queue.length >= this.s.queueMax) return 'The lights are busy. Try again in a moment.';
        let item;
        if (kind === 'text') {
            const t = plain(String(d.text ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
            if (!t) return 'Write a message first.';
            if (!this.s.free && !presetsOf(this.s).includes(t)) return 'Pick one of the messages.';
            if (isBad(t)) return 'That message cannot be shown.';
            const c = Number.isInteger(d.color) && d.color >= 1 && d.color < PAL.length ? d.color : 1;
            item = { kind, label: t, text: t, color: PAL[c] };
        } else if (kind === 'fx') {
            if (!FX_LIST[this.s.theme].some(([k]) => k === d.fx)) return 'Pick one of the effects.';
            item = { kind, label: FX_NAMES[d.fx], fx: d.fx };
        } else if (kind === 'gif') {
            const g = gifsOf(this.s).find((x) => x.f === d.f);
            if (!g) return 'Pick one of the pictures.';
            try { gifOf(g.f); } catch (e) { return 'That picture cannot be shown.'; }
            item = { kind, label: g.n, f: g.f };
        } else {
            const [dw, dh] = this.drawSize();
            const px = String(d.px ?? '');
            if (d.w !== dw || d.h !== dh || px.length !== dw * dh || !/^[0-8]+$/.test(px)) return 'The drawing did not arrive right. Try again.';
            if (!/[1-8]/.test(px)) return 'Draw something first.';
            item = { kind, label: 'a drawing', dw, dh, px };
        }
        item.client = client; item.n = ++this.n;
        this.queue.push(item);
        this.byPhone.set(client, now);
        if (this.byPhone.size > 2000) for (const [k, v] of this.byPhone) if (now - v > 3600000) this.byPhone.delete(k);
        return '';
    }

    next(now) {
        const it = this.queue.shift();
        if (!it) { this.cur = null; this.phase = 'idle'; return; }
        it.anim = this.make(it);
        const secs = it.kind === 'text' ? Math.max(this.s.textSecs, it.anim.seconds()) : it.kind === 'fx' ? this.s.fxSecs : it.kind === 'gif' ? this.s.gifSecs : this.s.drawSecs;
        it.t0 = now; it.until = now + secs * 1000;
        this.cur = it; this.phase = 'showing';
    }

    make(it) {
        const { w, h } = this;
        return it.kind === 'text' ? new Text(w, h, it.text, hexRgb(it.color)) : it.kind === 'fx' ? new Fx(w, h, it.fx) : it.kind === 'gif' ? new GifAnim(w, h, gifOf(it.f)) : new Drawing(w, h, it.dw, it.dh, it.px);
    }

    step(now) {
        if (this.cur && now < this.cur.until) return;
        if (this.cur || this.queue.length) this.next(now);
    }

    render(out, w, h, now) {
        if (!this.cur) return;
        if (this.cur.anim.w !== w || this.cur.anim.h !== h) { this.size(w, h); this.cur.anim = this.make(this.cur); }
        out.set(this.cur.anim.frame((now - this.cur.t0) / 1000));
    }

    message() {
        if (!this.cur) return 'Send a message, a picture, an effect or a drawing to the lights!';
        return `On the lights now: ${this.cur.label}`;
    }

    status() {
        const s = this.s;
        return { theme: s.theme, fx: FX_LIST[s.theme], free: s.free, presets: presetsOf(s), colors: PAL, waitSecs: s.waitSecs, drawSize: this.drawSize(),
            allow: { text: s.text, fx: s.fx, draw: s.draw, gif: s.gif && gifsOf(s).length > 0 }, gifs: s.gif ? gifsOf(s).map((g) => [g.f, g.n]) : [], players: [],
            now: this.cur ? { kind: this.cur.kind, label: this.cur.kind === 'draw' ? 'a drawing' : this.cur.label, id: this.cur.client, until: this.cur.until } : null,
            queue: this.queue.map((q) => ({ id: q.client, kind: q.kind })) };
    }
}
