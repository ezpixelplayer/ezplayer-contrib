// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Sing: visitors record a song on their phone (up to 10 seconds), pick who sings it and send it. The recording plays on
 * the show's speakers through EZPlayer while the chosen one "sings" it:
 *   - a singing model of the show (a model with a face in xLights: pumpkins, trees, skulls, bulbs…) moves its mouth with
 *     the voice (quiet = rest, soft = E, louder = AI, loud and round = O), with its outline and eyes on, blinking now and then;
 *   - a prop glows with the voice, brighter when it is louder, its colour turning slowly;
 *   - a matrix shows a drawn face whose mouth opens with the voice.
 * A recording is bigger than one event, so the phone sends it in parts; one recording plays at a time, the rest wait.
 */

import { num } from './multi-helpers.mjs';
import { Geom, propsOf, geomsFor, showXml, xmlAttr } from './models.mjs';
import { playSound, busFor } from './audio.mjs';

export const RATE = 11025;
const MAX_SECS = 12, MAX_BYTES = MAX_SECS * RATE * 2, FPS = 20;
const MOUTHS = ['rest', 'E', 'AI', 'O', 'U', 'etc', 'MBP', 'FV', 'L', 'WQ'];
const EMOJI = [['pumpkin', '🎃'], ['tree', '🌲'], ['snow', '⛄'], ['skull', '💀'], ['ghost', '👻'], ['bulb', '💡'], ['gargoyle', '🦇'], ['firework', '🎆'], ['nut', '💂'],
    ['monster', '🧟'], ['kid', '🧒'], ['globe', '🔮'], ['peacock', '🦚'], ['boogie', '👹'], ['chill', '😎'], ['santa', '🎅'], ['reindeer', '🦌'], ['star', '⭐']];
const DEFAULTS = { fps: 20, brightness: 100, target: '', faces: true, props: '', soundBus: 'immediate', piHost: '', piKey: '', volume: 100, delay: 0.15, gap: 20, queueMax: 6, maxSecs: 10, hidden: '' };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['volume', 5, 100], ['delay', -1, 2], ['gap', 0, 600], ['queueMax', 1, 20], ['maxSecs', 3, 10]]) s[k] = num(raw[k], lo, hi, s[k]);
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    if (typeof raw.faces === 'boolean') s.faces = raw.faces;
    for (const k of ['props', 'hidden']) if (typeof raw[k] === 'string') s[k] = raw[k].slice(0, 6000);
    if (['immediate', 'main', 'local', 'pi'].includes(raw.soundBus)) s.soundBus = raw.soundBus;
    if (typeof raw.piHost === 'string' && (raw.piHost.trim() === '' || /^[\w.-]{1,253}(:\d{1,5})?$/.test(raw.piHost.trim()))) s.piHost = raw.piHost.trim();
    if (typeof raw.piKey === 'string') s.piKey = raw.piKey.trim().slice(0, 64);
    return s;
}

/** '1-5,9,12-13' (xLights node numbers, from 1) -> [0, 1, 2, 3, 4, 8, 11, 12] */
export function nodeList(spec) {
    const out = [];
    for (const part of String(spec ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) continue;
        const a = +m[1], b = m[2] ? +m[2] : a;
        if (a > 0 && a <= b && b <= 100000) for (let i = a - 1; i < b; i++) out.push(i);
    }
    return out;
}

