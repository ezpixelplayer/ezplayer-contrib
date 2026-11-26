// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Photo in pixels: a visitor takes a selfie (or picks a photo) on the phone, the phone shrinks it to a few squares and
 * sends only those; the photo is shown on the matrix in a frame of the season, after a "3, 2, 1, flash!", then the next
 * one. Nothing is saved: a photo lives in memory while it waits and while it is on the lights.
 */

import { num } from './player.mjs';
import { Anim, hsv, bigGlyph } from './lights.mjs';
import { THEME } from './theme.mjs';

/** the frames: Christmas ones, or the theme pack's */
export const FRAMES = THEME.frames ?? [['snow', 'Snowflakes'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['santa', 'Santa'], ['rainbow', 'Rainbow']];
/** the colours of the theme packs' frames (the same as fun's photo frame) */
const FRAME_PALS = {
    confetti: [[255, 60, 60], [255, 200, 60], [60, 160, 255], [80, 220, 100], [255, 110, 200], [170, 90, 255]], gold: [[255, 200, 60], [255, 230, 140], [255, 255, 255], [200, 150, 30]],
    silver: [[200, 205, 220], [255, 255, 255], [150, 160, 190]], leaves: [[255, 120, 20], [200, 70, 10], [255, 190, 40], [150, 60, 20]], petals: [[255, 150, 200], [255, 255, 255], [255, 90, 160]],
    spooky: [[255, 120, 0], [140, 60, 255], [80, 220, 60], [255, 120, 0]], pastel: [[255, 170, 210], [170, 220, 255], [255, 240, 150], [180, 255, 190], [210, 180, 255]],
    babyblue: [[140, 200, 255], [255, 255, 255], [90, 160, 255]], babypink: [[255, 160, 200], [255, 255, 255], [255, 110, 170]], night: [[40, 60, 160], [255, 255, 255], [255, 200, 60]],
    usa: [[255, 40, 40], [255, 255, 255], [50, 90, 255]],
};
export const STYLES = [['natural', 'Natural colours'], ['pop', 'Pop art (few, bright colours)'], ['bw', 'Black and white'], ['warm', 'Old photo (warm)']];

export const minSize = { w: 8, h: 8 };
const MAX_SIDE = 40;          // the phone sends at most 40 squares a side
const DEFAULTS = { target: '', fps: 25, brightness: 100, frames: FRAMES.map(([k]) => k), noFrame: true, styles: STYLES.map(([k]) => k), showSecs: 12, countdown: true,
    waitSecs: 60, queueMax: 6 };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS, frames: [...DEFAULTS.frames], styles: [...DEFAULTS.styles] };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (Array.isArray(raw.frames)) s.frames = FRAMES.map(([k]) => k).filter((k) => raw.frames.includes(k));
    if (Array.isArray(raw.styles)) { const st = STYLES.map(([k]) => k).filter((k) => raw.styles.includes(k)); if (st.length) s.styles = st; }
    for (const k of ['noFrame', 'countdown']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (!s.frames.length) s.noFrame = true;
    for (const [k, lo, hi] of [['showSecs', 4, 120], ['waitSecs', 0, 3600], ['queueMax', 1, 30]]) s[k] = num(raw[k], lo, hi, s[k]);
    return s;
}

/** how thick the frame is on a matrix */
const frameWidth = (w, h) => Math.max(1, Math.floor(Math.min(w, h) / 9));

/** a photo (rgb of pw x ph squares) in a frame, after 3, 2, 1 and a flash */
export class PhotoShow extends Anim {
    constructor(w, h, photo, frame, style, countdown) {
        super(w, h);
        this.frameStyle = frame; this.lead = countdown ? 3.6 : 0;
        this.bw = frame ? frameWidth(w, h) : 0;
        this.ring = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.min(x, y, w - 1 - x, h - 1 - y) < this.bw) this.ring.push([x, y]);
        // the photo, stretched to the inside of the frame, in the style picked
        const iw = w - 2 * this.bw, ih = h - 2 * this.bw, { pw, ph, rgb } = photo;
        this.pic = new Uint8Array(w * h * 3);
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
            const si = (Math.floor(y * ph / ih) * pw + Math.floor(x * pw / iw)) * 3;
            const c = styled([rgb[si], rgb[si + 1], rgb[si + 2]], style), o = ((y + this.bw) * w + x + this.bw) * 3;
            this.pic[o] = c[0]; this.pic[o + 1] = c[1]; this.pic[o + 2] = c[2];
        }
    }
    framePx(t) {
        const { w, h, bw } = this;
        this.ring.forEach(([x, y], n) => {
            const d = Math.min(x, y, w - 1 - x, h - 1 - y), tw = 0.55 + 0.45 * Math.sin(t * 3 + n * 1.7), st = this.frameStyle;
            let c;
            if (st === 'snow') c = (n * 7) % 5 ? [150 * tw, 200 * tw, 255] : [255, 255, 255];
            else if (st === 'hearts') c = (x + y) % 3 ? [255, 40 + 60 * tw, 110 + 60 * tw] : [255, 255, 255];
            else if (st === 'stars') c = (n * 13) % 7 ? [255, 190 * tw, 0] : [255 * tw, 255 * tw, 200 * tw];
            else if (st === 'santa') {
                c = d === bw - 1 && bw > 1 ? [255, 255, 255] : [230, 0, 0];
                if ((x < bw * 2 || x >= w - bw * 2) && (y < bw * 2 || y >= h - bw * 2)) c = (x + y) % 2 ? [0, 170, 40] : [255, 0, 0];
            } else if (FRAME_PALS[st]) { const pal = FRAME_PALS[st], q = pal[(n * 7 + Math.floor(t * 2)) % pal.length]; c = q.map((v) => v * tw); }
            else c = hsv(((x + y) / (w + h) - t * 0.3) % 1 + 1);
            this.px(x, y, c);
        });
    }
    frame(t) {
        const { buf, lead } = this;
        buf.fill(0);
        if (t < lead - 0.6) {         // 3, 2, 1 inside the frame
            if (this.bw) this.framePx(t);
            const sc = Math.max(1, Math.floor((Math.min(this.w, this.h) - 2 * this.bw) / 17)), k = 1 - (t % 1) * 0.5;
            bigGlyph(this, String(3 - Math.floor(t)), Math.floor(this.w / 2), Math.floor(this.h / 2), sc, [255 * k, 255 * k, 255 * k]);
        } else if (t < lead - 0.35) buf.fill(255);                     // the flash
        else {
            const k = t < lead ? (t - lead + 0.35) / 0.35 : 1;          // the photo coming out of the flash
            for (let i = 0; i < buf.length; i++) buf[i] = this.pic[i] * k + 255 * (1 - k);
            if (this.bw) this.framePx(t);
        }
        return buf;
    }
}

