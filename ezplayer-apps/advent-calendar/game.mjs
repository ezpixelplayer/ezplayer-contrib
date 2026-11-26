// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Advent calendar: 24 doors on the visitors' page, one more open every day from the first day (1 December by default).
 * Each door holds an effect or a message; tapping an open door shows it on the matrix (in turn, with a wait per
 * phone). The doors not open yet stay a surprise: the phones only learn what the open ones hold.
 */

import { num } from './player.mjs';
import { THEME } from './theme.mjs';
import { Text, Fx, FX_LIST, FX_NAMES, plain, isBad, hexRgb } from './lights.mjs';

export const minSize = { w: 8, h: 5 };
const ALL_FX = Object.keys(FX_NAMES);
const DEFAULT_DOORS = THEME.doors ?? (() => {
    const fx = FX_LIST.xm.map(([k]) => k), texts = ['Hello December!', 'Ho ho ho!', 'Let it snow!', 'Santa is coming!', 'Happy Holidays!', 'Almost Christmas!'];
    const out = [];
    for (let d = 1; d <= 24; d++) out.push(d === 24 ? 'text: MERRY CHRISTMAS!' : d % 2 ? `fx: ${fx[(d >> 1) % fx.length]}` : `text: ${texts[(d / 2 - 1) % texts.length]}`);
    return out.join('\n');
})();
const DEFAULTS = { target: '', fps: 25, brightness: 100, month: THEME.month ?? 12, first: THEME.first ?? 1, days: THEME.days ?? 24, testDay: 0, doors: DEFAULT_DOORS, secs: 15, waitSecs: 20 };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    for (const [k, lo, hi] of [['month', 1, 12], ['first', 1, 28], ['days', 1, 24], ['testDay', 0, 24], ['secs', 5, 120], ['waitSecs', 0, 600]]) s[k] = num(raw[k], lo, hi, s[k]);
    if (typeof raw.doors === 'string') s.doors = raw.doors.slice(0, 4000);
    return s;
}

/** the doors from the settings: one a line, "fx: <effect>" or "text: <message>"; missing or bad lines get the defaults */
export function doorsOf(s) {
    const own = s.doors.split('\n'), def = DEFAULT_DOORS.split('\n');
    return def.map((d, i) => {
        for (const line of [own[i] ?? '', d]) {
            const m = /^\s*(fx|text)\s*:\s*(.+?)\s*$/i.exec(line);
            if (!m) continue;
            if (m[1].toLowerCase() === 'fx' && ALL_FX.includes(m[2])) return { kind: 'fx', fx: m[2], label: FX_NAMES[m[2]] };
            const t = plain(m[2]).slice(0, 30).trim();
            if (m[1].toLowerCase() === 'text' && t && !isBad(t)) return { kind: 'text', text: t, label: t };
        }
        return { kind: 'fx', fx: 'twinkle', label: FX_NAMES.twinkle };
    });
}

/** today's door: 0 before the first day, days + 1 after the last (all open) */
export function today(s, now = new Date()) {
    if (s.testDay > 0) return Math.min(s.testDay, s.days);
    const start = new Date(now.getFullYear(), s.month - 1, s.first);
    if (now - start < -300 * 86400000) start.setFullYear(now.getFullYear() - 1);      // January: last year's calendar
    const d = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000) + 1;
    return d < 1 ? 0 : Math.min(d, s.days + 1);
}

export class Game {
    static startTypes = ['open'];

    constructor(s) { this.s = s; this.w = 32; this.h = 16; this.byPhone = new Map(); this.reset(); }
    size(w, h) { this.w = w; this.h = h; }
    reset() { this.phase = 'idle'; this.queue = []; this.cur = null; this.players = []; }

    handle(client, d, now) {
        if (d.type !== 'open') return '';
        const day = today(this.s), n = d.door;
        if (!Number.isInteger(n) || n < 1 || n > this.s.days) return '';
        if (n > day) return `Door ${n} is still closed. Come back on that day!`;
        const left = Math.ceil(((this.byPhone.get(client) ?? 0) + this.s.waitSecs * 1000 - now) / 1000);
        if (left > 0) return `You can open another door in ${left} s.`;
        if (this.queue.length >= 10) return 'The lights are busy. Try again in a moment.';
        this.queue.push({ ...doorsOf(this.s)[n - 1], door: n, client });
        this.byPhone.set(client, now);
        return '';
    }

    make(it) { return it.kind === 'fx' ? new Fx(this.w, this.h, it.fx) : new Text(this.w, this.h, it.text, hexRgb('ffd23f')); }

    step(now) {
        if (this.cur && now < this.cur.until) return;
        const it = this.queue.shift();
        if (!it) { this.cur = null; this.phase = 'idle'; return; }
        it.anim = this.make(it);
        it.t0 = now; it.until = now + Math.max(this.s.secs, it.kind === 'text' ? it.anim.seconds() : 0) * 1000;
        this.cur = it; this.phase = 'showing';
    }

    render(out, w, h, now) {
        if (!this.cur) return;
        if (this.cur.anim.w !== w || this.cur.anim.h !== h) { this.size(w, h); this.cur.anim = this.make(this.cur); }
        out.set(this.cur.anim.frame((now - this.cur.t0) / 1000));
    }

    message() { return this.cur ? `Door ${this.cur.door} is on the lights: ${this.cur.label}` : 'Tap an open door!'; }

    status() {
        const s = this.s, day = today(s), doors = doorsOf(s);
        return { day, days: s.days, month: s.month, first: s.first, players: [],
            doors: doors.slice(0, Math.min(day, s.days)).map((d) => [d.kind === 'fx' ? '✨' : '💬', d.label]),
            now: this.cur ? { door: this.cur.door, id: this.cur.client } : null, queue: this.queue.map((q) => ({ id: q.client, door: q.door })) };
    }
}
