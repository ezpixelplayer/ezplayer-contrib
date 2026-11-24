// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Decorate the tree: visitors hang baubles on a tree of the show. The tree (a mega tree, a matrix, any model with
 * pixels) gets evenly spread spots, placed by where its pixels really are in the layout, so the baubles are round and
 * go all the way round a 360° mega tree; each phone picks a free spot and a colour, and the tree shows every bauble
 * hung so far for a while after each new one (or all the time). A star on top, if there is one, twinkles gold, shines
 * at each new bauble and joins the party when the tree is full; then it starts again.
 */

import { num } from './multi-helpers.mjs';

export const COLORS = ['ff2a2a', 'ffc83c', '2a7bff', 'ffffff', 'ff5fc8', 'a05bff', 'ff8c1a', '3cf0ff'];
const DEFAULTS = { target: '', star: '', fps: 20, brightness: 100, spots: 30, every: 60, show: 30, always: false, bg: 'green', restart: true, size: 100 };
const PARTY_MS = 15000;
const MAX_CANDIDATES = 3000;

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    for (const k of ['target', 'star']) if (typeof raw[k] === 'string') s[k] = raw[k].trim().slice(0, 200);
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['spots', 8, 60], ['every', 0, 600], ['show', 10, 300], ['size', 50, 150]]) s[k] = num(raw[k], lo, hi, s[k]);
    for (const k of ['always', 'restart']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (raw.bg === 'green' || raw.bg === 'off') s.bg = raw.bg;
    return s;
}

const hexRgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
function hsv(h, s = 1, v = 1) {
    h = ((h % 1) + 1) % 1 * 6;
    const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map((x) => Math.floor(x * 255));
}

/**
 * pts: [x, y (up), z] for every pixel. n spots spread evenly over them (farthest-point, by the real distances, so the
 * strands of a mega tree count as far apart as they are), leaving out the top 10 % (a fifth on a round tree) and the bottom 5 % of the height;
 * each pixel within a bauble's radius belongs to the nearest spot. Also where each spot goes on the phone's drawing:
 * u across (round trees: the angle round the trunk, as if unrolled), v down from the top, both 0..1.
 */
export function layout(pts, n, size = 100) {
    const N = pts.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const H = (y1 - y0) || 1, vOf = (y) => (y1 - y) / H;
    const round = z1 - z0 > 0.25 * ((x1 - x0) || 1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const uOf = ([x, , z]) => (round ? ((Math.atan2(z - cz, x - cx) / (2 * Math.PI)) % 1 + 1) % 1 : (x - x0) / ((x1 - x0) || 1));
    // a round tree narrows to a point: near the top a bauble would be a ring round the whole tree, so the top fifth is
    // left for the star
    const top = round ? 0.2 : 0.1;
    let cand = [];
    for (let i = 0; i < N; i++) { const v = vOf(pts[i][1]); if (v >= top && v <= 0.95) cand.push(i); }
    if (!cand.length) cand = [...Array(N).keys()];
    const step = Math.max(1, Math.floor(cand.length / MAX_CANDIDATES));
    cand = cand.filter((_, k) => k % step === 0);
    const d2 = (a, b) => (pts[a][0] - pts[b][0]) ** 2 + (pts[a][1] - pts[b][1]) ** 2 + (pts[a][2] - pts[b][2]) ** 2;
    // the first spot: near the top, in the middle (the front of a round tree)
    const topY = y1 - (top + 0.05) * H;
    let first = cand[0], best = Infinity;
    for (const i of cand) { const [x, y, z] = pts[i]; const d = (x - cx) ** 2 + (y - topY) ** 2 + (round ? (z - z1) ** 2 : 0); if (d < best) { best = d; first = i; } }
    const spots = [first];
    const dist = cand.map((i) => d2(i, first));
    while (spots.length < Math.min(n, cand.length)) {
        let j = 0;
        for (let k = 1; k < dist.length; k++) if (dist[k] > dist[j]) j = k;
        if (dist[j] <= 0) break;
        const s = cand[j];
        spots.push(s);
        for (let k = 0; k < dist.length; k++) dist[k] = Math.min(dist[k], d2(cand[k], s));
    }
    let gap = Infinity;
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) gap = Math.min(gap, Math.sqrt(d2(spots[a], spots[b])));
    const r = (isFinite(gap) ? gap : H / 10) * 0.42 * size / 100, r2 = r * r;
    const map = new Int16Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
        if (round && vOf(pts[i][1]) < top - 0.05) continue;
        let bd = r2;
        for (let k = 0; k < spots.length; k++) { const d = d2(i, spots[k]); if (d <= bd) { bd = d; map[i] = k; } }
    }
    const r2d = (v) => Math.round(v * 100) / 100;
    return { spots: spots.map((i) => [r2d(uOf(pts[i])), r2d(vOf(pts[i][1]))]), map, round };
}

