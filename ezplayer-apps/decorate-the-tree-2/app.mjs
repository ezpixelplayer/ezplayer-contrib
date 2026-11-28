// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Decorate the tree 2.0: visitors hang decorations ANYWHERE on a tree of the show. On the phone they pick a decoration,
 * its colour, effects and size, then drag it onto a drawing of the tree; while the finger moves, a blinking "ghost" of
 * it shows at that place on the real tree, so they see where it will hang. Up to maxDeco are placed, then one button
 * hangs them all. The phone's point (u across, v down its drawing) is mapped to the nearest pixel of the real tree
 * (every pixel's place on the phone is worked out once), and the decoration is painted over the real pixels around it
 * by their real 3D distance, so on a 360° mega tree it is round and not mirrored. A star on top, if there is one,
 * twinkles; when the tree is full (maxOn decorations, or no room left): a party, then it starts again.
 * Every colour goes through colour.mjs (gamma, dimming in linear light, R/G/B balance) before it reaches the LEDs.
 */

import { THEME } from './theme.mjs';
import { SPRITES, spriteAt } from './sprites.mjs';
import { num } from './multi-helpers.mjs';
import { Colour, hexRgb, scale, mixWhite } from './colour.mjs';

export const COLORS = ['ff2a2a', 'ffc83c', '2a7bff', 'ffffff', 'ff5fc8', 'a05bff', 'ff8c1a', '3cf0ff'];
// the colours the tree itself can be (v12): green, red, blue, white, gold, pink, purple, ice blue (shown dim behind the decorations)
export const TREE_COLS = ['1e9e3c', 'd21e1e', '2a6bff', 'ffffff', 'ffc83c', 'ff5fc8', 'a05bff', '3cf0ff'];
/** the decorations: key, name, emoji (the phone draws each one in its colour) */
export const KINDS = THEME.kinds ?? [['bauble', 'Bauble', '🔴'], ['cane', 'Candy cane', '🍭'], ['star', 'Star', '⭐'], ['bell', 'Bell', '🔔'], ['present', 'Present', '🎁'], ['flake', 'Snowflake', '❄️'], ['heart', 'Heart', '❤️']];

/** how a decoration shines, and the star's effects: key, name, emoji (nothing flashes faster than about 3 times a second) */
export const DECO_FX = [['glow', 'Glow', '✨'], ['steady', 'Steady', '💡'], ['blink', 'Blink', '💫'], ['twinkle', 'Twinkle', '🌟'], ['pulse', 'Pulse', '💓'], ['rainbow', 'Rainbow', '🌈']];
export const STAR_FX = [['twinkle', 'Twinkle', '🌟'], ['steady', 'Steady', '💡'], ['blink', 'Blink', '💫'], ['pulse', 'Pulse', '💓'], ['spin', 'Spin', '🌀'], ['sparkle', 'Sparkle', '✨'], ['rainbow', 'Rainbow', '🌈']];
export const MAX_FX = 6;   // the most effects a visitor can ever put together (the settings choose how many: 3 by default)

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
    if (THEME.kinds && SPRITES[kind]) {   // a theme pack: the decoration is one of the pictures of sprites.mjs (y goes up here)
        const c = spriteAt(kind, x * 0.95, -y * 0.95, [1, 2, 3]);
        if (!c) return null;
        return c[0] === 1 && c[1] === 2 ? [1, 0] : c.join() === '255,255,255' ? [1, 1] : [1, 0, c];
    }
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

/** where the front of a round tree is: the angle round the trunk (radians, as atan2(z, x)) that faces the visitors, and
 *  which way is their right. deg turns the front to the visitors' right (15° steps, set on the settings page while a
 *  white stripe shows it on the tree); mirror is for a layout whose left and right are the other way round. */
export const frontOf = (deg = 0, mirror = false) => ({ a: Math.PI / 2 + (mirror ? 1 : -1) * deg * Math.PI / 180, m: mirror ? -1 : 1 });
/** an angle round the tree as the visitors see it, in turns: 0 the front, + to their right, -0.5..0.5 */
export const relOf = (a, f) => ((((f.a - a) / (2 * Math.PI)) % 1 + 1.5) % 1 - 0.5) * f.m;


/** the sizes a visitor can pick for a decoration: key, name, times the base size (the "size" setting) */
export const SIZES = [['s', 'Small', 0.7], ['m', 'Medium', 1], ['l', 'Large', 1.5]];
/** the colour test (settings page): bands from the top. The first three are sent as they are (no gamma, no balance), to
 *  check the colour order of the model; then the 8 decoration colours, white, a 50 % grey and the tree's dim colour */
export const TEST_RAW = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
export const TEST_BANDS = TEST_RAW.length + COLORS.length + 3;

const DEFAULTS = { target: '', shape: 'tree', star: '', kinds: KINDS.map(([k]) => k), fx: DECO_FX.map(([k]) => k), starFx: 'twinkle', starFxs: STAR_FX.map(([k]) => k), starPick: true, maxFx: 3, maxDeco: 5,
    starColor: 'ffbe28', starEvery: 30, treeColor: THEME.treeColor ?? '1e9e3c', treePick: true, fps: 20, brightness: 100, maxOn: 30, spacing: 100, ghosts: 3, every: 60, show: 30, always: false,
    bg: 'green', restart: true, size: 100, sizePick: true, sizes: SIZES.map(([k]) => k), view: 'front', frontDeg: 0, mirror: false, lookGuide: false,
    gamma: 2.2, balR: 100, balG: 100, balB: 100, dim: 6 };
const PARTY_MS = 15000;
const MAX_CANDIDATES = 3000;
export const GHOST_MS = 1500;   // a ghost goes 1.5 s after the last preview
const TOL = 8;                  // a point farther than this from the tree on the phone's drawing (viewBox units) is not on it

export function cleanSettings(raw) {
    const s = { ...DEFAULTS, kinds: [...DEFAULTS.kinds], fx: [...DEFAULTS.fx], starFxs: [...DEFAULTS.starFxs], sizes: [...DEFAULTS.sizes] };
    if (!raw || typeof raw !== 'object') return s;
    for (const [key, list] of [['kinds', KINDS], ['fx', DECO_FX], ['starFxs', STAR_FX], ['sizes', SIZES]])
        if (Array.isArray(raw[key])) { const k = list.map(([x]) => x).filter((x) => raw[key].includes(x)); if (k.length) s[key] = k; }
    if (STAR_FX.some(([k]) => k === raw.starFx)) s.starFx = raw.starFx;
    for (const k of ['target', 'star']) if (typeof raw[k] === 'string') s[k] = raw[k].trim().slice(0, 200);
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['maxFx', 1, MAX_FX], ['maxDeco', 1, 10], ['starEvery', 0, 600], ['maxOn', 8, 80], ['spacing', 50, 150], ['ghosts', 1, 10],
        ['every', 0, 600], ['show', 10, 300], ['size', 50, 200], ['gamma', 1, 3], ['balR', 0, 100], ['balG', 0, 100], ['balB', 0, 100], ['dim', 0, 40]]) s[k] = num(raw[k], lo, hi, s[k]);
    for (const k of ['always', 'restart', 'starPick', 'treePick', 'sizePick']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (typeof raw.treeColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(raw.treeColor)) s.treeColor = raw.treeColor.replace('#', '').toLowerCase();
    if (typeof raw.starColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(raw.starColor)) s.starColor = raw.starColor.replace('#', '').toLowerCase();
    if (raw.bg === 'green' || raw.bg === 'off') s.bg = raw.bg;
    if (raw.shape === 'tree' || raw.shape === 'fill') s.shape = raw.shape;
    if (raw.view === 'front' || raw.view === 'all') s.view = raw.view;
    if (Number.isFinite(raw.frontDeg)) s.frontDeg = ((Math.round(raw.frontDeg / 15) * 15) % 360 + 360) % 360;
    for (const k of ['mirror', 'lookGuide']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    return s;
}

function hsv(h, s = 1, v = 1) {
    h = ((h % 1) + 1) % 1 * 6;
    const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map((x) => Math.floor(x * 255));
}

/** the phone draws the tree as a triangle in a 100 x 120 box: at v (0 top .. 1 bottom) it is this wide; 96 high */
export const phoneWidth = (v) => 12 + 76 * v;
const wrapT = (x) => ((x % 1) + 1.5) % 1 - 0.5;   // turns, -0.5..0.5

/**
 * pts: [x, y (up), z] for every pixel. Works out, once for a layout, where every pixel is on the phone's drawing:
 * pu across (round trees: where it is round the trunk as the visitors see it, in turns from the front, -0.5..0.5, + to
 * their right; a tree drawn on a matrix: across the triangle; other flat models: x, 0..1), pv down from the top, 0..1.
 * Which pixels may be the middle of a decoration (okC: not the top of a round tree, where a decoration would be a ring
 * round the whole tree; only the front half in the 180° view; only the triangle of a drawn tree) and which may be
 * painted (paint). The radius of a decoration at size 100 %: as if maxOn of them were spread evenly over the tree
 * (farthest-point by the real distances, so the strands of a mega tree count as far apart as they are).
 * orient (round trees): { deg, mirror } where the front is, half: only the front half (the phones show it).
 */
export function layout(pts, maxOn = 30, size = 100, shape = 'tree', orient = {}) {
    pts = faceFront(pts);
    const N = pts.length;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const H = (y1 - y0) || 1, W = (x1 - x0) || 1, vOf = (y) => (y1 - y) / H;
    const round = z1 - z0 > 0.25 * W, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const F = frontOf(orient.deg, orient.mirror), half = round && !!orient.half;
    const angOf = ([x, , z]) => Math.atan2(z - cz, x - cx), relP = (p) => relOf(angOf(p), F);
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
        if (round) return relP([x, y, z]);   // the front in the middle of the phone, the visitors' right to the right
        if (!drawn) return (x - x0) / W;
        const hw = hwAt(y1 - y); return Math.max(0, Math.min(1, 0.5 + (x - cx) / (2 * Math.max(hw, 1e-9))));   // across the triangle, as the phone draws it
    };
    const vPhone = (y) => (drawn ? Math.max(0, Math.min(1, ((y1 - y) - yTop) / (yBase - yTop))) : vOf(y));
    const top = round ? 0.2 : 0.05;
    const pu = new Float32Array(N), pv = new Float32Array(N), vAll = new Float32Array(N), okC = new Uint8Array(N), paint = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        const p = pts[i], v = vOf(p[1]);
        pu[i] = uOf(p); pv[i] = vPhone(p[1]); vAll[i] = v;
        if (drawn) {
            const Y = y1 - p[1], X = p[0] - cx;
            paint[i] = zone[i] === 1 ? 1 : 0;
            okC[i] = zone[i] === 1 && Y > yTop + 0.06 * (yBase - yTop) && Y < yBase - 0.02 * H && Math.abs(X) < hwAt(Y) * 0.9 ? 1 : 0;
        } else {
            paint[i] = !round || v >= top - 0.05 ? 1 : 0;
            okC[i] = v >= top && v <= 0.96 && (!half || Math.abs(pu[i]) <= 0.27) ? 1 : 0;
        }
    }
    let cand = [];
    for (let i = 0; i < N; i++) if (okC[i]) cand.push(i);
    if (!cand.length) { cand = [...Array(N).keys()]; okC.fill(1); paint.fill(1); }
    const step = Math.max(1, Math.floor(cand.length / MAX_CANDIDATES));
    cand = cand.filter((_, k) => k % step === 0);
    let n = maxOn;
    if (drawn) {   // a small matrix: no more decorations than fit with about 12 pixels each
        let treePx = 0; for (let i = 0; i < N; i++) if (zone[i] === 1) treePx++;
        n = Math.max(3, Math.min(n, Math.floor(treePx / 12)));
    }
    const d2 = (a, b) => (pts[a][0] - pts[b][0]) ** 2 + (pts[a][1] - pts[b][1]) ** 2 + (pts[a][2] - pts[b][2]) ** 2;
    // the size: farthest-point spreading of n spots over the candidates, the smallest gap between two of them
    const spots = [cand[0]];
    const dist = cand.map((i) => d2(i, cand[0]));
    while (spots.length < Math.min(n, cand.length)) {
        let j = 0;
        for (let k = 1; k < dist.length; k++) if (dist[k] > dist[j]) j = k;
        if (dist[j] <= 0) break;
        spots.push(cand[j]);
        for (let k = 0; k < dist.length; k++) dist[k] = Math.min(dist[k], d2(cand[k], cand[j]));
    }
    let gap = Infinity;
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) gap = Math.min(gap, Math.sqrt(d2(spots[a], spots[b])));
    const r = (isFinite(gap) && gap > 0 ? gap : H / 10) * 0.42 * size / 100;
    const starAng = Float32Array.from(starDu, (x, i) => ((Math.atan2(starDv[i], x) / (2 * Math.PI)) % 1 + 1) % 1);
    return { N, H, pts, pu, pv, vAll, okC, paint, cand, r, round, drawn, zone, starAng, half, F, cx, cz, n,
        ang: round ? Float32Array.from(pts, angOf) : null };   // each pixel's angle round the trunk: for the stripes that show the front
}

