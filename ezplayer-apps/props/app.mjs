// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Props of the show: visitors light up real models (a pair of wings, the bats, a row of arches) from their phone, with
 * one of 12 effects, a palette or their own colours, and a speed. The effect plays on top of the sequence; when it
 * ends the models go back to the show. Each prop shows one request at a time; the others wait (or replace it).
 */

import { num } from './multi-helpers.mjs';
import { PALETTES, PROP_FX, FX_EMOJI, SPEEDS, MY_COLS, PropFx, coloursOf, propsOf, geomsFor } from './models.mjs';

const DEFAULTS = {
    fps: 20, brightness: 100, props: '',
    secs: 20, waitSecs: 20, queue: true, queueMax: 5, fx: Object.keys(PROP_FX), pals: Object.keys(PALETTES), mine: true,
};

export function cleanSettings(raw) {
    const s = { ...DEFAULTS, fx: [...DEFAULTS.fx], pals: [...DEFAULTS.pals] };
    if (!raw || typeof raw !== 'object') return s;
    for (const [k, lo, hi] of [['fps', 5, 30], ['brightness', 10, 100], ['secs', 5, 120], ['waitSecs', 0, 600], ['queueMax', 1, 20]]) s[k] = num(raw[k], lo, hi, s[k]);
    if (typeof raw.props === 'string') s.props = raw.props.slice(0, 6000);
    for (const k of ['queue', 'mine']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (Array.isArray(raw.fx)) { const f = Object.keys(PROP_FX).filter((k) => raw.fx.includes(k)); if (f.length) s.fx = f; }
    if (Array.isArray(raw.pals)) s.pals = Object.keys(PALETTES).filter((k) => raw.pals.includes(k));
    if (!s.pals.length && !s.mine) s.pals = ['rainbow'];
    return s;
}

export class App {
    static startTypes = ['prop'];

    constructor(s) {
        this.s = s; this.ready = false; this.props = []; this.geoms = []; this.problems = [];
        this.cur = []; this.queues = []; this.by = new Map(); this.last = 0;
        this.usesBy = {};   // effects sent, for the statistics (multi.mjs sends it)
    }

    async prepare({ base, groups }) {
        const props = propsOf(this.s.props, groups), geoms = [], problems = [];
        for (const p of props) {
            const r = await geomsFor(base, p.models, p.across);
            geoms.push(r.geoms);
            problems.push(...r.problems.map((x) => `${p.n}: ${x}`));
        }
        const same = JSON.stringify(props) === JSON.stringify(this.props);
        this.props = props; this.geoms = geoms; this.problems = problems;
        if (!same) { this.cur = props.map(() => null); this.queues = props.map(() => []); }
        // the running effects are made again on the new pixels (a model that was missing may be back)
        else this.cur = this.cur.map((c, i) => (c ? { ...c, eng: new PropFx(geoms[i], c.fx, c.cols, SPEEDS[c.speed]) } : null));
        this.ready = geoms.some((g) => g.length);
        this.notReady = !props.length ? 'Not set up yet: add a prop in the app settings.' : 'None of the props\' models is in the show: check the app settings.';
    }

    handle(client, d, now) {
        if (d.type !== 'prop') return '';
        const s = this.s, i = d.i;
        if (!Number.isInteger(i) || !this.props[i] || !this.geoms[i].length) return 'That prop is not available.';
        if (!s.fx.includes(d.fx)) return 'Pick an effect.';
        const mine = d.pal === 'mine';
        if (mine ? !s.mine : !s.pals.includes(d.pal)) return 'Pick colours.';
        const speed = [0, 1, 2].includes(d.speed) ? d.speed : 1;
        const left = Math.ceil(((this.by.get(client) ?? -Infinity) + s.waitSecs * 1000 - now) / 1000);
        if (left > 0) return `You can send another in ${left} s.`;
        const q = this.queues[i];
        if (s.queue && this.cur[i]) {
            if (q.some((x) => x.client === client)) return 'You are already in line for this prop.';
            if (q.length >= s.queueMax) return 'Too many waiting for this prop. Try another one!';
        }
        this.by.set(client, now);
        if (this.by.size > 500) for (const [c, at] of this.by) if (now - at > s.waitSecs * 1000) this.by.delete(c);
        const item = { client, fx: d.fx, cols: coloursOf(d.pal, d.mine), speed, label: `${PROP_FX[d.fx]} on ${this.props[i].n}` };
        this.usesBy['effect'] = (this.usesBy['effect'] ?? 0) + 1;
        if (s.queue) q.push(item); else { q.length = 0; q.push(item); if (this.cur[i]) this.cur[i].until = 0; }
        return '';
    }

    step(now) {
        for (let i = 0; i < this.props.length; i++) {
            if (this.cur[i] && now < this.cur[i].until) continue;
            const it = this.queues[i]?.shift();
            this.cur[i] = it ? { ...it, t0: now, until: now + this.s.secs * 1000, eng: new PropFx(this.geoms[i], it.fx, it.cols, SPEEDS[it.speed]) } : null;
        }
    }

    frames(now) {
        const dt = Math.min(0.2, Math.max(0, (now - (this.last || now)) / 1000)), out = new Map();
        this.last = now;
        this.cur.forEach((c, i) => {
            if (!c) return;
            const t = (now - c.t0) / 1000, fade = Math.min(1, t / 0.4, (c.until - now) / 600);
            this.geoms[i].forEach((g, gi) => {
                const b = c.eng.frame(gi, t, dt);
                if (fade < 1) for (let k = 0; k < b.length; k++) b[k] = b[k] * Math.max(0, fade);
                out.set(g.model, { geom: g, bytes: b });   // a model in two props: the later prop wins
            });
        });
        return [...out.values()];
    }

    message() {
        const on = this.cur.filter(Boolean).length;
        return on ? `Lighting up now: ${this.cur.filter(Boolean).map((c) => c.label).join(', ')}` : 'Pick a prop, an effect and colours!';
    }

    status() {
        const s = this.s, now = Date.now();
        return {
            props: this.props.map((p, i) => ({ n: p.n, e: p.e, ok: this.geoms[i]?.length > 0, now: this.cur[i] ? { id: this.cur[i].client, left: Math.max(0, Math.ceil((this.cur[i].until - now) / 1000)) } : null,
                queue: (this.queues[i] ?? []).map((x) => x.client) })),
            fx: s.fx.map((k) => [k, PROP_FX[k], FX_EMOJI[k]]), pals: s.pals.map((k) => [k, PALETTES[k][0], PALETTES[k][1]]), mine: s.mine, myCols: MY_COLS,
            secs: s.secs, waitSecs: s.waitSecs, queueMode: s.queue,
        };
    }
}
