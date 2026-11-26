// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Play the lights: every model of the chosen props becomes a key on the phone, like a keyboard. One visitor plays at a
 * time, for a turn of 30 seconds; the others wait in line. A key lights its model in the colour picked (it flashes on
 * a tap, stays lit while held) and fades out when let go; the rest of the time the models play the sequence.
 */

import { num } from './multi-helpers.mjs';
import { PROP_FX, PropFx, propsOf, geomsFor } from './models.mjs';

export const COLS = ['ff2a2a', 'ff8a1a', 'ffd23f', '39d353', '2ad4ff', '2a7bff', 'a35cff', 'ff5cc8', 'ffffff'];
const MAX_KEYS = 48;
const DEFAULTS = {
    fps: 25, brightness: 100, props: '',
    order: 'layout', turnSecs: 30, idleSecs: 10, queueMax: 20, pulse: 0.5, attack: 0, release: 0.8, fx: 'solid', rainbow: true,
};

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['turnSecs', 10, 300], ['idleSecs', 5, 120], ['queueMax', 1, 50],
        ['pulse', 0.1, 3], ['attack', 0, 2], ['release', 0, 4]]) s[k] = num(raw[k], lo, hi, s[k]);
    if (typeof raw.props === 'string') s.props = raw.props.slice(0, 6000);
    if (['layout', 'list'].includes(raw.order)) s.order = raw.order;
    if (PROP_FX[raw.fx]) s.fx = raw.fx;
    if (typeof raw.rainbow === 'boolean') s.rainbow = raw.rainbow;
    return s;
}

/** the colour and two darker neighbours, for the moving effects */
const shades = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return [h, ...[0.75, 0.5].map((k) => c.map((v) => Math.floor(v * k).toString(16).padStart(2, '0')).join(''))]; };

export class App {
    static startTypes = ['play'];

    constructor(s) {
        this.s = s; this.ready = false; this.keys = []; this.problems = [];
        this.holder = null; this.until = 0; this.lastTap = 0; this.queue = [];
        this.env = new Map(); this.down = new Map(); this.eng = new Map(); this.colOf = new Map(); this.last = 0; this.t = 0; this.taps = 0;
    }

    async prepare({ base, groups }) {
        const props = propsOf(this.s.props, groups), keys = [], problems = [], seen = new Set();
        for (const p of props) {
            const r = await geomsFor(base, p.models.filter((m) => !seen.has(m)), false);
            problems.push(...r.problems.map((x) => `${p.n}: ${x}`));
            for (const g of r.geoms) { seen.add(g.model); keys.push({ g, n: g.model, grp: p.n, e: p.e }); }
        }
        if (this.s.order === 'layout') keys.sort((a, b) => a.g.x - b.g.x || b.g.y - a.g.y);
        const sig = JSON.stringify(keys.slice(0, MAX_KEYS).map((k) => [k.n, k.g.n]));
        this.keys = keys.slice(0, MAX_KEYS); this.problems = problems;
        // the minute's check while a model is missing must not cut a turn: only a new list of keys starts over
        if (sig !== this.keysSig) { this.keysSig = sig; this.env.clear(); this.down.clear(); this.eng.clear(); this.colOf.clear(); }
        else this.eng.clear();
        this.ready = this.keys.length > 0;
        this.notReady = !props.length ? 'Not set up yet: add the props to play in the app settings.' : 'None of the models is in the show: check the app settings.';
    }

    next(now) {
        this.holder = this.queue.shift() ?? null;
        this.down.clear();   // the keys the last player held are let go
        this.until = this.holder ? now + this.s.turnSecs * 1000 : 0;
        this.lastTap = now;
    }

    handle(client, d, now) {
        if (d.type !== 'play') return '';
        const mine = this.holder === client;
        if (d.a === 'join') {
            if (mine || this.queue.includes(client)) return '';
            if (this.queue.length >= this.s.queueMax) return 'The line is full. Try again in a moment!';
            this.queue.push(client);
            if (!this.holder) this.next(now);
            return '';
        }
        if (d.a === 'leave') { if (mine) this.next(now); else this.queue = this.queue.filter((q) => q !== client); return ''; }
        if (!['tap', 'down', 'up'].includes(d.a)) return '';
        if (!mine) return d.a === 'up' ? '' : 'It is not your turn yet.';
        const ks = Array.isArray(d.k) ? d.k.filter((k) => Number.isInteger(k) && k >= 0 && k < this.keys.length).slice(0, 10) : [];
        const col = Number.isInteger(d.c) && d.c >= 0 && d.c < COLS.length ? COLS[d.c] : null;
        this.lastTap = now;
        for (const k of ks) {
            if (d.a === 'up') { const x = this.down.get(k); if (x) x.off = Math.min(x.off, Math.max(now, x.at + this.s.pulse * 1000)); continue; }
            this.taps++;
            const c = col ?? (this.s.rainbow ? COLS[k % 8] : COLS[8]);
            if (this.colOf.get(k) !== c) { this.colOf.set(k, c); this.eng.delete(k); }
            this.down.set(k, { at: now, off: d.a === 'tap' ? now + this.s.pulse * 1000 : now + Math.min(30000, this.s.idleSecs * 1000) });   // a phone that locks with a finger on a key does not hold it for long
        }
        return '';
    }

    step(now) {
        if (this.down.size) this.lastTap = now;   // a key held down is playing too
        if (this.holder && (now > this.until || now - this.lastTap > this.s.idleSecs * 1000)) this.next(now);
        if (!this.holder && this.queue.length) this.next(now);
    }

    frames(now) {
        const dt = Math.min(0.2, Math.max(0, (now - (this.last || now)) / 1000)), s = this.s;
        this.last = now; this.t += dt;
        for (const [k, x] of this.down) if (now >= x.off) this.down.delete(k);
        const out = [];
        for (const k of new Set([...this.down.keys(), ...this.env.keys()])) {
            let lv = this.env.get(k) ?? 0;
            if (this.down.has(k)) lv = s.attack <= 0.01 ? 1 : Math.min(1, lv + dt / s.attack);
            else lv = s.release <= 0.01 ? 0 : lv - dt / s.release;
            if (lv <= 0.003) { this.env.delete(k); continue; }
            this.env.set(k, lv);
            const key = this.keys[k];
            if (!key) continue;
            let e = this.eng.get(k);
            if (!e) { e = new PropFx([key.g], s.fx, shades(this.colOf.get(k) ?? COLS[k % 8]), 1); this.eng.set(k, e); }
            const b = e.frame(0, this.t, dt);
            if (lv < 1) for (let i = 0; i < b.length; i++) b[i] = b[i] * lv;
            out.push({ geom: key.g, bytes: b });
        }
        return out;
    }

    message() { return this.holder ? 'Someone is playing the lights!' : 'Tap "Play" to play the lights!'; }

    status() {
        const now = Date.now();
        return {
            keys: this.keys.map((k) => ({ n: k.n, g: k.grp, e: k.e })), cols: COLS, holder: this.holder, queue: this.queue,
            left: this.holder ? Math.max(0, Math.ceil((this.until - now) / 1000)) : 0, until: this.until, turnSecs: this.s.turnSecs,
            lit: [...this.env.keys()],
        };
    }
}
