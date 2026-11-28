// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Props of the show for the ShowPlay apps that light real models (props, play the lights, sing, mixer):
 *   - a prop: a name, an icon and a list of models (or groups), from one settings line "🦇 Bats | BatLeft, BatRight | across";
 *   - where each pixel of a model is, from EZPlayer's overlay targets (detail=nodes), as u across and v up, 0..1;
 *   - the 12 prop effects and 11 palettes of ShowPlay, drawn for each model;
 *   - the show's groups, read from xlights_rgbeffects.xml in the show folder.
 * No dependencies; nothing here talks to the phones.
 */

import fs from 'node:fs';
import path from 'node:path';

export const PALETTES = {
    rainbow: ['Rainbow', ['ff0000', 'ff8000', 'ffff00', '00ff00', '00ffff', '0000ff', 'ff00ff']],
    halloween: ['Halloween', ['ff6a00', '7a00ff', '39ff14', 'ff6a00', '7a00ff']],
    christmas: ['Christmas', ['ff0000', '00ff40', 'ffffff', 'ff0000', '00ff40']],
    fire: ['Fire', ['300000', 'ff2000', 'ff8000', 'ffd000', 'ffffa0']],
    ice: ['Ice', ['ffffff', '80e0ff', '0060ff', '00ffff']],
    ocean: ['Ocean', ['001060', '0060ff', '00e0d0', '80ffff']],
    candy: ['Candy', ['ff4fd8', 'ffffff', 'ff2a2a', 'ffffff']],
    forest: ['Forest', ['004000', '00a030', '80ff40', 'ffd23f']],
    sunset: ['Sunset', ['ff2a00', 'ff7a1a', 'ffd23f', '9b5cff']],
    gold: ['Gold', ['ffd700', 'ff9f00', 'fff3b0']],
    party: ['Party', ['ff00aa', '00ffcc', 'ffee00', '7a00ff']],
};
export const PROP_FX = {
    flap: 'Flap', wave: 'Colour wave', rise: 'Rising', spin: 'Spin', breathe: 'Breathe', sparkle: 'Sparkle',
    fire: 'Fire', ripple: 'Ripples', chase: 'Chase', comet: 'Comet', confetti: 'Confetti', solid: 'Colours',
};
export const FX_EMOJI = { flap: '🦋', wave: '🌊', rise: '⬆️', spin: '🌀', breathe: '💗', sparkle: '✨', fire: '🔥', ripple: '💧', chase: '🏃', comet: '☄️', confetti: '🎊', solid: '🎨' };
export const SPEEDS = [0.5, 1.0, 1.8];
/** the page's 9 colours for "my colours" */
export const MY_COLS = ['ff2a2a', 'ff8a1a', 'ffd23f', '39d353', '2ad4ff', '2a7bff', 'a35cff', 'ff5cc8', 'ffffff'];

const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

/** 256 colours blended from a palette; wrap = the last colour blends back into the first */
export function palLut(cols, wrap = true) {
    let cs = (cols.length ? cols : ['ffffff']).map(rgb);
    if (cs.length === 1) cs = [cs[0], cs[0].map((v) => Math.floor(v / 3))];
    const pts = wrap ? cs.concat([cs[0]]) : cs, out = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
        const f = wrap ? i / 256 * (pts.length - 1) : i / 255 * (pts.length - 1), k = Math.min(Math.floor(f), pts.length - 2), x = f - k;
        for (let j = 0; j < 3; j++) out[i * 3 + j] = Math.floor(pts[k][j] + (pts[k + 1][j] - pts[k][j]) * x);
    }
    return out;
}

/** where the body is for a wing: 1 = the right edge (a left wing), 0 = the left edge (a right wing), null = the middle */
export function modelSide(name) {
    const n = name.toLowerCase();
    if (n.includes('left') || /(^|[ _-])l\d*$/.test(n)) return 1;
    if (n.includes('right') || /(^|[ _-])r\d*$/.test(n)) return 0;
    return null;
}

/** one model: how to send to it and where each pixel is (u across, v up, both 0..1) */
export class Geom {
    constructor(model, fmt, n, u, v, w = 0, h = 0) {
        Object.assign(this, { model, fmt, n, u, v, w, h });
        const root = modelSide(model);
        this.d = Float32Array.from(u, (x) => (root !== null ? Math.abs(x - root) : Math.min(1, Math.abs(x - 0.5) * 2)));
        this.ang = Float32Array.from(u, (x, i) => { const mx = root === 1 ? 1 - x : x; return ((Math.atan2(v[i] - 0.5, mx - 0.5) / 6.2832) % 1 + 1) % 1; });
        this.rad = Float32Array.from(u, (x, i) => Math.min(1, Math.hypot(x - 0.5, v[i] - 0.5) * 1.42));
        this.order = Float32Array.from(u, (x, i) => i / Math.max(1, n - 1));
    }
    /** where the middle of the model is in the layout (for the keyboard order), set by geomsFor */
}