async function targetOf(base, model) {
    const r = await fetch(`${base}/api/ezp/overlays/targets?model=${encodeURIComponent(model)}&detail=nodes`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return ((await r.json()).targets ?? []).find((t) => (t.target ?? t.model) === model) ?? null;
}

/** a model's pixels: by their real positions (one colour a pixel, in the model's order), or, when the player does not
 *  give positions, as its grid */
async function pixelsOf(base, model) {
    const t = await targetOf(base, model);
    if (!t) throw new Error(`"${model}" is not in the show any more; check the app settings.`);
    const w = t.nodes?.world ?? [];
    if (t.nodeCount && w.length >= t.nodeCount * 3) {
        const pts = [];
        for (let i = 0; i < t.nodeCount; i++) pts.push([w[i * 3], w[i * 3 + 1], w[i * 3 + 2] ?? 0]);
        return { geom: { model, fmt: 'nodes', n: t.nodeCount, w: 0, h: 0 }, pts };
    }
    if (t.width && t.height) {
        let gw = t.width, gh = t.height;
        if (gw * gh > 40000) { const k = Math.sqrt(40000 / (gw * gh)); gw = Math.max(1, Math.floor(gw * k)); gh = Math.max(1, Math.floor(gh * k)); }
        const pts = [];
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) pts.push([x, gh - 1 - y, 0]);
        return { geom: { model, fmt: 'grid', n: gw * gh, w: gw, h: gh }, pts };
    }
    throw new Error(`"${model}" has no pixel positions in the player.`);
}

export class App {
    static startTypes = ['hang'];

    constructor(s) {
        this.s = s; this.ready = false; this.tree = null; this.star = null; this.lay = null; this.key = '';
        this.orn = ''; this.by = new Map(); this.last = -1; this.lastAt = 0; this.lastBy = null; this.showUntil = 0; this.partyUntil = 0;
        this.problems = []; this.twinkle = null;
    }

    async prepare({ base }) {
        const s = this.s;
        this.problems = [];
        if (!s.target) { this.ready = false; this.notReady = 'Not set up yet: open the app settings and pick the tree.'; return; }
        const tree = await pixelsOf(base, s.target);
        let star = null;
        if (s.star) { try { star = await pixelsOf(base, s.star); } catch (e) { this.problems.push(e.message); } }
        const key = [s.target, tree.geom.n, s.spots, s.size].join('|');
        if (key !== this.key) {
            this.lay = layout(tree.pts, s.spots, s.size);
            this.key = key;
            const n = this.lay.spots.length;
            if (this.saved && this.saved.orn.length === n && !this.orn.replace(/0/g, '')) this.orn = this.saved.orn;
            if (this.orn.length !== n) this.orn = '0'.repeat(n);
            this.saved = null;
        }
        this.tree = tree.geom; this.star = star?.geom ?? null;
        this.twinkle = this.star ? Float32Array.from({ length: this.star.n }, () => Math.random() * 6.3) : null;
        this.ready = true;
    }

