// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Raffle: a prize draw on a matrix of the show. The entries are a list of names typed on the settings page, ticket
 * numbers from A to B, visitors who join from their phone with their name, or the list and the visitors together.
 * Only the host starts a draw: the "Draw now" button of the settings page (the live document "draw") or a show input
 * "draw" (a physical button). The names spin fast across the matrix like a slot machine, slow down over the suspense
 * seconds and stop on the winner, who is shown big with sparkles; the shared ending (sound, words, machine) fires for
 * each winner. Several winners per draw are drawn one after another.
 *
 * The pick is fair: every entry still in the draw has the same chance (crypto.randomInt), and nobody is drawn twice
 * in one draw (nor in later draws while "remove winners" is on). The winners are known when the draw starts, but each
 * one is only recorded, and only sent to the phones, when the lights stop on it.
 */

import { randomInt } from 'node:crypto';
import { cleanEnd, colourName } from './ending.mjs';
import { painter, cleanName, num, hex, hexRgb } from './player.mjs';
import { Text, plain, isBad, setBadExtra } from './lights.mjs';
import { THEME } from './theme.mjs';

export const minSize = { w: 12, h: 8 };
const MAX_LIST = 1000, MAX_TICKETS = 10000, MAX_PAST = 200, NAME_LEN = 24;
const ENTRIES = ['names', 'numbers', 'visitors', 'both'];
// everything seasonal comes from the theme (a theme pack); these are the Christmas ones
export const LOOK = {
    title: THEME.title ?? 'Christmas raffle',
    greeting: THEME.greeting ?? 'Merry Christmas!',
    cols: THEME.cols ?? ['ff2a2a', '39d353', 'ffc83c', '2bb7ff'],
    win: THEME.win ?? 'ffd23f',
    sparkle: THEME.sparkle ?? ['ffffff', 'ffd23f', 'ff2a2a', '39d353'],
};
const DEFAULTS = { target: '', fps: 30, brightness: 100, entries: 'both', names: '', numFrom: 1, numTo: 100, open: true, maxVisitors: 300,
    badWords: '', perDraw: 1, removeWinners: true, suspense: 6, showSecs: 8, title: '', ownColours: false, nameColor: 'ffffff', winColor: LOOK.win,
    sparkle: true };

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (ENTRIES.includes(raw.entries)) s.entries = raw.entries;
    if (typeof raw.names === 'string') s.names = raw.names.slice(0, 40000);
    s.numFrom = num(raw.numFrom, 0, 99999, s.numFrom);
    s.numTo = num(raw.numTo, 0, 99999, s.numTo);
    if (s.numTo < s.numFrom) [s.numFrom, s.numTo] = [s.numTo, s.numFrom];
    s.numTo = Math.min(s.numTo, s.numFrom + MAX_TICKETS - 1);
    for (const k of ['open', 'removeWinners', 'ownColours', 'sparkle']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    s.maxVisitors = num(raw.maxVisitors, 2, 1000, s.maxVisitors);
    if (typeof raw.badWords === 'string') s.badWords = raw.badWords.slice(0, 4000);
    s.perDraw = num(raw.perDraw, 1, 10, s.perDraw);
    s.suspense = num(raw.suspense, 2, 30, s.suspense);
    s.showSecs = num(raw.showSecs, 3, 60, s.showSecs);
    if (typeof raw.title === 'string') s.title = raw.title.trim().slice(0, 40);
    s.nameColor = hex(raw.nameColor, s.nameColor);
    s.winColor = hex(raw.winColor, s.winColor);
    setBadExtra(s.badWords);
    return s;
}

export const END_TEXTS = { endWinText: THEME.winText ?? '{winner} wins!' };
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

/** a name as it is compared: no accents, no case, single spaces ("José  Silva" = "jose silva") */
export const low = (n) => plain(n).toLowerCase().replace(/\s+/g, ' ').trim();

/** the host's list: one name a line, cleaned, each name once (the first spelling is kept) */
const listCache = { src: null, out: [] };
export function namesOf(s) {
    if (listCache.src === s.names) return listCache.out;
    const out = [], seen = new Set();
    for (const line of s.names.split(/\r?\n/)) {
        const n = line.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_LEN).trim();
        const l = low(n);
        if (!n || seen.has(l)) continue;
        seen.add(l); out.push(n);
        if (out.length >= MAX_LIST) break;
    }
    listCache.src = s.names; listCache.out = out;
    return out;
}