export const MAX_GRID = 40000;

async function getJson(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

/** [Geom] for the models (each once), with the problems found; across = one effect over all of them together */
export async function geomsFor(base, models, across = false) {
    const raw = [], problems = [];
    for (const m of models) {
        let t;
        try { t = (await getJson(`${base}/api/ezp/overlays/targets?model=${encodeURIComponent(m)}&detail=nodes`)).targets?.find((x) => (x.target ?? x.model) === m); }
        catch (e) { problems.push(`${m}: ${e.message}`); continue; }
        if (!t) { problems.push(`${m} is not in the show`); continue; }
        const world = t.nodes?.world ?? [], local = t.nodes?.local ?? [];
        const cx = [], cy = [];
        for (let i = 0; i < t.nodeCount; i++) { cx.push(world[i * 3] ?? 0); cy.push(world[i * 3 + 1] ?? 0); }
        if (t.width && t.height && !t.subModel) {
            let w = t.width, h = t.height;
            if (w * h > MAX_GRID) { const k = Math.sqrt(MAX_GRID / (w * h)); w = Math.max(1, Math.floor(w * k)); h = Math.max(1, Math.floor(h * k)); }
            raw.push({ m, grid: true, w, h, cx, cy });
            continue;
        }
        if (!t.nodeCount) { problems.push(`${m} has no pixels`); continue; }
        const xs = [], ys = [];
        const useLocal = !across && local.length >= t.nodeCount * 3;
        for (let i = 0; i < t.nodeCount; i++) {
            xs.push(useLocal ? local[i * 3] : world[i * 3] ?? 0);
            ys.push(useLocal ? local[i * 3 + 1] : world[i * 3 + 1] ?? 0);
        }
        raw.push({ m, grid: false, xs, ys, cx, cy });
    }
    const all = raw.filter((g) => !g.grid);
    const ax = all.flatMap((g) => g.xs), ay = all.flatMap((g) => g.ys);
    const out = raw.map((g) => {
        let geom;
        if (g.grid) {
            const u = [], v = [];
            for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { u.push(x / Math.max(1, g.w - 1)); v.push(1 - y / Math.max(1, g.h - 1)); }
            geom = new Geom(g.m, 'grid', g.w * g.h, u, v, g.w, g.h);
        } else {
            const bx = across ? ax : g.xs, by = across ? ay : g.ys;
            const x0 = Math.min(...bx), x1 = Math.max(...bx), y0 = Math.min(...by), y1 = Math.max(...by);
            geom = new Geom(g.m, 'nodes', g.xs.length, g.xs.map((x) => (x - x0) / ((x1 - x0) || 1)), g.ys.map((y) => (y - y0) / ((y1 - y0) || 1)));
        }
        geom.x = g.cx.length ? g.cx.reduce((a, b) => a + b, 0) / g.cx.length : 0;
        geom.y = g.cy.length ? g.cy.reduce((a, b) => a + b, 0) / g.cy.length : 0;
        return geom;
    });
    return { geoms: out, problems };
}

/** an effect on some models: frame(i, t, dt) -> the bytes for model i (RGB per pixel) */
export class PropFx {
    constructor(geoms, fx, cols, speed = 1) {
        this.geoms = geoms; this.fx = PROP_FX[fx] ? fx : 'solid'; this.sp = speed;
        this.lut = palLut(cols, this.fx !== 'fire');
        this.state = geoms.map((g) => new Float32Array(g.n));
        this.colr = geoms.map((g) => new Uint8Array(g.n));
    }
    setColours(cols) { this.lut = palLut(cols, this.fx !== 'fire'); }
    frame(gi, t, dt, out = null) {
        const g = this.geoms[gi], n = g.n, fx = this.fx, lut = this.lut, sin = Math.sin, buf = out ?? new Uint8Array(n * 3);
        t *= this.sp; dt *= this.sp;
        const put = (i, p, b) => { const c = (Math.floor(((p % 1) + 1) % 1 * 256) & 255) * 3; buf[i * 3] = lut[c] * b; buf[i * 3 + 1] = lut[c + 1] * b; buf[i * 3 + 2] = lut[c + 2] * b; };
        if (fx === 'flap') { const beat = 0.55 + 0.45 * sin(t * 6); for (let i = 0; i < n; i++) { const d = g.d[i]; put(i, d * 0.6 + t * 0.15, beat * (0.35 + 0.65 * (0.5 + 0.5 * sin((d * 2.2 - t * 2.4) * 6.2832)))); } }
        else if (fx === 'wave') for (let i = 0; i < n; i++) put(i, g.d[i] - t * 0.25, 1);
        else if (fx === 'rise') for (let i = 0; i < n; i++) put(i, g.v[i] - t * 0.3, 1);
        else if (fx === 'spin') for (let i = 0; i < n; i++) put(i, g.ang[i] + t * 0.25, 1);
        else if (fx === 'breathe') { const b = 0.15 + 0.85 * (0.5 + 0.5 * sin(t * 2.2)); for (let i = 0; i < n; i++) put(i, t * 0.05 + g.d[i] * 0.3, b); }
        else if (fx === 'ripple') for (let i = 0; i < n; i++) { const r = g.rad[i]; put(i, r * 1.5 - t * 0.4, 0.25 + 0.75 * (0.5 + 0.5 * sin((r * 3 - t * 1.2) * 6.2832))); }
        else if (fx === 'chase') for (let i = 0; i < n; i++) { const o = g.order[i]; put(i, o * 3 - t * 0.3, (((o * 12 - t * 1.2) % 1) + 1) % 1 < 0.5 ? 1 : 0.08); }
        else if (fx === 'comet') { const head = ((t * 0.25) % 1 + 1) % 1; for (let i = 0; i < n; i++) { const b = Math.max(0, 1 - (((head - g.order[i]) % 1) + 1) % 1 * 6); put(i, head + 0.3 * b, b); } }
        else if (fx === 'fire') for (let i = 0; i < n; i++) {
            const x = g.u[i], y = g.v[i], nse = (sin(x * 9 + t * 2.1 + sin(y * 5 + t * 3.3)) + sin(y * 7 - t * 4.7 + x * 3) + 2) / 4;
            put(i, Math.max(0, Math.min(0.999, (1.1 - y * 1.25) * (0.45 + 0.75 * nse))), 1);
        } else if (fx === 'sparkle' || fx === 'confetti') {
            const st = this.state[gi], cr = this.colr[gi], sp = fx === 'sparkle';
            const decay = dt <= 0 ? 1 : 0.25 ** (dt * (sp ? 3 : 1.5)), chance = dt * (sp ? 2.5 : 1.2);
            for (let i = 0; i < n; i++) {
                st[i] *= decay;
                if (Math.random() < chance) { st[i] = 1; cr[i] = Math.floor(Math.random() * 256); }
                put(i, sp ? cr[i] / 256 + t * 0.05 : cr[i] / 256, Math.max(sp ? 0.12 : 0, st[i]));
            }
        } else for (let i = 0; i < n; i++) put(i, g.d[i] * 0.8 + t * 0.03, 1);
        return buf;
    }
}

/** the palette's colours, or the visitor's own (1 to 3 of MY_COLS) */
export function coloursOf(pal, mine) {
    if (PALETTES[pal]) return PALETTES[pal][1];
    const m = (Array.isArray(mine) ? mine : []).filter((i) => Number.isInteger(i) && i >= 0 && i < MY_COLS.length).slice(0, 3).map((i) => MY_COLS[i]);
    return m.length ? m : PALETTES.rainbow[1];
}

/** props from the settings: one a line, "<icon> <name> | <model or group>, … | across" (up to 12, 64 models each) */
export function propsOf(text, groups = {}) {
    const out = [];
    for (const line of String(text ?? '').split('\n')) {
        const parts = line.split('|').map((x) => x.trim());
        if (parts.length < 2 || !parts[0] || !parts[1]) continue;
        const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)?\s*(.*)$/u.exec(parts[0]);
        const name = m[2].slice(0, 24).trim() || 'Prop';
        const models = [];
        for (const x of parts[1].split(',').map((y) => y.trim()).filter(Boolean)) for (const y of groups[x] ?? [x]) if (!models.includes(y)) models.push(y);
        out.push({ n: name, e: m[1] || '✨', models: models.slice(0, 64), across: /across|spread/i.test(parts[2] ?? '') });
        if (out.length >= 12) break;
    }
    return out;
}

/** the show's xlights_rgbeffects.xml (text), or '' */
export function showXml() {
    const dir = process.env.EZP_SHOW_FOLDER;
    if (!dir) return '';
    try { return fs.readFileSync(path.join(dir, 'xlights_rgbeffects.xml'), 'utf8'); } catch (e) { return ''; }
}

const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null; };
export { attr as xmlAttr };

/** model groups of the show: name -> [models] (groups inside groups opened up; a submodel stays "Model/Submodel",
 *  which EZPlayer lights on its own, like the star of a Baby Grand Illusion) */
export function groupsOf(xml) {
    const raw = {};
    for (const m of xml.matchAll(/<modelGroup\b[^>]*>/g)) { const n = attr(m[0], 'name'); if (n) raw[n] = (attr(m[0], 'models') ?? '').split(',').map((x) => x.trim()).filter(Boolean); }
    const open = (g, seen) => raw[g].flatMap((m) => (raw[m] && !seen.has(m) ? open(m, new Set([...seen, m])) : [m]));
    const out = {};
    for (const g of Object.keys(raw)) { const ms = [...new Set(open(g, new Set([g])))]; if (ms.length) out[g] = ms; }
    return out;
}