/** the squared distance on the phone's drawing (viewBox units) between pixel i and the point (u, v) */
export function phoneD2(lay, i, u, v) {
    const dv = (lay.pv[i] - v) * 96, du = lay.round ? 2 * wrapT(lay.pu[i] - u) : lay.pu[i] - u;
    return (du * phoneWidth((lay.pv[i] + v) / 2)) ** 2 + dv * dv;
}

/** the pixel where a point of the phone's drawing goes: the nearest pixel that may be a decoration's middle, or -1 when
 *  the point is not on the tree (farther than TOL from every such pixel) */
export function placeAt(lay, u, v) {
    if (!Number.isFinite(u) || !Number.isFinite(v) || v < -0.1 || v > 1.1) return -1;
    let best = -1, bd = TOL * TOL;
    for (let i = 0; i < lay.N; i++) { if (!lay.okC[i]) continue; const d = phoneD2(lay, i, u, v); if (d <= bd) { bd = d; best = i; } }
    return best;
}

/** the real 3D distance between two pixels */
export const dist3 = (lay, a, b) => Math.hypot(lay.pts[a][0] - lay.pts[b][0], lay.pts[a][1] - lay.pts[b][1], lay.pts[a][2] - lay.pts[b][2]);

/** the pixels a decoration of radius rr centred on pixel c covers, and where each is in it, in radii: du across (round
 *  trees: along the surface round the trunk, + to the visitors' right, so shapes are not mirrored), dv up */
