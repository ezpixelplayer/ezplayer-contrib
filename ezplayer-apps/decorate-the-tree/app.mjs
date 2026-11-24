// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Decorate the tree: visitors hang baubles on a tree of the show. The tree (a mega tree, a matrix, any model with
 * pixels) gets evenly spread spots, placed by where its pixels really are in the layout, so the baubles are round and
 * go all the way round a 360° mega tree; each phone picks a free spot and a colour, and the tree shows every bauble
 * hung so far for a while after each new one (or all the time). A star on top, if there is one, twinkles (gold, or the
 * colour a visitor picked), shines at each new bauble and joins the party when the tree is full; then it starts again.
 */

import { num } from './multi-helpers.mjs';

export const COLORS = ['ff2a2a', 'ffc83c', '2a7bff', 'ffffff', 'ff5fc8', 'a05bff', 'ff8c1a', '3cf0ff'];
// the colours the tree itself can be (v12): green, red, blue, white, gold, pink, purple, ice blue (shown dim behind the decorations)
export const TREE_COLS = ['1e9e3c', 'd21e1e', '2a6bff', 'ffffff', 'ffc83c', 'ff5fc8', 'a05bff', '3cf0ff'];
/** the decorations: key, name, emoji (the phone draws each one in its colour) */
export const KINDS = [['bauble', 'Bauble', '🔴'], ['cane', 'Candy cane', '🍭'], ['star', 'Star', '⭐'], ['bell', 'Bell', '🔔'], ['present', 'Present', '🎁'], ['flake', 'Snowflake', '❄️'], ['heart', 'Heart', '❤️']];

/** how a decoration shines, and the star's effects: key, name, emoji (nothing flashes faster than about 3 times a second) */
export const DECO_FX = [['glow', 'Glow', '✨'], ['steady', 'Steady', '💡'], ['blink', 'Blink', '💫'], ['twinkle', 'Twinkle', '🌟'], ['pulse', 'Pulse', '💓'], ['rainbow', 'Rainbow', '🌈']];
export const STAR_FX = [['twinkle', 'Twinkle', '🌟'], ['steady', 'Steady', '💡'], ['blink', 'Blink', '💫'], ['pulse', 'Pulse', '💓'], ['spin', 'Spin', '🌀'], ['sparkle', 'Sparkle', '✨'], ['rainbow', 'Rainbow', '🌈']];
export const MAX_FX = 6;   // the most effects a visitor can ever put together (the settings choose how many: 3 by default)
const B64 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';   // one character a spot: the effects chosen, as bits
const maskOf = (keys, list) => keys.reduce((m, k) => m | (1 << list.findIndex(([x]) => x === k)), 0);
/** the effects a visitor sent: one key or a list of up to 3 of the allowed ones (steady goes alone) -> keys, or null */
function fxPick(f, allowed, dflt, max = 3) {
    let keys = f === undefined ? [dflt] : Array.isArray(f) ? f : [f];
    keys = [...new Set(keys)];
    if (!keys.length || keys.length > max || keys.some((k) => typeof k !== 'string' || !allowed.includes(k))) return null;
    if (keys.length > 1) keys = keys.filter((k) => k !== 'steady');
    return keys;
}
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // a fixed random number for each pixel

/** a decoration's brightness (0..1) for its effect at time t; rainbow also gives a colour */
// how an effect lights a decoration's pixel: [brightness 0..1, white glint 0..1]. Each one is clearly different, so they
// still tell apart on a few pixels and in a small preview: Glow breathes slowly, Steady stays on, Blink goes fully on and
// off, Twinkle sparkles white pixel by pixel, Pulse beats like a heart (two quick beats), Rainbow runs through the colours.
function decoLight(fx, t, sp, i) {
    switch (fx) {
        case 'steady': return [1, 0];
        case 'blink': return [Math.floor(t * 2 + rnd(sp)) % 2 ? 1 : 0, 0];
        case 'twinkle': { const w = Math.max(0, Math.sin(t * (5 + rnd(i) * 4) + rnd(i + 7) * 6.3)) ** 10; return [0.45 + 0.55 * w, w * 0.8]; }
        case 'pulse': { const p = ((t * 0.9 + rnd(sp)) % 1 + 1) % 1; return [0.04 + 0.96 * Math.max(Math.exp(-((p - 0.1) ** 2) / 0.003), 0.8 * Math.exp(-((p - 0.3) ** 2) / 0.003)), 0]; }
        case 'rainbow': return [1, 0];
        default: return [0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.6 + sp * 1.7)), 0];   // glow
    }
}
const FX_TURN = 2.5;   // several effects on one decoration take turns, this many seconds each