/** a colour in a style */
function styled([r, g, b], style) {
    if (style === 'bw') { const v = Math.round(0.3 * r + 0.59 * g + 0.11 * b); return [v, v, v]; }
    if (style === 'warm') { const v = 0.3 * r + 0.59 * g + 0.11 * b; return [Math.min(255, v * 1.15 + 20), Math.min(255, v * 0.95 + 8), Math.max(0, v * 0.7)]; }
    if (style === 'pop') {        // few colours, very bright: each channel to 0, half or full
        const q = (v) => (v < 70 ? 0 : v < 170 ? 140 : 255);
        return [q(r), q(g), q(b)];
    }
    // natural: a little more colour and light, as LEDs look pale
    const m = (r + g + b) / 3, k = 1.25;
    return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round((m + (v - m) * k) * 1.1))));
}

export class Game {
    static startTypes = ['photo'];

    constructor(s) { this.s = s; this.w = 32; this.h = 16; this.reset(); this.byPhone = new Map(); this.n = 0; }

    size(w, h) { this.w = w; this.h = h; }

    /** the squares the phone sends: the inside of the frame, at most 40 a side, keeping its shape */
    photoSize() {
        const b = frameWidth(this.w, this.h), iw = this.w - 2 * b, ih = this.h - 2 * b;
        const k = Math.min(1, MAX_SIDE / Math.max(iw, ih));
        return [Math.max(4, Math.round(iw * k)), Math.max(4, Math.round(ih * k))];
    }

    reset() { this.phase = 'idle'; this.queue = []; this.cur = null; this.players = []; }

    handle(client, d, now) {
        if (d.type !== 'photo') return '';
        const last = this.byPhone.get(client) ?? -Infinity;
        const left = Math.ceil((last + this.s.waitSecs * 1000 - now) / 1000);
        if (left > 0) return `You can send another photo in ${left} s.`;
        if (this.queue.some((q) => q.client === client) || this.cur?.client === client) return 'Your photo is already in line.';
        if (this.queue.length >= this.s.queueMax) return 'Too many photos waiting. Try again in a moment!';
        const [pw, ph] = this.photoSize();
        if (d.w !== pw || d.h !== ph || typeof d.px !== 'string') return 'The photo did not arrive right. Try again.';
        const rgb = Buffer.from(d.px, 'base64');
        if (rgb.length !== pw * ph * 3) return 'The photo did not arrive right. Try again.';
        let frame = '';
        if (d.frame) { if (!this.s.frames.includes(d.frame)) return 'Pick one of the frames.'; frame = d.frame; }
        else if (!this.s.noFrame) frame = this.s.frames[0];
        const style = this.s.styles.includes(d.style) ? d.style : this.s.styles[0];
        this.queue.push({ client, n: ++this.n, photo: { pw, ph, rgb }, frame, style });
        this.byPhone.set(client, now);
        if (this.byPhone.size > 2000) for (const [k, v] of this.byPhone) if (now - v > 3600000) this.byPhone.delete(k);
        return '';
    }

    next(now) {
        const it = this.queue.shift();
        if (!it) { this.cur = null; this.phase = 'idle'; return; }
        it.anim = this.make(it);
        it.t0 = now; it.until = now + (it.anim.lead + this.s.showSecs) * 1000;
        this.cur = it; this.phase = 'showing';
    }

    make(it) { return new PhotoShow(this.w, this.h, it.photo, it.frame, it.style, this.s.countdown); }

    step(now) {
        if (this.cur && now < this.cur.until) return;
        if (this.cur) this.cur.photo = null;      // forgotten as soon as it has been shown
        if (this.cur || this.queue.length) this.next(now);
    }

    render(out, w, h, now) {
        if (!this.cur) return;
        if (this.cur.anim.w !== w || this.cur.anim.h !== h) { this.size(w, h); if (this.cur.photo) this.cur.anim = this.make(this.cur); }
        out.set(this.cur.anim.frame((now - this.cur.t0) / 1000).subarray(0, out.length));
    }

    message() { return this.cur ? 'A photo is on the lights! Smile 📸' : 'Take a selfie and see it on the lights!'; }

    status() {
        const s = this.s;
        return { size: this.photoSize(), frames: FRAMES.filter(([k]) => s.frames.includes(k)), noFrame: s.noFrame, styles: STYLES.filter(([k]) => s.styles.includes(k)),
            waitSecs: s.waitSecs, players: [], now: this.cur ? { id: this.cur.client, until: this.cur.until } : null, queue: this.queue.map((q) => ({ id: q.client })) };
    }
}
