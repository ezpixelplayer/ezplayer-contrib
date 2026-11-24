// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Decorate the tree: visitors hang baubles on a tree of the show. The tree (a mega tree, a matrix, any model with a
 * grid) gets evenly spread spots; each phone picks a free spot and a colour, and the tree shows every bauble hung so
 * far for a while after each new one (or all the time). When it is full: a party, then it starts again.
 */

import { num } from './player.mjs';
import { hexRgb, hsv } from './lights.mjs';

export const minSize = { w: 4, h: 4 };
export const COLORS = ['ff2a2a', 'ffc83c', '2a7bff', 'ffffff', 'ff5fc8', 'a05bff', 'ff8c1a', '3cf0ff'];
const DEFAULTS = { target: '', fps: 20, brightness: 100, spots: 30, every: 60, show: 30, always: false, bg: 'green', restart: true };
const PARTY_MS = 15000;

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    s.spots = num(raw.spots, 8, 60, s.spots);
    s.every = num(raw.every, 0, 600, s.every);
    s.show = num(raw.show, 10, 300, s.show);
    for (const k of ['always', 'restart']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (raw.bg === 'green' || raw.bg === 'off') s.bg = raw.bg;
    return s;
}

/** n spots spread evenly over a w x h grid (farthest-point), leaving out the top 10 % and the bottom 5 %, and which spot each pixel belongs to */
export function layout(w, h, n) {
    const cand = [];
    for (let y = Math.floor(h * 0.1); y < Math.ceil(h * 0.95); y++) for (let x = 0; x < w; x++) cand.push([x, y]);
    const step = Math.max(1, Math.floor(cand.length / 3000));
    const pts = cand.filter((_, i) => i % step === 0);
    const spots = [];
    let first = pts.reduce((a, p) => ((p[0] - w / 2) ** 2 + (p[1] - h * 0.15) ** 2 < (a[0] - w / 2) ** 2 + (a[1] - h * 0.15) ** 2 ? p : a), pts[0]);
    spots.push(first);
    let dist = pts.map((p) => (p[0] - first[0]) ** 2 + (p[1] - first[1]) ** 2);
    while (spots.length < Math.min(n, pts.length)) {
        let j = 0;
        for (let i = 1; i < dist.length; i++) if (dist[i] > dist[j]) j = i;
        const s = pts[j];
        spots.push(s);
        dist = dist.map((d, i) => Math.min(d, (pts[i][0] - s[0]) ** 2 + (pts[i][1] - s[1]) ** 2));
    }
    let gap = Infinity;
    for (let i = 0; i < spots.length; i++) for (let k = i + 1; k < spots.length; k++) gap = Math.min(gap, Math.hypot(spots[i][0] - spots[k][0], spots[i][1] - spots[k][1]));
    const r2 = Math.max(0.6, (isFinite(gap) ? gap : 2) * 0.42) ** 2;
    const map = new Int16Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let best = -1, bd = r2;
        spots.forEach(([sx, sy], k) => { const d = (x - sx) ** 2 + (y - sy) ** 2; if (d <= bd) { best = k; bd = d; } });
        map[y * w + x] = best;
    }
    return { spots: spots.map(([x, y]) => [Math.round(x / Math.max(1, w - 1) * 100) / 100, Math.round(y / Math.max(1, h - 1) * 100) / 100]), map };
}

export class Game {
    static startTypes = ['hang'];

    constructor(s) { this.s = s; this.w = 0; this.h = 0; this.lay = null; this.orn = ''; this.by = new Map(); this.last = -1; this.lastAt = 0;
        this.showUntil = 0; this.partyUntil = 0; this.phase = 'idle'; this.players = []; }

    size(w, h) {
        if (w === this.w && h === this.h && this.lay && this.lay.spots.length === Math.min(this.s.spots, this.lay.n)) return;
        this.w = w; this.h = h;
        this.lay = { ...layout(w, h, this.s.spots), n: this.s.spots };
        if (this.saved && this.saved.orn.length === this.lay.spots.length && !this.orn.replace(/0/g, '')) this.orn = this.saved.orn;
        this.saved = null;
        if (this.orn.length !== this.lay.spots.length) this.orn = '0'.repeat(this.lay.spots.length);
    }

    /** the baubles survive a restart of the app or the player (kept while the number of spots stays the same) */
    saveState() { return { orn: this.orn }; }
    restore(st) { if (st && typeof st.orn === 'string' && /^[0-8]{1,200}$/.test(st.orn)) this.saved = { orn: st.orn }; }

    reset() { this.showUntil = 0; this.partyUntil = 0; this.phase = 'idle'; }

    handle(client, d, now) {
        if (d.type !== 'hang' || !this.lay) return d.type === 'hang' ? 'The tree is not ready yet.' : '';
        const n = this.lay.spots.length;
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        if (!Number.isInteger(d.i) || d.i < 0 || d.i >= n || !Number.isInteger(d.c) || d.c < 1 || d.c > COLORS.length) return '';
        if (this.orn[d.i] !== '0') return 'Someone was faster! Pick another spot.';
        const left = Math.ceil(((this.by.get(client) ?? -Infinity) + this.s.every * 1000 - now) / 1000);
        if (left > 0) return `You can hang another bauble in ${left} s.`;
        this.orn = this.orn.slice(0, d.i) + d.c + this.orn.slice(d.i + 1);
        this.by.set(client, now);
        this.last = d.i; this.lastAt = now; this.lastBy = client;
        this.showUntil = now + this.s.show * 1000;
        if (!this.orn.includes('0') && this.s.restart) { this.partyUntil = now + PARTY_MS; this.showUntil = this.partyUntil; }
        return '';
    }

    step(now) {
        if (this.partyUntil && now > this.partyUntil) { this.partyUntil = 0; this.orn = '0'.repeat(this.orn.length); }
        this.phase = this.lay && (this.s.always || now < this.showUntil || now < this.partyUntil) ? 'showing' : 'idle';
    }

    render(out, w, h, now) {
        if (w !== this.w || h !== this.h) this.size(w, h);
        const t = now / 1000, bg = this.s.bg === 'green' ? [0, 34, 6] : [0, 0, 0], party = now < this.partyUntil;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const s = this.lay.map[y * w + x], o = (y * w + x) * 3;
            let c = bg;
            if (party) c = hsv((y / h) * 0.7 - t * 0.5);
            else if (s >= 0 && this.orn[s] !== '0') {
                if (s === this.last && now - this.lastAt < 4000 && Math.floor(t * 8) % 2) c = [255, 255, 255];
                else { const k = 0.75 + 0.25 * Math.sin(t * 2.3 + s * 1.7); c = hexRgb(COLORS[+this.orn[s] - 1]).map((v) => v * k); }
            }
            out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        }
    }

    message() {
        if (!this.lay) return 'The tree is not ready yet.';
        const n = this.orn.length, used = n - this.orn.split('').filter((c) => c === '0').length;
        return Date.now() < this.partyUntil ? '🎉 The tree is full! Party on the lights!' : `${used} of ${n} baubles hung.`;
    }

    status() {
        return { spots: this.lay?.spots ?? [], orn: this.orn, colors: COLORS, every: this.s.every, party: Date.now() < this.partyUntil,
            last: this.last, lastBy: this.lastBy ?? null, players: [] };
    }
}