    /** the baubles survive a restart of the app or the player (kept while the tree and the number of spots stay the same) */
    saveState() { return { orn: this.orn }; }
    restore(st) { if (st && typeof st.orn === 'string' && /^[0-8]{1,200}$/.test(st.orn)) this.saved = { orn: st.orn }; }

    handle(client, d, now) {
        if (d.type !== 'hang') return '';
        if (!this.lay) return 'The tree is not ready yet.';
        const n = this.lay.spots.length;
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        if (!Number.isInteger(d.i) || d.i < 0 || d.i >= n || !Number.isInteger(d.c) || d.c < 1 || d.c > COLORS.length) return '';
        if (this.orn[d.i] !== '0') return 'Someone was faster! Pick another spot.';
        const left = Math.ceil(((this.by.get(client) ?? -Infinity) + this.s.every * 1000 - now) / 1000);
        if (left > 0) return `You can hang another bauble in ${left} s.`;
        this.orn = this.orn.slice(0, d.i) + d.c + this.orn.slice(d.i + 1);
        this.by.set(client, now);
        if (this.by.size > 2000) for (const [k, v] of this.by) if (now - v > 3600000) this.by.delete(k);
        this.last = d.i; this.lastAt = now; this.lastBy = client;
        this.showUntil = now + this.s.show * 1000;
        if (!this.orn.includes('0') && this.s.restart) { this.partyUntil = now + PARTY_MS; this.showUntil = this.partyUntil; }
        return '';
    }

    step(now) {
        if (this.partyUntil && now > this.partyUntil) { this.partyUntil = 0; this.orn = '0'.repeat(this.orn.length); }
    }

    showing(now) { return this.ready && (this.s.always || now < this.showUntil || now < this.partyUntil); }

    frames(now) {
        if (!this.showing(now)) return [];
        const t = now / 1000, party = now < this.partyUntil, g = this.tree, map = this.lay.map, out = new Uint8Array(g.n * 3);
        const bg = this.s.bg === 'green' ? [0, 34, 6] : [0, 0, 0];
        for (let i = 0; i < g.n; i++) {
            const sp = map[i];
            let c = bg;
            if (party) c = hsv(i / g.n * 3 - t * 0.5);
            else if (sp >= 0 && this.orn[sp] !== '0') {
                if (sp === this.last && now - this.lastAt < 4000 && Math.floor(t * 8) % 2) c = [255, 255, 255];
                else { const k = 0.75 + 0.25 * Math.sin(t * 2.3 + sp * 1.7); c = hexRgb(COLORS[+this.orn[sp] - 1]).map((v) => v * k); }
            }
            out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
        }
        const list = [{ geom: g, bytes: out }];
        if (this.star) {
            const sg = this.star, sb = new Uint8Array(sg.n * 3), shine = Math.max(0, 1 - (now - this.lastAt) / 1200);
            for (let i = 0; i < sg.n; i++) {
                let c;
                if (party) c = hsv(t * 0.6 + i / sg.n);
                else { const k = 0.55 + 0.45 * Math.sin(t * 3 + this.twinkle[i]); c = [255, 190, 40].map((v) => Math.min(255, v * k + (255 - v * k) * shine)); }
                sb[i * 3] = c[0]; sb[i * 3 + 1] = c[1]; sb[i * 3 + 2] = c[2];
            }
            list.push({ geom: sg, bytes: sb });
        }
        return list;
    }

    message() {
        if (!this.lay) return 'The tree is not ready yet.';
        const n = this.orn.length, used = n - this.orn.split('').filter((c) => c === '0').length;
        return Date.now() < this.partyUntil ? '🎉 The tree is full! Party on the lights!' : `${used} of ${n} baubles hung.`;
    }

    status() {
        return { spots: this.lay?.spots ?? [], round: !!this.lay?.round, orn: this.orn, colors: COLORS, every: this.s.every, party: Date.now() < this.partyUntil,
            last: this.last, lastBy: this.lastBy, star: !!this.star, players: [] };
    }
}