/**
 * how a decoration lights a pixel at (x across, y up), both in radii from its middle: null = not part of it, else
 * [colour 0..1 of its own colour, white mix 0..1]. Coarse on purpose: on a tree a decoration is a handful of pixels.
 */
export function shapeAt(kind, x, y) {
    const d = Math.hypot(x, y);
    switch (kind) {
        case 'cane': {   // a hook: a stem, then a half circle at the top; stripes across it
            const stem = Math.abs(x + 0.2) < 0.32 && y > -1 && y < 0.35;
            const hk = Math.hypot(x - 0.15, y - 0.35), hook = y >= 0.35 && hk > 0.05 && hk < 0.62 && Math.abs(hk - 0.35) < 0.3;
            if (!stem && !hook) return null;
            return Math.floor((x + y) * 2.2 + 10) % 2 ? [1, 0] : [0, 1];
        }
        case 'star': {   // five points: inside the star polygon (outer radius 0.95, inner 0.4)
            if (d > 0.95) return null;
            let a = Math.atan2(x, y);   // 0 = straight up
            const seg = Math.PI / 5;
            a = ((a % (2 * seg)) + 2 * seg) % (2 * seg);
            const t = a <= seg ? a / seg : (2 * seg - a) / seg;   // 0 at a point, 1 between two points
            // the edge from a point (r 0.95) to the notch (r 0.4), as a straight line in the plane
            const p1 = [0, 0.95], p2 = [0.4 * Math.sin(seg), 0.4 * Math.cos(seg)];
            const ang = t * seg, dir = [Math.sin(ang), Math.cos(ang)];
            const ex = p2[0] - p1[0], ey = p2[1] - p1[1], den = dir[0] * ey - dir[1] * ex;
            const lim = den ? (p1[0] * ey - p1[1] * ex) / den : 0.95;
            return d <= lim ? [1, d < 0.18 ? 0.4 : 0] : null;
        }
        case 'bell': {   // a dome widening to a rim, a clapper below
            if (y < -0.75 && y > -1 && Math.abs(x) < 0.2) return [1, 0.6];
            if (y > 0.9 || y < -0.75) return null;
            const half = y > 0.35 ? 0.35 * Math.sqrt(Math.max(0, 1 - ((y - 0.35) / 0.55) ** 2)) : 0.35 + (0.35 - y) * 0.45;
            return Math.abs(x) <= half ? [1, y < -0.55 ? 0.25 : 0] : null;
        }
        case 'present': {   // a box with a ribbon across and down, a bow on top
            if (y > 0.65 && y < 0.95 && Math.abs(Math.abs(x) - 0.22) < 0.2) return [0, 0];   // the bow: gold
            if (Math.abs(x) > 0.75 || y > 0.65 || y < -0.85) return null;
            return Math.abs(x) < 0.16 || Math.abs(y + 0.1) < 0.16 ? [0, 0] : [1, 0];
        }
        case 'flake': {   // six arms
            const a = ((Math.atan2(y, x) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3), off = Math.min(a, Math.PI / 3 - a) * d;
            return d < 0.95 && (off < 0.16 || d < 0.2) ? [1, 0.5] : null;
        }
        case 'heart': {
            const X = x * 1.15, Y = y * 1.15 + 0.15, v = (X * X + Y * Y - 0.55) ** 3 - X * X * Y * Y * Y;
            return v <= 0 ? [1, 0] : null;
        }
        default: return d <= 1 ? [1, d < 0.35 && x < 0 && y > 0 ? 0.35 : 0] : null;   // a bauble with a shine
    }
}
const DEFAULTS = { target: '', shape: 'tree', star: '', kinds: KINDS.map(([k]) => k), fx: DECO_FX.map(([k]) => k), starFx: 'twinkle', starFxs: STAR_FX.map(([k]) => k), starPick: true, maxFx: 3, maxDeco: 5, starColor: 'ffbe28', starEvery: 30, treeColor: '1e9e3c', treePick: true, fps: 20, brightness: 100, spots: 30, every: 60, show: 30, always: false, bg: 'green', restart: true, size: 100 };
const PARTY_MS = 15000;
const MAX_CANDIDATES = 3000;

export function cleanSettings(raw) {
    const s = { ...DEFAULTS, kinds: [...DEFAULTS.kinds], fx: [...DEFAULTS.fx], starFxs: [...DEFAULTS.starFxs] };
    if (!raw || typeof raw !== 'object') return s;
    for (const [key, list] of [['kinds', KINDS], ['fx', DECO_FX], ['starFxs', STAR_FX]])
        if (Array.isArray(raw[key])) { const k = list.map(([x]) => x).filter((x) => raw[key].includes(x)); if (k.length) s[key] = k; }
    if (STAR_FX.some(([k]) => k === raw.starFx)) s.starFx = raw.starFx;
    for (const k of ['target', 'star']) if (typeof raw[k] === 'string') s[k] = raw[k].trim().slice(0, 200);
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['maxFx', 1, MAX_FX], ['maxDeco', 1, 10], ['starEvery', 0, 600], ['spots', 8, 60], ['every', 0, 600], ['show', 10, 300], ['size', 50, 150]]) s[k] = num(raw[k], lo, hi, s[k]);
    for (const k of ['always', 'restart', 'starPick', 'treePick']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (typeof raw.treeColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(raw.treeColor)) s.treeColor = raw.treeColor.replace('#', '').toLowerCase();
    if (typeof raw.starColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(raw.starColor)) s.starColor = raw.starColor.replace('#', '').toLowerCase();
    if (raw.bg === 'green' || raw.bg === 'off') s.bg = raw.bg;
    if (raw.shape === 'tree' || raw.shape === 'fill') s.shape = raw.shape;
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
/**
 * a flat model can stand at any angle in a 3D layout (a matrix turned 45°, a carpet lying flat): its pixels are turned
 * to face the front, so it is not taken for a round tree. pts in, pts out ([x, y up, z]; z = 0 when flat).
 */
export function faceFront(pts) {
    const N = pts.length;
    if (!N) return pts;
    let mx = 0, my = 0, mz = 0;
    for (const [x, y, z] of pts) { mx += x; my += y; mz += z; }
    mx /= N; my /= N; mz /= N;
    let sxx = 0, szz = 0, sxz = 0, syy = 0;
    for (const [x, y, z] of pts) { const a = x - mx, b = z - mz, c = y - my; sxx += a * a; szz += b * b; sxz += a * b; syy += c * c; }
    // the main direction of the pixels seen from above, and how thin they are across it
    const tr = sxx + szz, det = sxx * szz - sxz * sxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    let ex = 1, ez = 0;
    if (Math.abs(sxz) > 1e-12) { ex = l1 - szz; ez = sxz; const m = Math.hypot(ex, ez); ex /= m; ez /= m; } else if (szz > sxx) { ex = 0; ez = 1; }
    if (ex < 0 || (ex === 0 && ez < 0)) { ex = -ex; ez = -ez; }
    if (l1 > 0 && l2 < 0.02 * l1) return pts.map(([x, y, z]) => [(x - mx) * ex + (z - mz) * ez, y, 0]);                   // standing up, at any angle
    if (l1 > 0 && syy < 0.02 * l1) return pts.map(([x, , z]) => [(x - mx) * ex + (z - mz) * ez, -((x - mx) * -ez + (z - mz) * ex), 0]);   // lying flat
    return pts;                                                                                                              // round: a real 3D tree
}

export function layout(pts, n, size = 100, shape = 'tree') {
    pts = faceFront(pts);
    const N = pts.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const H = (y1 - y0) || 1, W = (x1 - x0) || 1, vOf = (y) => (y1 - y) / H;
    const round = z1 - z0 > 0.25 * W, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // a flat model (a matrix) gets a tree drawn on it: a triangle (green), a trunk (brown) and a star on top; the
    // decorations go only on the triangle. Sizes by the real distances, so a wide matrix still gets a tree of tree shape.
    const drawn = !round && shape === 'tree';
    const zone = new Uint8Array(N);   // 0 outside, 1 the tree, 2 the trunk, 3 the drawn star
    const yTop = 0.17 * H, yBase = 0.86 * H, hwMax = Math.min(0.47 * W, 0.42 * (yBase - yTop)), starR = Math.min(0.11 * H, 0.12 * W);
    const starAt = 0.09 * H, trunkHw = Math.max(0.09 * hwMax, 0.5 * W / Math.max(8, Math.sqrt(N)));
    const hwAt = (Y) => hwMax * (Y - yTop) / (yBase - yTop);
    const starDu = new Float32Array(N), starDv = new Float32Array(N);
    if (drawn) for (let i = 0; i < N; i++) {
        const X = pts[i][0] - cx, Y = y1 - pts[i][1];
        if (Y >= yTop && Y <= yBase && Math.abs(X) <= hwAt(Y)) zone[i] = 1;
        else if (Y > yBase && Y <= 0.985 * H && Math.abs(X) <= trunkHw) zone[i] = 2;
        else if (shapeAt('star', X / starR, (starAt - Y) / starR)) { zone[i] = 3; starDu[i] = X / starR; starDv[i] = (starAt - Y) / starR; }
    }
    const uOf = ([x, y, z]) => {
        if (round) return ((Math.atan2(z - cz, x - cx) / (2 * Math.PI)) % 1 + 1) % 1;
        if (!drawn) return (x - x0) / W;
        const hw = hwAt(y1 - y); return Math.max(0, Math.min(1, 0.5 + (x - cx) / (2 * Math.max(hw, 1e-9))));   // across the triangle, as the phone draws it
    };
    const vPhone = (y) => (drawn ? Math.max(0, Math.min(1, ((y1 - y) - yTop) / (yBase - yTop))) : vOf(y));
    // a round tree narrows to a point: near the top a bauble would be a ring round the whole tree, so the top fifth is
    // left for the star
    const top = round ? 0.2 : 0.1;
    let cand = [];
    if (drawn) {   // a small matrix: no more decorations than fit with about 12 pixels each
        let treePx = 0; for (let i = 0; i < N; i++) if (zone[i] === 1) treePx++;
        n = Math.max(3, Math.min(n, Math.floor(treePx / 12)));
    }
    if (drawn) { for (let i = 0; i < N; i++) { const Y = y1 - pts[i][1], X = pts[i][0] - cx; if (zone[i] === 1 && Y > yTop + 0.12 * (yBase - yTop) && Y < yBase - 0.03 * H && Math.abs(X) < hwAt(Y) * 0.85) cand.push(i); } }
    else for (let i = 0; i < N; i++) { const v = vOf(pts[i][1]); if (v >= top && v <= 0.95) cand.push(i); }
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
        if (drawn && zone[i] !== 1) continue;
        let bd = r2;
        for (let k = 0; k < spots.length; k++) { const d = d2(i, spots[k]); if (d <= bd) { bd = d; map[i] = k; } }
    }
    // where each pixel is in its decoration, in radii: du across (round trees: along the surface, round the trunk), dv up
    const du = new Float32Array(N), dv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const k = map[i];
        if (k < 0) continue;
        const [sx, sy, sz] = pts[spots[k]], [x, y, z] = pts[i];
        if (round) { const a = Math.atan2(sz - cz, sx - cx); du[i] = ((x - sx) * -Math.sin(a) + (z - sz) * Math.cos(a)) / r; }
        else du[i] = (x - sx) / r;
        dv[i] = (y - sy) / r;
    }
    const r2d = (v) => Math.round(v * 100) / 100;
    const counts = new Int32Array(spots.length);
    for (let i = 0; i < N; i++) if (map[i] >= 0) counts[map[i]]++;
    const starAng = Float32Array.from(starDu, (x, i) => ((Math.atan2(starDv[i], x) / (2 * Math.PI)) % 1 + 1) % 1);
    return { spots: spots.map((i) => [r2d(uOf(pts[i])), r2d(vPhone(pts[i][1]))]), map, du, dv, counts, round, drawn, zone, starAng };
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
    static startTypes = ['hang', 'star'];

    constructor(s) {
        this.s = s; this.ready = false; this.tree = null; this.star = null; this.lay = null; this.key = '';
        this.orn = ''; this.kinds = ''; this.fxs = ''; this.by = new Map(); this.last = -1; this.lastSet = []; this.hung = 0; this.lastAt = 0; this.lastBy = null; this.showUntil = 0; this.partyUntil = 0;
        this.problems = []; this.twinkle = null;
        this.starCol = ''; this.starFx = null; this.starAng = null; this.starBy = new Map(); this.starAt = 0; this.starLastBy = null;
        this.treeCol = ''; this.treeBy = new Map(); this.treeAt = 0; this.treeLastBy = null;   // the tree's colour, picked by a visitor ('' = the one in the settings)
        // the star's colour, picked by a visitor ('' = the one in the settings)
    }

    async prepare({ base, groups = {} }) {
        const s = this.s;
        this.problems = [];
        if (!s.target) { this.ready = false; this.notReady = 'Not set up yet: open the app settings and pick the tree.'; return; }
        const tree = await pixelsOf(base, s.target);
        // the star: a model, a group of the show, or several separated by commas (each model lit the same way)
        const stars = [];
        const names = [...new Set(s.star.split(',').map((x) => x.trim()).filter(Boolean).flatMap((x) => groups[x] ?? [x]))].filter((m) => m !== s.target).slice(0, 64);
        for (const m of names) {
            try {
                const st = await pixelsOf(base, m);
                const cx = st.pts.reduce((a, p) => a + p[0], 0) / st.pts.length, cy = st.pts.reduce((a, p) => a + p[1], 0) / st.pts.length;
                stars.push({ geom: st.geom, twinkle: Float32Array.from({ length: st.geom.n }, () => Math.random() * 6.3),
                    ang: Float32Array.from(st.pts, ([x, y]) => ((Math.atan2(y - cy, x - cx) / (2 * Math.PI)) % 1 + 1) % 1) });   // each pixel's angle round its star's middle, for Spin
            } catch (e) { this.problems.push(`star: ${e.message}`); }
        }
        if (s.star && !stars.length) this.problems.push(`star: "${s.star}" is not a model or a group of the show`);
        const key = [s.target, tree.geom.n, s.spots, s.size, s.shape].join('|');
        if (key !== this.key) {
            this.lay = layout(tree.pts, s.spots, s.size, s.shape);
            this.key = key;
            const n = this.lay.spots.length;
            if (this.saved && this.saved.orn.length === n && !this.orn.replace(/0/g, '')) { this.orn = this.saved.orn; this.kinds = this.saved.kinds; this.fxs = this.saved.fxs; }
            if (this.orn.length !== n) this.orn = '0'.repeat(n);
            if (this.kinds.length !== n) this.kinds = '0'.repeat(n);
            if (this.fxs.length !== n) this.fxs = '0'.repeat(n);
            this.saved = null;
        }
        this.tree = tree.geom; this.stars = stars; this.star = stars.length > 0 || this.lay.drawn;   // a matrix has its own star
        this.ready = true;
    }

    /** the baubles survive a restart of the app or the player (kept while the tree and the number of spots stay the same) */
    saveState() { return { orn: this.orn, kinds: this.kinds, fxs: this.fxs, fxv: 2, star: this.starCol, starFx: this.starFx, tree: this.treeCol }; }
    restore(st) {
        const same = (x) => (typeof x === 'string' && x.length === st.orn.length && /^[0-9]*$/.test(x) ? x : '0'.repeat(st.orn.length));
        // effects: one character a spot, the chosen effects as bits (fxv 2); before that, one digit: the single effect
        const fxs = typeof st?.fxs === 'string' && st.fxs.length === st.orn?.length ? (st.fxv === 2 ? [...st.fxs].map((c) => (B64.includes(c) ? c : '0')).join('')
            : [...st.fxs].map((c) => (/[0-9]/.test(c) && +c < DECO_FX.length && +c > 0 ? B64[1 << +c] : '0')).join('')) : '0'.repeat(st?.orn?.length ?? 0);
        if (st && typeof st.orn === 'string' && /^[0-8]{1,200}$/.test(st.orn)) this.saved = { orn: st.orn, kinds: same(st.kinds), fxs };
        if (st && typeof st.star === 'string' && /^([0-9a-f]{6})?$/.test(st.star)) this.starCol = st.star;
        if (st && typeof st.tree === 'string' && /^([0-9a-f]{6})?$/.test(st.tree)) this.treeCol = st.tree;
        const sf = typeof st?.starFx === 'string' ? [st.starFx] : st?.starFx;
        if (Array.isArray(sf) && sf.length && sf.length <= MAX_FX && sf.every((k) => STAR_FX.some(([x]) => x === k))) this.starFx = sf;
    }

    handle(client, d, now) {
        if (d.type === 'star') return this.colourStar(client, d, now);
        if (d.type === 'tree') return this.colourTree(client, d, now);
        if (d.type !== 'hang') return '';
        if (!this.lay) return 'The tree is not ready yet.';
        const n = this.lay.spots.length;
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        // one decoration ({i, c, k, f}) or several at once ({d: [[i, c, k, f], ...]}, up to maxDeco), hung together
        const list = Array.isArray(d.d) ? d.d.map((x) => (Array.isArray(x) ? { i: x[0], c: x[1], k: x[2], f: x[3] } : x)) : [{ i: d.i, c: d.c, k: d.k, f: d.f }];
        if (!list.length) return '';
        if (list.length > this.s.maxDeco) return this.s.maxDeco > 1 ? `You can hang up to ${this.s.maxDeco} decorations at once.` : 'You can hang one decoration at a time.';
        const left = Math.ceil(((this.by.get(client) ?? -Infinity) + this.s.every * 1000 - now) / 1000);
        if (left > 0) return `You can hang more decorations in ${left} s.`;
        const ok = [], seen = new Set();
        let taken = 0;
        for (const x of list) {
            if (!x || typeof x !== 'object' || !Number.isInteger(x.i) || x.i < 0 || x.i >= n || seen.has(x.i) || !Number.isInteger(x.c) || x.c < 1 || x.c > COLORS.length) return '';
            seen.add(x.i);
            const kind = x.k === undefined ? 'bauble' : x.k;
            const ki = KINDS.findIndex(([k]) => k === kind);
            if (ki < 0 || !this.s.kinds.includes(kind)) return 'Pick one of the decorations.';
            const fx = fxPick(x.f, this.s.fx, this.s.fx[0], this.s.maxFx);
            if (!fx) return this.s.maxFx > 1 ? `Pick one of the effects (up to ${this.s.maxFx} together).` : 'Pick one of the effects.';
            if (this.orn[x.i] !== '0') { taken++; continue; }
            ok.push([x.i, x.c, ki, B64[maskOf(fx, DECO_FX)]]);
        }
        if (!ok.length) return list.length > 1 ? 'Someone was faster! Those spots are taken: pick others.' : 'Someone was faster! Pick another spot.';
        const o = [...this.orn], k = [...this.kinds], f = [...this.fxs];
        for (const [i, c, ki, m] of ok) { o[i] = String(c); k[i] = String(ki); f[i] = m; }
        this.orn = o.join(''); this.kinds = k.join(''); this.fxs = f.join('');
        this.by.set(client, now);
        if (this.by.size > 2000) for (const [key, v] of this.by) if (now - v > 3600000) this.by.delete(key);
        this.lastSet = ok.map(([i]) => i); this.last = this.lastSet[this.lastSet.length - 1]; this.lastAt = now; this.lastBy = client; this.hung++;
        this.showUntil = now + this.s.show * 1000;
        if (!this.orn.includes('0') && this.s.restart) { this.partyUntil = now + PARTY_MS; this.showUntil = this.partyUntil; }
        return taken ? `${ok.length} hung; ${taken} ${taken > 1 ? 'spots were' : 'spot was'} taken by someone faster.` : '';
    }

    /** a visitor picks the tree's colour (one of TREE_COLS): shown dim behind the decorations, until the next party */
    colourTree(client, d, now) {
        if (!this.s.treePick || this.s.bg === 'off') return 'The tree\'s colour cannot change right now.';
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        if (!Number.isInteger(d.c) || d.c < 1 || d.c > TREE_COLS.length) return '';
        const left = Math.ceil(((this.treeBy.get(client) ?? -Infinity) + this.s.starEvery * 1000 - now) / 1000);
        if (left > 0) return `You can change the tree's colour again in ${left} s.`;
        this.treeCol = TREE_COLS[d.c - 1];
        this.treeBy.set(client, now);
        if (this.treeBy.size > 2000) for (const [k, v] of this.treeBy) if (now - v > 3600000) this.treeBy.delete(k);
        this.treeAt = now; this.treeLastBy = client;
        this.showUntil = Math.max(this.showUntil, now + this.s.show * 1000);
        return '';
    }

    /** a visitor picks the star's colour (one of the 8 decoration colours) and its effect */
    colourStar(client, d, now) {
        if (!this.star || !this.s.starPick) return 'The star cannot change right now.';
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        if (!Number.isInteger(d.c) || d.c < 1 || d.c > COLORS.length) return '';
        const sfx = d.f === undefined ? null : fxPick(d.f, this.s.starFxs, '', this.s.maxFx);
        if (d.f !== undefined && !sfx) return this.s.maxFx > 1 ? `Pick one of the star's effects (up to ${this.s.maxFx} together).` : 'Pick one of the star\'s effects.';
        const left = Math.ceil(((this.starBy.get(client) ?? -Infinity) + this.s.starEvery * 1000 - now) / 1000);
        if (left > 0) return `You can change the star again in ${left} s.`;
        this.starCol = COLORS[d.c - 1];
        if (sfx) this.starFx = sfx;
        this.starBy.set(client, now);
        if (this.starBy.size > 2000) for (const [k, v] of this.starBy) if (now - v > 3600000) this.starBy.delete(k);
        this.starAt = now; this.starLastBy = client;
        this.showUntil = Math.max(this.showUntil, now + this.s.show * 1000);
        return '';
    }

    step(now) {
        if (this.partyUntil && now > this.partyUntil) { this.partyUntil = 0; this.lastSet = []; this.orn = '0'.repeat(this.orn.length); this.kinds = '0'.repeat(this.orn.length); this.fxs = '0'.repeat(this.orn.length); this.starCol = ''; this.starFx = null; this.treeCol = ''; }
    }

    showing(now) { return this.ready && (this.s.always || now < this.showUntil || now < this.partyUntil); }

    frames(now) {
        if (!this.showing(now)) return [];
        const t = now / 1000, party = now < this.partyUntil, g = this.tree, map = this.lay.map, out = new Uint8Array(g.n * 3);
        const drawn = this.lay.drawn, zone = this.lay.zone;
        // the tree between the decorations: its colour (the settings', or a visitor's), dim; or off
        const bg = this.s.bg === 'off' ? [0, 0, 0] : hexRgb(this.treeCol || this.s.treeColor).map((v) => Math.round(v * (drawn ? 0.3 : 0.17)));
        const shine = Math.max(0, 1 - (now - Math.max(this.lastAt, this.starAt)) / 1200);
        const sBase = hexRgb(this.starCol || this.s.starColor), sList = (this.starFx ?? [this.s.starFx]).length ? (this.starFx ?? [this.s.starFx]) : ['twinkle'];
        // a pixel of a star (a star model, or the star drawn on a matrix), with the star's colour and effect
        const starPx = (i, n, ang, tw) => {
            if (party) return hsv(t * 0.6 + i / n);
            // several effects chosen: they take turns (FX_TURN seconds each), so each one is seen clearly
            const sf = sList[Math.floor(t / FX_TURN) % sList.length];
            let k = 1, col = sBase, white = 0;
            if (sf === 'twinkle') k = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4 + tw));
            if (sf === 'blink') k = Math.floor(t * 2) % 2 ? 1 : 0;
            if (sf === 'pulse') { const p = (t * 0.9) % 1; k = 0.04 + 0.96 * Math.max(Math.exp(-((p - 0.1) ** 2) / 0.003), 0.8 * Math.exp(-((p - 0.3) ** 2) / 0.003)); }
            if (sf === 'spin') { const a = ((ang - t * 0.6) % 1 + 1) % 1; k = 0.1 + 0.9 * Math.max(0, 1 - a * 3); white = Math.max(0, 1 - a * 8) * 0.6; }
            if (sf === 'sparkle') { const w = Math.max(0, Math.sin(t * (4 + rnd(i) * 5) + rnd(i + 3) * 6.3)) ** 12; k = 0.5 + 0.5 * w; white = w; }
            if (sf === 'rainbow') col = hsv(t * 0.4 + ang);
            return col.map((v) => { const x = v * k; return Math.min(255, x + (255 - x) * Math.max(shine, white)); });
        };
        for (let i = 0; i < g.n; i++) {
            const sp = map[i], z = drawn ? zone[i] : 1;
            let c = z === 1 ? bg : z === 2 ? [70, 32, 8] : [0, 0, 0];
            if (z === 3) c = starPx(i, g.n, this.lay.starAng[i], rnd(i) * 6.3);
            else if (party) c = z ? hsv(i / g.n * 3 - t * 0.5) : [0, 0, 0];
            else if (sp >= 0 && this.orn[sp] !== '0') {
                const kind = KINDS[+this.kinds[sp]]?.[0] ?? 'bauble';
                let at = shapeAt(kind, this.lay.du[i], this.lay.dv[i]);
                if (!at && kind !== 'bauble' && this.lay.counts[sp] < 12) {   // too few pixels for the shape: the whole spot, still telling them apart
                    const y = this.lay.dv[i];
                    at = kind === 'cane' ? (Math.floor(y * 3 + 10) % 2 ? [1, 0] : [0, 1]) : kind === 'present' ? (Math.abs(y) < 0.2 ? [0, 0] : [1, 0]) : kind === 'flake' || kind === 'star' ? [1, 0.35] : [1, 0];
                }
                if (at) {
                    if (this.lastSet.includes(sp) && now - this.lastAt < 4000 && Math.floor(t * 6) % 2) c = [255, 255, 255];
                    else {
                        const m = B64.indexOf(this.fxs[sp]), keys = DECO_FX.filter((_, b) => m > 0 && m & (1 << b)).map(([x]) => x);
                        if (!keys.length) keys.push('glow');
                        const f = keys[Math.floor(t / FX_TURN + rnd(sp + 11) * keys.length) % keys.length];   // several effects: they take turns
                        const [k, w] = decoLight(f, t, sp, i);
                        const own = f === 'rainbow' ? hsv(t * 0.5 + sp * 0.13) : hexRgb(COLORS[+this.orn[sp] - 1]);
                        const other = own.join() === '255,200,60' ? [255, 255, 255] : [255, 200, 60];   // a present's ribbon: gold (white on a gold box)
                        const base = at[0] ? own : kind === 'cane' ? [255, 255, 255] : other;
                        c = base.map((v) => { const x = (v + (255 - v) * at[1]) * k; return Math.min(255, x + (255 - x) * w); });
                    }
                }
            }
            out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
        }
        const list = [{ geom: g, bytes: out }];
        for (const star of this.stars ?? []) {
            const sg = star.geom, sb = new Uint8Array(sg.n * 3);
            for (let i = 0; i < sg.n; i++) { const c = starPx(i, sg.n, star.ang[i] ?? i / sg.n, star.twinkle[i]); sb[i * 3] = c[0]; sb[i * 3 + 1] = c[1]; sb[i * 3 + 2] = c[2]; }
            list.push({ geom: sg, bytes: sb });
        }
        return list;
    }

    message() {
        if (!this.lay) return 'The tree is not ready yet.';
        const n = this.orn.length, used = n - this.orn.split('').filter((c) => c === '0').length;
        return Date.now() < this.partyUntil ? '🎉 The tree is full! Party on the lights!' : `${used} of ${n} decorations hung.`;
    }

    status() {
        return { spots: this.lay?.spots ?? [], round: !!this.lay?.round, orn: this.orn, kinds: this.kinds, kindList: KINDS.filter(([k]) => this.s.kinds.includes(k)), allKinds: KINDS.map(([k]) => k), colors: COLORS, every: this.s.every, party: Date.now() < this.partyUntil,
            last: this.last, lastSet: this.lastSet, hung: this.hung, maxDeco: this.s.maxDeco, lastBy: this.lastBy, star: !!this.star, starPick: !!this.star && this.s.starPick, starCol: this.starCol || this.s.starColor,
            starAt: this.starAt, starLastBy: this.starLastBy, starEvery: this.s.starEvery,
            treeCol: this.treeCol || this.s.treeColor, treePick: this.s.treePick && this.s.bg !== 'off', treeCols: TREE_COLS, treeAt: this.treeAt, treeLastBy: this.treeLastBy,
            fxs: this.fxs, fxList: DECO_FX.filter(([k]) => this.s.fx.includes(k)), allFx: DECO_FX.map(([k]) => k),
            starFx: (this.starFx ?? [this.s.starFx]).slice(-this.s.maxFx), maxFx: this.s.maxFx, starFxList: STAR_FX.filter(([k]) => this.s.starFxs.includes(k)), players: [] };
    }
}