/** k different entries of the list, each with the same chance (a partial Fisher-Yates shuffle) */
export function pickFair(list, k, rnd = randomInt) {
    const a = list.slice(), n = Math.min(k, a.length);
    for (let i = 0; i < n; i++) { const j = i + rnd(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
}

// ---- drawing the names: the biggest font that fits, from the shared lights.mjs fonts ----
const WHITE = [255, 255, 255];
const fonts = new Map();
function glyph(text, hgt) {
    const k = hgt + '|' + text;
    let t = fonts.get(k);
    if (!t) { if (fonts.size > 400) fonts.clear(); t = new Text(1, hgt, text, WHITE); fonts.set(k, t); }
    return t;
}
/** text heights to try, biggest first: 16, 32… (the 8x16 font, scaled) and 8 (the 5x8 font) */
const heights = (maxH) => { const hs = []; for (let k = Math.floor(maxH / 16); k >= 1; k--) hs.push(16 * k); if (maxH >= 8) hs.push(8); return hs; };
function fit(text, maxW, maxH) {
    for (const hh of heights(maxH)) { const t = glyph(text, hh); if (t.tw <= maxW) return t; }
    return null;
}
const tallOf = (t) => t.fh * t.sc;
function blit(set, t, x0, y0, col, k = 1) {
    for (let ci = 0; ci < t.tw; ci++) for (const r of t.cols[ci]) for (let q = 0; q < t.sc; q++) set(x0 + ci, y0 + r * t.sc + q, col, k);
}
// a small hash for the sparkles: the same pixels for a moment, then others
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

export class Game {
    static startTypes = ['join'];
    constructor(s) {
        this.s = s; this.id = 0; this.statusMs = 250; this.w = 32; this.h = 16;
        this.live = 'draw';          // the settings page's buttons (see onLive)
        this.liveN = null;           // the last "draw" document seen (null: not read yet)
        this.visitors = new Map();   // phone -> { name, at }: one entry per phone
        this.past = [];              // the winners so far, newest last: { name, key, c, d, at }
        this.draws = 0;
        this.last = null;            // the last draw's winners, for the phones: { d, winners: [{ name, c }] }
        this.flash = null;           // a word for the host and the phones for a few seconds
        this.ver = 0;                // goes up when the visitors or the winners change (the entries are worked out again)
        this.reset();
    }

    size(w, h) { this.w = w; this.h = h; }

    /** a draw cut short (the matrix busy, an error): the winners shown so far stay, the rest is not drawn */
    reset() {
        if (this.cur && this.phase !== 'idle') this.say('The draw stopped before the end (the matrix was busy, or an error). Draw again.');
        this.phase = 'idle';
        this.players = [];
        this.cur = null;
    }

    say(text, ms = 12000) { this.flash = { text, until: Date.now() + ms }; }
    visitorsOn() { return this.s.entries === 'visitors' || this.s.entries === 'both'; }

    /** everyone in the draw: { key, name, c } (c: the phone of a visitor, or of a visitor who has a name of the list) */
    entries() {
        if (this.cache?.s === this.s && this.cache.ver === this.ver) return this.cache.all;   // status() asks every frame
        const s = this.s, out = [], seen = new Set();
        const vis = new Map();
        if (this.visitorsOn()) for (const [c, v] of this.visitors) vis.set(low(v.name), c);
        if (s.entries === 'names' || s.entries === 'both') {
            for (const n of namesOf(s)) { const l = low(n); seen.add(l); out.push({ key: 'n:' + l, name: n, c: vis.get(l) ?? '' }); }
        }
        if (s.entries === 'numbers') for (let i = s.numFrom; i <= s.numTo; i++) out.push({ key: 't:' + i, name: String(i), c: '' });
        if (this.visitorsOn()) for (const [c, v] of this.visitors) if (!seen.has(low(v.name))) out.push({ key: 'v:' + c, name: v.name, c });
        this.cache = { s, ver: this.ver, all: out, pool: null };
        return out;
    }
    /** who can still win: everyone, or everyone not drawn before when winners are taken out */
    pool() {
        const all = this.entries();
        if (!this.s.removeWinners) return all;
        if (this.cache.pool) return this.cache.pool;
        const won = new Set(this.past.map((p) => p.key));
        return (this.cache.pool = all.filter((e) => !won.has(e.key)));
    }

    handle(client, d, now) {
        if (d.type === 'join') {
            if (!this.visitorsOn()) return 'Joining from the phone is off for this draw.';
            const mine = this.visitors.get(client);
            if (!this.s.open) return mine ? '' : 'The entries are closed.';
            const name = cleanName(d.name, '').slice(0, 16);
            if (!name || !/[a-z0-9]/i.test(plain(name))) return 'Write your name first (letters A to Z).';
            if (isBad(name)) return 'Please use another name.';
            const l = low(name);
            for (const [c, v] of this.visitors) if (c !== client && low(v.name) === l) return 'Someone has joined with that name: add your surname or an initial.';
            if (!mine && this.visitors.size >= this.s.maxVisitors) return 'The draw is full.';
            this.visitors.set(client, { name, at: mine?.at ?? now }); this.ver++;   // joining again only changes the name: still one entry
            return '';
        }
        if (d.type === 'leave') {
            if (!this.visitors.has(client)) return '';
            if (this.phase !== 'idle') return 'A draw is on: wait for it to end.';
            this.visitors.delete(client); this.ver++;
            return '';
        }
        return '';
    }

    /** the settings page's buttons: { what: 'draw' | 'clear' | 'clearVisitors', n } with a new n for each press */
    onLive(o, now) {
        const n = o && typeof o === 'object' && (typeof o.n === 'number' || typeof o.n === 'string') ? o.n : 'none';   // 'none': no such document
        if (n === this.liveN) return;
        const first = this.liveN === null;
        this.liveN = n;
        if (first || n === 'none') return;   // a press from before the app started is not done again
        if (o.what === 'draw') this.draw(now);
        else if (o.what === 'clear') this.clearWinners();
        else if (o.what === 'clearVisitors') this.clearVisitors();
    }

    /** a show input: "draw" is a physical button for the host */
    onInput(name, d, now) { if (name === 'draw') this.draw(now); }

    clearWinners() {
        if (this.phase !== 'idle') { this.say('A draw is on: start again after it.'); return; }
        this.past = []; this.last = null; this.draws = 0; this.ver++;
        this.say('Started again: everyone is back in the draw.');
    }
    clearVisitors() {
        if (this.phase !== 'idle') { this.say('A draw is on: empty the list after it.'); return; }
        this.visitors.clear(); this.ver++;
        this.say("The visitors' list is empty.");
    }

    /** starts a draw (the host only): '' or why not */
    draw(now) {
        if (this.phase !== 'idle') { this.say('A draw is already on.', 6000); return 'busy'; }
        const pool = this.pool();
        if (!pool.length) {
            this.say(this.entries().length ? 'Everyone has won already: press "Start again" to put them all back.' : 'Nobody is in the draw yet.');
            return 'empty';
        }
        const picks = pickFair(pool, this.s.perDraw);
        this.id += 1; this.draws += 1;
        this.cur = { d: this.draws, picks, k: 0, names: pool.map((e) => e.name), shown: [] };
        this.last = { d: this.draws, winners: [] };
        this.flash = null;
        this.spin(now);
        return '';
    }

    /** the reel for the next winner: random names, slowing down, the winner last */
    spin(now) {
        const c = this.cur, T = this.s.suspense, names = c.names.length > 1 ? c.names.filter((n) => !c.shown.includes(n)) : c.names;
        const N = Math.max(10, Math.round(5 * T)), win = c.picks[c.k].name, reel = [];
        for (let i = 0; i <= N + 3; i++) {
            let n = names[Math.floor(Math.random() * names.length)] ?? win;
            if (names.length > 1 && n === reel[i - 1]) n = names[(names.indexOf(n) + 1) % names.length];   // never the same name twice in a row
            reel.push(n);
        }
        reel[N] = win;
        if (names.length > 1) for (const i of [N - 1, N + 1]) if (reel[i] === win) reel[i] = names.find((n) => n !== win) ?? win;
        c.reel = reel; c.N = N; c.t0 = now; c.dur = T * 1000;
        this.phase = 'spinning';
    }
    /** where the reel is: 0 at the start, N (the winner) at the end; fast at first, slower and slower */
    pos(now) {
        const c = this.cur, u = Math.min(1, Math.max(0, (now - c.t0) / c.dur));
        return c.N * (1 - (1 - u) ** 3);
    }

    step(now) {
        if (this.flash && now > this.flash.until) this.flash = null;
        const c = this.cur;
        if (!c) return;
        if (this.phase === 'spinning' && now >= c.t0 + c.dur) {
            const w = c.picks[c.k];
            this.phase = 'over';           // the ending fires for each winner (player.mjs: outcome())
            c.until = now + this.s.showSecs * 1000;
            c.shownAt = now;
            c.shown.push(w.name);
            this.past.push({ name: w.name, key: w.key, c: w.c, d: c.d, at: now });
            if (this.past.length > MAX_PAST) this.past.splice(0, this.past.length - MAX_PAST);
            this.ver++;
            this.last.winners.push({ name: w.name, c: w.c });
        } else if (this.phase === 'over' && now > c.until) {
            c.k += 1;
            if (c.k < c.picks.length) this.spin(now);
            else { this.phase = 'idle'; this.cur = null; }
        }
    }

    /** the winner just shown, for the ending (a sound, the words, a machine) */
    outcome() {
        const c = this.cur;
        if (!c || this.phase !== 'over') return null;
        const w = c.picks[c.k];
        return { kind: 'win', vars: { winner: w.name, colour: colourName(this.colours().win), score: c.picks.length > 1 ? `${c.k + 1}/${c.picks.length}` : '' } };
    }

    colours() {
        const s = this.s;
        return s.ownColours ? { names: [s.nameColor], win: s.winColor, sparkle: LOOK.sparkle } : { names: LOOK.cols, win: LOOK.win, sparkle: LOOK.sparkle };
    }

    message() {
        if (this.flash && this.phase === 'idle') return this.flash.text;   // during a draw, the draw is what the phones see
        const c = this.cur, of = c && c.picks.length > 1 ? ` (${c.k + 1} of ${c.picks.length})` : '';
        if (this.phase === 'spinning') return `Drawing the winner${of}…`;
        if (this.phase === 'over') return `${c.picks[c.k].name} wins!${of}`;
        if (this.last?.winners.length) return `${this.last.winners.map((w) => w.name).join(', ')} won!`;
        return this.visitorsOn() && this.s.open ? 'Join the draw!' : 'The draw starts soon.';
    }

    saveState() {
        return { v: 1, draws: this.draws, visitors: [...this.visitors].map(([c, v]) => [c, v.name, v.at]), past: this.past };
    }
    restore(st) {
        if (!st || typeof st !== 'object' || st.v !== 1) return;
        const str = (x, n) => typeof x === 'string' && x.length > 0 && x.length <= n;
        if (Array.isArray(st.visitors)) for (const v of st.visitors.slice(0, 1000)) {
            if (Array.isArray(v) && str(v[0], 200) && str(v[1], 16)) this.visitors.set(v[0], { name: v[1], at: Number.isFinite(v[2]) ? v[2] : 0 });
        }
        if (Array.isArray(st.past)) this.past = st.past.filter((p) => p && str(p.name, NAME_LEN) && str(p.key, 220) && (p.c === '' || str(p.c, 200)))
            .slice(-MAX_PAST).map((p) => ({ name: p.name, key: p.key, c: p.c, d: Number.isFinite(p.d) ? p.d : 0, at: Number.isFinite(p.at) ? p.at : 0 }));
        this.draws = Number.isFinite(st.draws) ? Math.max(0, Math.floor(st.draws)) : this.past.reduce((m, p) => Math.max(m, p.d), 0);
        this.ver++;
        const lastD = this.past.at(-1)?.d;   // the phones show the last draw's winners again after a restart
        if (lastD) this.last = { d: lastD, winners: this.past.filter((p) => p.d === lastD).map((p) => ({ name: p.name, c: p.c })) };
    }

    status() {
        const s = this.s, c = this.cur, all = this.entries(), col = this.colours(), now = Date.now();
        const st = {
            game: this.id, title: s.title || LOOK.title, greeting: LOOK.greeting, entries: s.entries, visitorsOn: this.visitorsOn(), open: s.open,
            count: all.length, left: s.removeWinners ? this.pool().length : all.length, removeWinners: s.removeWinners, perDraw: s.perDraw,
            ins: this.visitorsOn() ? [...this.visitors.keys()] : [], latest: [...this.visitors.values()].slice(-6).map((v) => v.name).reverse(),
            joined: this.visitors.size, players: [],
            last: this.last, past: this.past.slice(-30).reverse().map((p) => ({ name: p.name, c: p.c, d: p.d })),
            colors: { names: col.names, win: col.win, sparkle: col.sparkle },
        };
        if (c && this.phase === 'spinning') {
            // the names the phones need to spin with the lights: only up to a moment ahead, so the winner is not known early
            const ahead = Math.min(c.reel.length, Math.floor(this.pos(now + 700)) + 2);
            st.spin = { t0: c.t0, dur: c.dur, N: c.N, names: c.reel.slice(0, ahead), k: c.k, of: c.picks.length };
        }
        if (c && this.phase === 'over') st.shown = { name: c.picks[c.k].name, c: c.picks[c.k].c, k: c.k, of: c.picks.length, until: c.until };
        return st;
    }

    // ---- the lights ----
    render(out, w, h, now) {
        const c = this.cur;
        if (!c) return;
        const set = painter(out, w, h), col = this.colours(), t = now / 1000;
        const names = col.names.map(hexRgb), win = hexRgb(col.win), sparks = col.sparkle.map(hexRgb);
        const dots = (cur) => {   // several winners: a dot each along the bottom, the ones shown lit
            const n = c.picks.length;
            if (n < 2 || h < 12 || n * 2 > w) return;
            const x0 = Math.floor((w - (n * 2 - 1)) / 2);
            for (let i = 0; i < n; i++) set(x0 + i * 2, h - 1, i < cur ? win : i === cur ? win : [60, 60, 60], i === cur ? 0.5 + 0.5 * Math.sin(t * 8) : 1);
        };
        if (this.phase === 'spinning') {
            const p = this.pos(now), i = Math.floor(p);
            const u = Math.min(1, Math.max(0, (now - c.t0) / c.dur)), speed = (1 - u) ** 2;
            if (w >= 16 && h >= 10) {   // lights chasing round the edge, as fast as the names
                const per = 2 * (w + h) - 4, off = Math.floor(p * 3);
                for (let q = 0; q < per; q++) {
                    if ((q + off) % 4) continue;
                    const [x, y] = q < w ? [q, 0] : q < w + h - 1 ? [w - 1, q - w + 1] : q < 2 * w + h - 2 ? [w - 1 - (q - (w + h - 2)), h - 1] : [0, h - 1 - (q - (2 * w + h - 3))];
                    set(x, y, names[Math.floor(q / 4) % names.length], 0.25 + 0.5 * speed);
                }
            }
            // the reel: on a wide matrix one name fills the height; on a tall one the names stack, the middle one bright
            const rowH = Math.min(h, Math.max(8, w)), space = rowH + 2, cy = Math.floor((h - rowH) / 2), reach = Math.ceil(h / space) + 1;
            for (let j = Math.max(0, i - reach); j <= Math.min(c.reel.length - 1, i + reach); j++) {
                const y = cy + Math.round((p - j) * space);
                if (y >= h || y + rowH <= 0) continue;
                const name = c.reel[j], g = fit(name, w, rowH) ?? glyph(name, 8);
                const x0 = Math.floor((w - g.tw) / 2), mid = Math.abs(p - j) < 0.5;
                blit(set, g, x0, y + Math.floor((rowH - tallOf(g)) / 2), names[j % names.length], mid || space * 2 > h ? 1 : 0.35);
            }
            dots(c.k);
            return;
        }
        if (this.phase === 'over') {
            const name = c.picks[c.k].name, since = (now - c.shownAt) / 1000;
            const g = fit(name, w - 2, h) ?? fit(name, w, h);
            const box = g ? { x0: Math.floor((w - g.tw) / 2), y0: Math.floor((h - tallOf(g)) / 2), w: g.tw, h: tallOf(g) } : null;
            if (this.s.sparkle) {
                const n = Math.max(4, Math.round(w * h / 22)), slot = Math.floor(t * 5);
                for (let q = 0; q < n; q++) {
                    const sd = slot + q * 13, x = Math.floor(hash(q, sd) * w), y = Math.floor(hash(sd, q + 7) * h);
                    if (box && x >= box.x0 - 1 && x <= box.x0 + box.w && y >= box.y0 - 1 && y <= box.y0 + box.h) continue;
                    const k = Math.max(0, Math.sin((t * 5 - slot) * Math.PI));   // each sparkle flares and fades
                    set(x, y, sparks[q % sparks.length], k);
                }
            }
            const flashIn = since < 0.6 ? (Math.floor(since * 10) % 2 ? 1 : 0.3) : 0.8 + 0.2 * Math.sin(t * 6);   // a few blinks as it stops, then a glow
            if (g) blit(set, g, box.x0, box.y0, win, flashIn);
            else {   // too long for the matrix: it scrolls, again and again
                const sh = heights(Math.min(h, Math.max(8, w)))[0] ?? 8, s2 = glyph(name, sh);
                const speed = 22 * s2.sc, off = (Math.floor(since * speed) + w - 1) % (s2.tw + w);   // it starts at the left edge
                blit(set, s2, w - off, Math.floor((h - tallOf(s2)) / 2), win, 1);
            }
            dots(c.k);
        }
    }
}