/** the singing models of the show: models with a node-range face (with mouths) -> { model: { face, parts } } */
export function facesOf(xml) {
    const out = {};
    for (const m of xml.matchAll(/<model\b([^>]*?)(\/?)>/g)) {
        if (m[2]) continue;
        const name = xmlAttr(m[0], 'name'), end = xml.indexOf('</model>', m.index);
        if (!name || end < 0) continue;
        const faces = [...xml.slice(m.index, end).matchAll(/<faceInfo\b[^>]*>/g)].map((f) => f[0])
            .filter((f) => xmlAttr(f, 'Type') === 'NodeRange' && (xmlAttr(f, 'Mouth-O') || xmlAttr(f, 'Mouth-AI')));
        if (!faces.length) continue;
        const attrs = (f) => [...f.matchAll(/\s([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]);
        const score = (f) => { const a = attrs(f); return a.filter(([k, v]) => v && !k.endsWith('-Color') && !['Name', 'Type', 'Description', 'CustomColors'].includes(k)).length
            + (xmlAttr(f, 'CustomColors') === '1' ? Math.min(5, a.filter(([k, v]) => k.endsWith('-Color') && v).length) : 0); };
        const f = faces.reduce((a, b) => (score(b) > score(a) ? b : a));
        const colours = xmlAttr(f, 'CustomColors') === '1', parts = {};
        for (const [k, v] of attrs(f)) {
            const base = k.replace(/\d+$/, '');
            if (k.endsWith('-Color') || !v || ![...MOUTHS.map((x) => 'Mouth-' + x), 'Eyes-Open', 'Eyes-Closed', 'FaceOutline'].includes(base)) continue;
            const col = colours ? xmlAttr(f, k + '-Color') ?? '' : '';
            (parts[base] ??= []).push([nodeList(v), /^#[0-9a-fA-F]{6}$/.test(col) ? col.slice(1).toLowerCase() : '']);
        }
        out[name] = { face: xmlAttr(f, 'Name'), parts };
    }
    return out;
}

/** loudness and kind of sound, 20 times a second -> mouth shapes and glow levels */
export function mouthTrack(rate, a) {
    const step = Math.max(1, Math.floor(rate / FPS)), rms = [], zcr = [];
    for (let i = 0; i + step <= a.length; i += step) {
        let s = 0, z = 0;
        for (let j = i; j < i + step; j++) { s += a[j] * a[j]; if (j > i && (a[j] >= 0) !== (a[j - 1] >= 0)) z++; }
        rms.push(Math.sqrt(s / step) / 32768); zcr.push(z / step);
    }
    if (!rms.length) return { shapes: [], levels: [] };
    const top = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.95)] || 1e-9, gate = Math.max(0.008, top * 0.12);
    const shapes = [], levels = [];
    rms.forEach((r, i) => {
        const z = zcr[i], lv = r < gate ? 0 : Math.min(1, (r - gate) / Math.max(1e-9, top - gate));
        levels.push(lv);
        shapes.push(lv < 0.08 ? 'rest' : z > 0.18 ? (lv < 0.5 ? 'E' : 'etc') : lv < 0.35 ? (z > 0.08 ? 'E' : 'MBP') : lv < 0.7 ? 'AI' : z < 0.05 ? 'O' : 'AI');
    });
    return { shapes: shapes.map((s, i) => (i > 0 && i < shapes.length - 1 && shapes[i - 1] === shapes[i + 1] && shapes[i - 1] !== s ? shapes[i - 1] : s)), levels };
}

const niceName = (m) => m.replace(/_+/g, ' ').replace(/\b(Boscoyo|GE|PPD|EFL|HiRes|P2P|Hi Res)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 28) || m.slice(0, 28);
const emojiOf = (n) => (EMOJI.find(([k]) => n.toLowerCase().includes(k)) ?? [0, '🎤'])[1];
const hsv = (h, s, v) => { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map((x) => Math.round(x * 255)); };
const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

export class App {
    static startTypes = ['sing'];
    statusMs = 300;

    constructor(s) {
        this.s = s; this.ready = false; this.singers = []; this.problems = [];
        this.parts = new Map(); this.queue = []; this.cur = null; this.busy = false; this.from = new Map(); this.t = 0;
    }

    async prepare({ base, groups }) {
        const s = this.s, singers = [], problems = [], hidden = new Set(s.hidden.split('\n').map((x) => x.trim()).filter(Boolean));
        let targets = [];
        try { const r = await fetch(`${base}/api/ezp/overlays/targets`); targets = (await r.json()).targets ?? []; } catch (e) { problems.push('models: ' + e.message); }
        const byName = new Map(targets.map((t) => [t.model, t]));
        if (s.faces) {
            const faces = facesOf(showXml());
            for (const m of Object.keys(faces).sort()) {
                const t = byName.get(m);
                if (!t || !t.nodeCount) continue;
                const g = new Geom(m, 'nodes', t.nodeCount, new Array(t.nodeCount).fill(0.5), new Array(t.nodeCount).fill(0.5));
                singers.push({ k: 'f:' + m, n: niceName(m), e: emojiOf(m), kind: 'face', face: faces[m], geoms: [g] });
            }
        }
        for (const [i, p] of propsOf(s.props, groups).entries()) {
            const r = await geomsFor(base, p.models, false);
            problems.push(...r.problems.map((x) => `${p.n}: ${x}`));
            if (r.geoms.length) singers.push({ k: 'p:' + i, n: p.n, e: p.e, kind: 'prop', geoms: r.geoms });
        }
        if (s.target) {
            const r = await geomsFor(base, [s.target], false);
            if (r.geoms[0]?.fmt === 'grid') singers.push({ k: 'm', n: niceName(s.target), e: '🙂', kind: 'matrix', geoms: r.geoms });
            else problems.push(`${s.target}: not a matrix in the show`);
        }
        this.singers = singers.filter((x) => !hidden.has(x.k) && !hidden.has(x.n) && !hidden.has(x.k.slice(2)));
        this.problems = problems;
        this.ready = this.singers.length > 0;
        this.notReady = 'Nobody can sing yet: the show has no singing models (faces in xLights) and no props or matrix are set in the app settings.';
    }

    handle(client, d, now) {
        if (d.type !== 'sing') return '';
        const s = this.s;
        if (d.a === 'cancel') { this.parts.delete(client); return ''; }
        if (d.a !== 'part') return '';
        if (!Number.isInteger(d.n) || !Number.isInteger(d.of) || d.of < 1 || d.of > 12 || d.n < 0 || d.n >= d.of || typeof d.d !== 'string' || typeof d.id !== 'string') return 'The recording did not arrive right. Try again.';
        let p = this.parts.get(client);
        if (d.n === 0) {
            if (!this.singers.some((x) => x.k === d.s)) return 'Pick who sings it.';
            const left = Math.ceil(((this.from.get(client) ?? -Infinity) + s.gap * 1000 - now) / 1000);
            if (left > 0) return `You can send another song in ${left} s.`;
            if (this.queue.length >= s.queueMax) return 'Too many songs waiting. Try again in a moment!';
            if (this.queue.some((q) => q.client === client) || this.cur?.client === client) return 'Your song is already in line.';
            p = { id: d.id, of: d.of, s: d.s, got: [], bytes: 0, at: now, rate: Number.isInteger(d.rate) && d.rate >= 8000 && d.rate <= 22050 ? d.rate : RATE };
            this.parts.set(client, p);
        }
        if (!p || p.id !== d.id || p.of !== d.of || p.got[d.n]) return '';
        const buf = Buffer.from(d.d, 'base64');
        p.got[d.n] = buf; p.bytes += buf.length; p.at = now;
        if (p.bytes > MAX_BYTES) { this.parts.delete(client); return 'That recording is too long.'; }
        if (p.got.filter(Boolean).length < p.of) return '';
        this.parts.delete(client);
        const all = Buffer.concat(p.got), n = Math.floor(all.length / 2), a = new Int16Array(n);
        for (let i = 0; i < n; i++) a[i] = all.readInt16LE(i * 2);
        if (n < p.rate * 0.5) return 'That was too short. Try again!';
        const clip = a.subarray(0, Math.min(n, Math.round(p.rate * (s.maxSecs + 0.5))));
        this.from.set(client, now);
        const who = this.singers.find((x) => x.k === p.s);
        this.queue.push({ client, k: p.s, who: `${who.e} ${who.n}`, rate: p.rate, a: clip, ...mouthTrack(p.rate, clip) });
        console.log(`sing: a song of ${(clip.length / p.rate).toFixed(1)} s for ${who.n}`);
        return '';
    }

    step(now) {
        for (const [c, p] of this.parts) if (now - p.at > 20000) this.parts.delete(c);   // a phone that stopped sending halfway
        if (this.busy || !this.queue.length) return;
        const it = this.queue.shift(), s = this.s;
        this.busy = true;
        this.cur = { ...it, t0: Infinity, end: Infinity };
        void playSound(it.a, it.rate, s.volume / 100, busFor(s.soundBus, s.piHost, s.piKey), (lead) => {
            this.cur.t0 = Date.now() + lead + s.delay * 1000;
            this.cur.end = this.cur.t0 + it.a.length / it.rate * 1000;
        }).then((how) => { if (!how) console.log('sing: nothing could play the sound'); })
            .catch((e) => console.log('sing:', e.message))
            .finally(async () => {
                while (this.cur && Date.now() < this.cur.end && this.cur.end !== Infinity) await new Promise((r) => setTimeout(r, 50));   // the mouth still finishes
                this.cur = null; this.busy = false;
            });
    }

    frames(now) {
        const c = this.cur;
        if (!c) return [];
        const who = this.singers.find((x) => x.k === c.k);
        if (!who) return [];
        const i = Math.floor((now - c.t0) / 1000 * FPS), shape = c.shapes[i] ?? 'rest', lv = c.levels[i] ?? 0, blink = Math.floor(now / 100) % 37 === 0;
        if (who.kind === 'face') {
            const g = who.geoms[0], buf = new Uint8Array(g.n * 3), parts = who.face.parts;
            const paint = (key, def) => { for (const [nodes, col] of parts[key] ?? []) { const cc = col ? rgb(col) : def; for (const j of nodes) if (j < g.n) buf.set(cc, j * 3); } };
            paint('FaceOutline', [255, 170, 60]);
            paint(blink && parts['Eyes-Closed'] ? 'Eyes-Closed' : 'Eyes-Open', [255, 255, 255]);
            const mouth = parts['Mouth-' + shape] ? 'Mouth-' + shape : shape !== 'rest' ? 'Mouth-AI' : 'Mouth-rest';
            paint(mouth, [255, 60, 60]);
            return [{ geom: g, bytes: buf }];
        }
        if (who.kind === 'prop') {
            const col = hsv(((now / 1000) * 0.08) % 1, 0.9, 0.12 + 0.88 * lv);
            return who.geoms.map((g) => { const b = new Uint8Array(g.n * 3); for (let j = 0; j < g.n; j++) b.set(col, j * 3); return { geom: g, bytes: b }; });
        }
        // a matrix: a drawn face, its mouth opening with the voice
        const g = who.geoms[0], w = g.w, h = g.h, b = new Uint8Array(w * h * 3);
        const px = (x, y, cc) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) b.set(cc, (y * w + x) * 3); };
        const cx = (w - 1) / 2, cy = (h - 1) / 2, r = Math.min(w, h) / 2 - 0.5, th = Math.max(0.6, r / 12);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(Math.hypot(x - cx, y - cy) - r) < th) px(x, y, [255, 200, 40]);
        const ey = cy - r * 0.35, es = Math.max(1, Math.round(r / 10));
        for (const ex of [cx - r * 0.4, cx + r * 0.4]) for (let dy = blink ? 0 : -es; dy <= (blink ? 0 : es); dy++) for (let dx = -es; dx <= es; dx++) px(ex + dx, ey + dy, [255, 255, 255]);
        const mw = r * (shape === 'E' || shape === 'etc' ? 0.9 : 0.6), mh = shape === 'rest' || shape === 'MBP' ? 0 : Math.max(1, lv * r * 0.8), my = cy + r * 0.3;
        for (let x = cx - mw / 2; x <= cx + mw / 2; x += 0.5) { px(x, my, [255, 60, 60]); if (mh) px(x, my + mh, [255, 60, 60]); }
        for (let y = my; y <= my + mh; y += 0.5) { px(cx - mw / 2, y, [255, 60, 60]); px(cx + mw / 2, y, [255, 60, 60]); }
        return [{ geom: g, bytes: b }];
    }

    message() { return this.cur ? `🎶 Now singing: ${this.cur.who}` : 'Record a song and pick who sings it!'; }

    status() {
        return {
            singers: this.singers.map((x) => ({ k: x.k, n: x.n, e: x.e, kind: x.kind })), now: this.cur ? { id: this.cur.client, who: this.cur.who } : null,
            queue: this.queue.map((q) => q.client), rate: RATE, maxSecs: this.s.maxSecs, gap: this.s.gap,
        };
    }
}