export function paintOf(lay, c, rr) {
    const px = [], du = [], dv = [], d = [];
    const [sx, sy, sz] = lay.pts[c], a = Math.atan2(sz - lay.cz, sx - lay.cx), sa = Math.sin(a), ca = Math.cos(a), r2 = rr * rr;
    for (let i = 0; i < lay.N; i++) {
        if (!lay.paint[i]) continue;
        const [x, y, z] = lay.pts[i], q = (x - sx) ** 2 + (y - sy) ** 2 + (z - sz) ** 2;
        if (q > r2) continue;
        px.push(i); d.push(q); dv.push((y - sy) / rr);
        du.push(lay.round ? lay.F.m * ((x - sx) * sa - (z - sz) * ca) / rr : (x - sx) / rr);
    }
    return { px, du, dv, d };
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

const NOT_ON = 'Not on the tree', TOO_CLOSE = 'Too close to another decoration', TOO_BIG = 'Too big for this place: try Small or another spot', FULL = 'The tree is full';
const keysOf = (m) => DECO_FX.filter((_, b) => m & (1 << b)).map(([x]) => x);
const r3 = (v) => Math.round(v * 1000) / 1000;

export class App {
    static startTypes = ['hang', 'star', 'preview'];
    live = 'calib';   // the settings page writes it while the front is set or the colour test shows (read twice a second, see multi.mjs)

    constructor(s) {
        this.s = s; this.ready = false; this.tree = null; this.star = null; this.lay = null; this.key = '';
        this.decos = [];   // the decorations hung: { u, v (on the phone's drawing), k (kind index), c (colour 1..8), f (effects, bits), s (size 0..2) }
        this.placed = [];  // for each: { c: its middle pixel (-1: not on this layout), rr: its radius }
        this.owner = null; this.odu = null; this.odv = null; this.cnt = []; this.full = false;
        this.ghosts = new Map(); this.busyAt = new Map();   // visitors placing a decoration: client -> ghost
        this.by = new Map(); this.lastSet = []; this.lastOk = []; this.hung = 0; this.lastAt = 0; this.lastBy = null; this.showUntil = 0; this.partyUntil = 0;
        this.problems = [];
        this.calib = null; this.calibN = null; this.test = null; this.looks = new Map();   // the front being set (a white stripe), the colour test; visitors turning the tree
        this.starCol = ''; this.starFx = null; this.starBy = new Map(); this.starAt = 0; this.starLastBy = null;   // the star's colour, picked by a visitor ('' = the settings')
        this.treeCol = ''; this.treeBy = new Map(); this.treeAt = 0; this.treeLastBy = null;                      // the tree's colour, the same
        this.usesBy = {};   // what visitors did, for the statistics (multi.mjs sends it): decorations hung, star and tree colours (previews are not counted)
        this.colKey = ''; this.col = null;
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
        const key = [s.target, tree.geom.n, s.maxOn, s.size, s.shape, s.view, s.frontDeg, s.mirror].join('|');
        if (key !== this.key) {
            // a new layout: the decorations keep their place on the phone's drawing (u, v) and are put on the tree again
            this.lay = layout(tree.pts, s.maxOn, s.size, s.shape, { deg: s.frontDeg, mirror: s.mirror, half: s.view === 'front' });
            this.key = key; this.ghosts.clear();
        }
        this.tree = tree.geom; this.stars = stars; this.star = stars.length > 0 || this.lay.drawn;   // a matrix has its own star
        this.remap();
        this.ready = true;
    }

    /** the radius of a decoration of size si (0..2) */
    radius(si) { return this.lay.r * (SIZES[si]?.[2] ?? 1); }
    /** may a decoration of radius rr have its middle at pixel c? Not closer to another one than the sum of their radii times the spacing */
    fits(c, rr, extra = []) {
        const k = this.s.spacing / 100;
        for (const p of [...this.placed, ...extra]) if (p.c >= 0 && dist3(this.lay, c, p.c) < (rr + p.rr) * k) return false;
        return true;
    }
    /** puts the decorations on the pixels of the tree: each pixel belongs to the decoration it is nearest to (in its radii) */
    remap() {
        const lay = this.lay;
        if (!lay) return;
        this.placed = this.decos.map((d) => { const c = placeAt(lay, d.u, d.v), rr = this.radius(d.s); return { c, rr, paint: c >= 0 ? paintOf(lay, c, rr) : null }; });
        this.owner = new Int16Array(lay.N).fill(-1); this.odu = new Float32Array(lay.N); this.odv = new Float32Array(lay.N);
        const best = new Float32Array(lay.N).fill(Infinity);
        this.placed.forEach((p, j) => {
            if (!p.paint) return;
            const { px, du, dv, d } = p.paint, r2 = p.rr * p.rr;
            for (let k = 0; k < px.length; k++) { const q = d[k] / r2, i = px[k]; if (q < best[i]) { best[i] = q; this.owner[i] = j; this.odu[i] = du[k]; this.odv[i] = dv[k]; } }
        });
        this.cnt = this.placed.map(() => 0);
        for (let i = 0; i < lay.N; i++) if (this.owner[i] >= 0) this.cnt[this.owner[i]]++;
        // full: as many as the settings allow, or no room left anywhere for a medium one
        this.full = this.decos.length >= this.s.maxOn || !lay.cand.some((c) => this.fits(c, this.radius(1)));
    }

    /** the tree's state survives a restart of the app or the player; the decorations by their place on the phone's drawing */
    saveState() { return { v: 2, decos: this.decos.map(({ u, v, k, c, f, s }) => ({ u, v, k, c, f, s })), star: this.starCol, starFx: this.starFx, tree: this.treeCol }; }
    restore(st) {
        if (!st || typeof st !== 'object') return;
        if (Array.isArray(st.decos)) {
            const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
            this.decos = st.decos.filter((d) => d && Number.isFinite(d.u) && Number.isFinite(d.v) && int(d.k, 0, KINDS.length - 1) && int(d.c, 1, COLORS.length) && int(d.f ?? 0, 0, (1 << DECO_FX.length) - 1))
                .slice(0, 80).map((d) => ({ u: r3(d.u), v: r3(d.v), k: d.k, c: d.c, f: d.f ?? 0, s: int(d.s, 0, SIZES.length - 1) ? d.s : 1 }));   // older entries without a size: Medium
        }
        if (typeof st.star === 'string' && /^([0-9a-f]{6})?$/.test(st.star)) this.starCol = st.star;
        if (typeof st.tree === 'string' && /^([0-9a-f]{6})?$/.test(st.tree)) this.treeCol = st.tree;
        const sf = typeof st.starFx === 'string' ? [st.starFx] : st.starFx;
        if (Array.isArray(sf) && sf.length && sf.length <= MAX_FX && sf.every((k) => STAR_FX.some(([x]) => x === k))) this.starFx = sf;
        this.remap();
    }

    /** the settings page, live: { deg, mirror, secs } the front being set (a white stripe), { test, gamma, balR, balG, balB, dim }
     *  the colour test with the values being tried (used for the test only, until they are saved); n changes at each press */
    onLive(o, now) {
        const n = o && typeof o === 'object' ? o.n : 'none';   // 'none': no such document yet
        if (n === this.calibN) return;
        const first = this.calibN === null;
        this.calibN = n;
        if (first || n === 'none') return;   // left from before the app started: not shown again
        const secs = Math.max(0, Math.min(300, +o.secs || 0)), deg = ((Math.round((+o.deg || 0) / 15) * 15) % 360 + 360) % 360;
        this.calib = secs ? { f: frontOf(deg, !!o.mirror), until: now + secs * 1000 } : null;
        const ts = Math.max(0, Math.min(300, +o.test || 0)), s = this.s;
        this.test = ts ? { until: now + ts * 1000, col: new Colour(num(o.gamma, 1, 3, s.gamma), [num(o.balR, 0, 100, s.balR), num(o.balG, 0, 100, s.balG), num(o.balB, 0, 100, s.balB)]), dim: num(o.dim, 0, 40, s.dim) } : null;
    }

    /** a visitor turning the tree on the phone (360°): a thin stripe shows for a moment where the middle of their drawing is */
    look(client, d, now) {
        if (!this.s.lookGuide || this.s.view !== 'all' || !this.lay?.round || typeof d.a !== 'number' || !Number.isFinite(d.a)) return '';
        const prev = this.looks.get(client);
        if (prev && now - prev.at < 800) return '';
        this.looks.set(client, { a: ((d.a % 1) + 1) % 1, at: now, until: now + 2500 });
        if (this.looks.size > 50) for (const [k, v] of this.looks) if (now > v.until) this.looks.delete(k);
        return '';
    }

    /** one decoration as a phone sends it: [u, v, kind, colour 1..8, effects, size 0..2] or { u, v, k, c, f, s } -> its parts, or a note */
    parse(x) {
        if (Array.isArray(x)) x = { u: x[0], v: x[1], k: x[2], c: x[3], f: x[4], s: x[5] };
        if (!x || typeof x !== 'object' || !Number.isFinite(x.u) || !Number.isFinite(x.v) || !Number.isInteger(x.c) || x.c < 1 || x.c > COLORS.length) return '';
        const kind = x.k === undefined ? this.s.kinds[0] : x.k, ki = KINDS.findIndex(([k]) => k === kind);
        if (ki < 0 || !this.s.kinds.includes(kind)) return 'Pick one of the decorations.';
        const fx = fxPick(x.f, this.s.fx, this.s.fx[0], this.s.maxFx);
        if (!fx) return this.s.maxFx > 1 ? `Pick one of the effects (up to ${this.s.maxFx} together).` : 'Pick one of the effects.';
        let si = 1;
        if (this.s.sizePick) {
            const ok = SIZES.map(([k], i) => (this.s.sizes.includes(k) ? i : -1)).filter((i) => i >= 0);
            si = x.s === undefined ? (ok.includes(1) ? 1 : ok[0]) : x.s;
            if (!ok.includes(si)) return 'Pick one of the sizes.';
        }
        return { u: r3(x.u), v: r3(x.v), k: ki, c: x.c, f: maskOf(fx, DECO_FX), s: si };
    }

    /** why a decoration cannot go at pixel c with radius rr ('' = it can) */
    whyNot(c, rr, si, extra) { return c < 0 ? NOT_ON : this.fits(c, rr, extra) ? '' : si === 2 ? TOO_BIG : TOO_CLOSE; }

    /** a visitor dragging a decoration over the tree: a blinking ghost shows where it would go, for 1.5 s after the last one */
    preview(client, d, now) {
        if (!this.lay || now < this.partyUntil) return '';
        const x = this.parse(d);
        if (typeof x === 'string') return '';
        this.expire(now);
        if (!this.ghosts.has(client) && this.ghosts.size >= this.s.ghosts) {   // too many ghosts at once: they could not be told apart
            if (now - (this.busyAt.get(client) ?? 0) < 4000) return '';
            this.busyAt.set(client, now);
            if (this.busyAt.size > 500) for (const [k, v] of this.busyAt) if (now - v > 60000) this.busyAt.delete(k);
            return 'Someone else is placing: wait a moment (you can still place yours here).';
        }
        const c = placeAt(this.lay, x.u, x.v), rr = this.radius(x.s), old = this.ghosts.get(client);
        const paint = c < 0 ? null : old && old.ci === c && old.rr === rr ? old.paint : paintOf(this.lay, c, rr);
        const why = this.whyNot(c, rr, x.s);
        this.ghosts.set(client, { ...x, at: now, ci: c, rr, paint, ok: !why, why });   // ci: its middle pixel (c is its colour)
        this.showUntil = Math.max(this.showUntil, now + 3000);
        return '';
    }
    expire(now) { for (const [k, g] of this.ghosts) if (now - g.at > GHOST_MS) this.ghosts.delete(k); }

    handle(client, d, now) {
        if (d.type === 'look') return this.look(client, d, now);
        if (d.type === 'star') return this.colourStar(client, d, now);
        if (d.type === 'tree') return this.colourTree(client, d, now);
        if (d.type === 'preview') return this.preview(client, d, now);
        if (d.type !== 'hang') return '';
        if (!this.lay) return 'The tree is not ready yet.';
        if (now < this.partyUntil) return 'The tree is full: party time! Wait a moment.';
        // the decorations a visitor placed ({d: [[u, v, k, c, f, s], ...]}, up to maxDeco), hung together
        const list = Array.isArray(d.d) ? d.d : [d];
        if (!list.length) return '';
        if (list.length > this.s.maxDeco) return this.s.maxDeco > 1 ? `You can hang up to ${this.s.maxDeco} decorations at once.` : 'You can hang one decoration at a time.';
        const left = Math.ceil(((this.by.get(client) ?? -Infinity) + this.s.every * 1000 - now) / 1000);
        if (left > 0) return `You can hang more decorations in ${left} s.`;
        const parsed = list.map((x) => this.parse(x));
        const badOne = parsed.find((x) => typeof x === 'string');
        if (badOne !== undefined) return badOne;
        const ok = [], bad = [], acc = [], add = [];
        parsed.forEach((x, idx) => {
            if (this.decos.length + add.length >= this.s.maxOn || (this.full && !add.length)) { bad.push(FULL); return; }
            const c = placeAt(this.lay, x.u, x.v), rr = this.radius(x.s), why = this.whyNot(c, rr, x.s, acc);
            if (why) { bad.push(why); return; }
            acc.push({ c, rr }); ok.push(idx); add.push(x);
        });
        const reasons = [...new Set(bad)].join('; ');
        if (!ok.length) return list.length > 1 ? `None could be hung: ${reasons}.` : bad[0] === TOO_BIG ? TOO_BIG + '.' : `${bad[0]}: drop it somewhere else.`;
        const first = this.decos.length;
        this.decos.push(...add);
        this.remap();
        this.ghosts.delete(client);
        this.by.set(client, now);
        if (this.by.size > 2000) for (const [key, v] of this.by) if (now - v > 3600000) this.by.delete(key);
        this.lastSet = add.map((_, k) => first + k); this.lastOk = ok; this.lastAt = now; this.lastBy = client; this.hung++;
        this.usesBy['decoration'] = (this.usesBy['decoration'] ?? 0) + ok.length;
        this.showUntil = now + this.s.show * 1000;
        if (this.full && this.s.restart) { this.partyUntil = now + PARTY_MS; this.showUntil = this.partyUntil; }
        return bad.length ? `${ok.length} hung; ${bad.length} not: ${reasons}.` : '';
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
        this.usesBy['tree'] = (this.usesBy['tree'] ?? 0) + 1;
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
        this.usesBy['star'] = (this.usesBy['star'] ?? 0) + 1;
        this.showUntil = Math.max(this.showUntil, now + this.s.show * 1000);
        return '';
    }

    step(now) {
        if (this.partyUntil && now > this.partyUntil) {
            this.partyUntil = 0; this.lastSet = []; this.lastOk = []; this.decos = []; this.starCol = ''; this.starFx = null; this.treeCol = '';
            this.remap();
        }
        this.expire(now);
        if (this.test && now > this.test.until) this.test = null;
    }

    showing(now) {
        return this.ready && (this.s.always || now < this.showUntil || now < this.partyUntil || (this.calib && now < this.calib.until) || !!this.test
            || this.ghosts.size > 0 || [...this.looks.values()].some((l) => now < l.until));
    }

    /** the colours of the settings (gamma, balance), made again only when they change */
    colour() {
        const s = this.s, k = [s.gamma, s.balR, s.balG, s.balB].join('|');
        if (k !== this.colKey) { this.colKey = k; this.col = new Colour(s.gamma, [s.balR, s.balG, s.balB]); }
        return this.col;
    }

    /**
     * the light (linear) of a decoration's pixel, or null when the pixel is outside its shape. idx: the decoration's number
     * (its effects' timing), small: it covers few pixels (then it is one solid patch of its colour: no white, no ribbon,
     * which wash a colour out on a coarse tree), ghost: a visitor still placing it (steady)
     */
    decoL(d, idx, i, du, dv, small, t, col, flash, ghost) {
        const kind = KINDS[d.k]?.[0] ?? 'bauble';
        const keys = keysOf(d.f);
        if (!keys.length) keys.push('glow');
        const f = keys[Math.floor(t / FX_TURN + rnd(idx + 11) * keys.length) % keys.length];   // several effects: they take turns
        const [k, w] = ghost ? [1, 0] : decoLight(f, t, idx, i);
        const own = f === 'rainbow' && !ghost ? hsv(t * 0.5 + idx * 0.13) : hexRgb(COLORS[d.c - 1]);
        if (small) return flash ? (Math.floor(t * 6) % 2 ? col.lin(own) : [0, 0, 0]) : scale(col.lin(own), k);
        const at = shapeAt(kind, du, dv);
        if (!at) return null;
        if (flash && Math.floor(t * 6) % 2) return [1, 1, 1];
        const other = own.join() === '255,200,60' ? [255, 255, 255] : [255, 200, 60];   // a present's ribbon: gold (white on a gold box)
        const base = at[2] ? at[2] : at[0] ? own : kind === 'cane' ? [255, 255, 255] : other;
        return mixWhite(scale(mixWhite(col.lin(base), at[1]), k), w);
    }

    frames(now) {
        if (!this.showing(now)) return [];
        const t = now / 1000, party = now < this.partyUntil, g = this.tree, lay = this.lay, out = new Uint8Array(g.n * 3);
        const put = (o, i, c) => { o[i * 3] = c[0]; o[i * 3 + 1] = c[1]; o[i * 3 + 2] = c[2]; };
        const test = this.test, col = test ? test.col : this.colour(), dim = (test ? test.dim : this.s.dim) / 100;
        const treeL = col.hex(this.treeCol || this.s.treeColor);
        if (test) {   // the colour test: bands from the top; the star cycles red, green, blue (2 s each) as they are
            const bands = [...TEST_RAW, ...COLORS.map((h) => col.led(col.hex(h))), col.led([1, 1, 1]), col.led(col.lin([128, 128, 128])), col.led(scale(treeL, dim))];
            for (let i = 0; i < g.n; i++) put(out, i, bands[Math.min(TEST_BANDS - 1, Math.floor(lay.vAll[i] * TEST_BANDS))]);
            const raw = TEST_RAW[Math.floor(t / 2) % 3], list = [{ geom: g, bytes: out }];
            for (const star of this.stars ?? []) { const sb = new Uint8Array(star.geom.n * 3); for (let i = 0; i < star.geom.n; i++) put(sb, i, raw); list.push({ geom: star.geom, bytes: sb }); }
            return list;
        }
        const drawn = lay.drawn, zone = lay.zone;
        // stripes on a round tree, top to bottom: the front being set (white, the rest dim), or where visitors are looking
        // (gold); as wide as the nearest strand, so a tree with few strands still shows one
        const ang = lay.ang, calibOn = !!(ang && this.calib && now < this.calib.until);
        const stripes = !ang ? [] : calibOn ? [{ f: this.calib.f, a: 0 }]
            : [...this.looks.values()].filter((l) => now < l.until).map((l) => ({ f: frontOf(this.s.frontDeg, this.s.mirror), a: l.a }));
        const off = (i, st) => { const r = ((relOf(ang[i], st.f) - st.a) % 1 + 1.5) % 1 - 0.5; return Math.abs(r); };
        const near = stripes.map((st) => { let m = 1; for (let i = 0; i < g.n; i++) m = Math.min(m, off(i, st)); return m + 0.012; });
        const goldL = col.lin([255, 210, 40]), black = [0, 0, 0], white = [1, 1, 1];
        // the tree between the decorations: its colour (the settings', or a visitor's) at the dim level, in light; or off
        const bgL = this.s.bg === 'off' ? black : scale(treeL, dim), trunkL = col.lin([70, 32, 8]);
        const shine = Math.max(0, 1 - (now - Math.max(this.lastAt, this.starAt)) / 1200);
        const sBase = hexRgb(this.starCol || this.s.starColor), sList = (this.starFx ?? [this.s.starFx]).length ? (this.starFx ?? [this.s.starFx]) : ['twinkle'];
        // a pixel of a star (a star model, or the star drawn on a matrix), with the star's colour and effect, in light
        const starL = (i, n, a, tw) => {
            if (party) return col.lin(hsv(t * 0.6 + i / n));
            const sf = sList[Math.floor(t / FX_TURN) % sList.length];   // several effects: they take turns
            let k = 1, c = sBase, wh = 0;
            if (sf === 'twinkle') k = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 4 + tw));
            if (sf === 'blink') k = Math.floor(t * 2) % 2 ? 1 : 0;
            if (sf === 'pulse') { const p = (t * 0.9) % 1; k = 0.04 + 0.96 * Math.max(Math.exp(-((p - 0.1) ** 2) / 0.003), 0.8 * Math.exp(-((p - 0.3) ** 2) / 0.003)); }
            if (sf === 'spin') { const q = ((a - t * 0.6) % 1 + 1) % 1; k = 0.1 + 0.9 * Math.max(0, 1 - q * 3); wh = Math.max(0, 1 - q * 8) * 0.6; }
            if (sf === 'sparkle') { const w = Math.max(0, Math.sin(t * (4 + rnd(i) * 5) + rnd(i + 3) * 6.3)) ** 12; k = 0.5 + 0.5 * w; wh = w; }
            if (sf === 'rainbow') c = hsv(t * 0.4 + a);
            return mixWhite(scale(col.lin(c), k), Math.max(shine, wh));
        };
        // the ghosts (visitors placing a decoration): blinking, on top of the decorations
        let gOwn = null, gDu = null, gDv = null;
        const ghosts = [...this.ghosts.values()].filter((x) => x.paint);
        if (ghosts.length && !party && Math.floor(t * 3) % 2 === 0) {
            gOwn = new Int16Array(g.n).fill(-1); gDu = new Float32Array(g.n); gDv = new Float32Array(g.n);
            ghosts.forEach((x, gi) => { const p = x.paint; for (let k = 0; k < p.px.length; k++) { gOwn[p.px[k]] = gi; gDu[p.px[k]] = p.du[k]; gDv[p.px[k]] = p.dv[k]; } });
        }
        const flashOn = now - this.lastAt < 4000;
        for (let i = 0; i < g.n; i++) {
            const z = drawn ? zone[i] : 1;
            let L = z === 1 ? bgL : z === 2 ? trunkL : black;
            if (z === 3) L = starL(i, g.n, lay.starAng[i], rnd(i) * 6.3);
            else if (party) L = z ? col.lin(hsv(i / g.n * 3 - t * 0.5)) : black;
            else {
                const j = this.owner ? this.owner[i] : -1;
                if (j >= 0) L = this.decoL(this.decos[j], j, i, this.odu[i], this.odv[i], this.cnt[j] < 12, t, col, flashOn && this.lastSet.includes(j), false) ?? L;
                if (gOwn && gOwn[i] >= 0) { const x = ghosts[gOwn[i]]; L = this.decoL(x, 0, i, gDu[i], gDv[i], x.paint.px.length < 12, t, col, false, true) ?? L; }
            }
            if (calibOn) L = off(i, stripes[0]) <= near[0] ? white : scale(L, 0.25);
            else for (let k = 0; k < stripes.length; k++) if (off(i, stripes[k]) <= near[k]) L = goldL;
            put(out, i, col.led(L));
        }
        const list = [{ geom: g, bytes: out }];
        for (const star of this.stars ?? []) {
            const sg = star.geom, sb = new Uint8Array(sg.n * 3);
            for (let i = 0; i < sg.n; i++) put(sb, i, col.led(starL(i, sg.n, star.ang[i] ?? i / sg.n, star.twinkle[i])));
            list.push({ geom: sg, bytes: sb });
        }
        return list;
    }

    message() {
        if (!this.lay) return 'The tree is not ready yet.';
        return Date.now() < this.partyUntil ? '🎉 The tree is full! Party on the lights!' : `${this.decos.length} of ${this.s.maxOn} decorations hung.`;
    }

    status() {
        const lay = this.lay, s = this.s;
        return { decos: this.decos.map((d) => [d.u, d.v, d.k, d.c, d.f, d.s]),
            ghosts: [...this.ghosts].map(([by, x]) => ({ by, u: x.u, v: x.v, k: x.k, c: x.c, s: x.s, ok: x.ok, why: x.why })),
            round: !!lay?.round, half: !!lay?.half, turn: s.view === 'all' && !!lay?.round, drawn: !!lay?.drawn,
            lookGuide: s.lookGuide && s.view === 'all', kindList: KINDS.filter(([k]) => s.kinds.includes(k)), allKinds: KINDS.map(([k]) => k), colors: COLORS, every: s.every, party: Date.now() < this.partyUntil,
            lastSet: this.lastSet, lastOk: this.lastOk, hung: this.hung, maxDeco: s.maxDeco, maxOn: s.maxOn, full: this.full, lastBy: this.lastBy,
            sizes: s.sizePick ? SIZES.map(([k, n], i) => [i, n]).filter(([i]) => s.sizes.includes(SIZES[i][0])) : [], sizeMul: SIZES.map((x) => x[2]),
            rPhone: lay ? r3(lay.r / (lay.drawn ? 0.69 : 1) / ((lay.H ?? 1) || 1) * 96) : 4,
            star: !!this.star, starPick: !!this.star && s.starPick, starCol: this.starCol || s.starColor,
            starAt: this.starAt, starLastBy: this.starLastBy, starEvery: s.starEvery,
            treeCol: this.treeCol || s.treeColor, treePick: s.treePick && s.bg !== 'off', treeCols: TREE_COLS, treeAt: this.treeAt, treeLastBy: this.treeLastBy,
            fxList: DECO_FX.filter(([k]) => s.fx.includes(k)), allFx: DECO_FX.map(([k]) => k),
            starFx: (this.starFx ?? [s.starFx]).slice(-s.maxFx), maxFx: s.maxFx, starFxList: STAR_FX.filter(([k]) => s.starFxs.includes(k)), players: [] };
    }
}
