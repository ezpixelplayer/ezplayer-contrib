// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Catch the presents: presents fall down a matrix of the show and the visitor catches them in a sleigh at the bottom,
 * moving it with a slider on the phone. A present is 1 point, a golden star 3; a lump of coal takes 2 points off (if
 * the settings put coal in). Alone, or two phones with a sleigh each (the one with more points wins). The presents
 * fall faster as the game goes on. The best scores of the day are kept.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { THEME } from './theme.mjs';
import { drawSprite, backdrop } from './sprites.mjs';
import { painter, cleanName, num, hex, hexRgb } from './player.mjs';
import { sensor, SENSOR_DEFAULTS, cleanSensor, StepTurns } from './sensor.mjs';

export const minSize = { w: 6, h: 8 };
// speed: falling, in heights per second (at the start; it grows to x1.8); every: seconds between two drops (shrinks)
const LEVELS = {
    easy: { speed: 0.28, every: 1.1, coal: 0.12 },
    normal: { speed: 0.38, every: 0.85, coal: 0.18 },
    hard: { speed: 0.5, every: 0.65, coal: 0.24 },
};
const PRESENT_COLS = [[255, 40, 40], [40, 120, 255], [60, 220, 90], [255, 95, 200], [160, 90, 255], [255, 140, 26], [60, 240, 255]];
const GOLD = [255, 200, 60];
const DEFAULTS = { ...SENSOR_DEFAULTS, target: '', fps: 30, brightness: 100, level: 'normal', secs: 60, coal: true, stars: true, friend: true, waitSecs: 60,
    partySecs: 6, snow: true, color1: 'ff3c3c', color2: '3c8cff' };

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (LEVELS[raw.level]) s.level = raw.level;
    s.secs = num(raw.secs, 20, 300, s.secs);
    for (const k of ['coal', 'stars', 'friend', 'snow']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    s.waitSecs = num(raw.waitSecs, 15, 300, s.waitSecs);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    for (const k of ['color1', 'color2']) s[k] = hex(raw[k], s[k]);
    cleanSensor(raw, s);
    return s;
}

const ctlOf = (d) => (d && (d.control === 'tilt' || d.control === 'body') ? d.control : 'finger');
const NO_SENSOR = 'The body sensor is not answering: play with the finger or tilt.';
// the local date (not UTC, which turns the day in the evening in the Americas)
const day = (now) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const END_TEXTS = {"endWinText": "{winner} wins!", "endLoseText": "Game over! {score} points", "endRecordText": "New record: {score}!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.statusMs = 200; this.w = 16; this.h = 16; this.best = []; this.bestDay = ''; this.reset(); }

    size(w, h) { this.w = w; this.h = h; }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.mode = '';
        this.pos = [0.5, 0.5]; this.goal = [0.5, 0.5];
        this.score = [0, 0]; this.caught = [0, 0];
        this.drops = []; this.pops = [];
        this.started = 0; this.endsAt = 0; this.nextDrop = 0; this.last = 0; this.touched = [0, 0];
        this.winner = 0; this.reason = ''; this.until = 0; this.waitEndsAt = null; this.newBest = false;
        this.ctl = ['finger', 'finger'];
    }

    L() { return LEVELS[this.s.level]; }
    /** half the sleigh's width, as a part of the matrix's width (at least 1 pixel each side) */
    half() { return Math.max(0.12, 1.2 / Math.max(6, this.w)); }
    /** a present's size in pixels: bigger on a bigger matrix */
    box() { return Math.max(1, Math.min(4, Math.round(Math.min(this.w, this.h) / 9))); }

    handle(client, d, now) {
        const me = this.players.findIndex((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase === 'waiting' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            const mode = d.mode === 'friend' ? 'friend' : 'solo';
            if (mode === 'friend' && !this.s.friend) return 'Playing with a friend is switched off.';
            if (ctlOf(d) === 'body' && !sensor.ok()) return NO_SENSOR;
            this.reset();
            this.ctl[0] = ctlOf(d);
            this.id += 1;
            this.mode = mode;
            this.players = [{ id: client, name: cleanName(d.name, 'Player 1') }];
            if (mode === 'solo') this.start(now);
            else { this.phase = 'waiting'; this.waitEndsAt = now + this.s.waitSecs * 1000; }
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'waiting') return 'There is no game waiting for a friend.';
            if (me >= 0) return 'You are already in this game. Ask a friend to join from their phone.';
            if (ctlOf(d) === 'body' && !sensor.ok()) return NO_SENSOR;
            this.ctl[1] = ctlOf(d);
            this.players.push({ id: client, name: cleanName(d.name, 'Player 2') });
            this.start(now);
            return '';
        }
        if (me < 0) return d.type === 'go' ? 'You are watching this game.' : '';
        if (d.type === 'go' && this.phase === 'playing' && typeof d.x === 'number' && Number.isFinite(d.x)) {
            this.goal[me] = Math.max(0, Math.min(1, d.x));
            this.touched[me] = now;
        } else if (d.type === 'quit') {
            if (this.phase === 'waiting') this.reset();
            else if (this.phase === 'playing') {
                // not counted: no winner, no ending, no best score (the one who stays is not declared the winner)
                this.finish(0, this.players.length > 1 ? `${this.players[me].name} left the game.` : 'You left the game.', now);
            }
        }
        return '';
    }

    start(now) {
        this.phase = 'playing'; this.waitEndsAt = null;
        this.started = now + 1500; this.endsAt = this.started + this.s.secs * 1000; this.nextDrop = this.started; this.last = now;
        this.touched = [now, now];
        if (this.players.length > 1) { this.pos = [0.3, 0.7]; this.goal = [0.3, 0.7]; } else { this.pos = [0.5, 0.5]; this.goal = [0.5, 0.5]; }
    }

    finish(winner, reason, now) {
        this.phase = 'over'; this.winner = winner; this.reason = reason; this.until = now + this.s.partySecs * 1000; this.drops = [];
        // the best scores of the day (5); a new day starts the list again
        if (this.bestDay !== day(now)) { this.best = []; this.bestDay = day(now); }
        if (!winner) return;      // nobody playing, or the only player left: not counted
        const top = this.best[0]?.score ?? 0;
        for (let p = 0; p < this.players.length; p++) {
            const sc = this.score[p];
            if (sc <= 0) continue;
            this.best.push({ name: this.players[p].name, score: sc });
            if (sc > top && sc === Math.max(...this.score)) this.newBest = true;
        }
        this.best.sort((a, b) => b.score - a.score); this.best = this.best.slice(0, 5);
    }

    /** how far into the game (0 at the start, 1 at the end): the presents fall faster and more often */
    progress(now) { return Math.max(0, Math.min(1, (now - this.started) / Math.max(1, this.endsAt - this.started))); }

    drop(now) {
        const L = this.L(), r = Math.random();
        const kind = this.s.coal && r < L.coal ? 'coal' : this.s.stars && r > 0.93 ? 'star' : 'present';
        const bw = this.box() / Math.max(1, this.w);
        const x = bw / 2 + Math.random() * (1 - bw);
        const sp = L.speed * (1 + 0.8 * this.progress(now)) * (0.85 + Math.random() * 0.3);
        const goods = THEME.good ?? [];
        this.drops.push({ x, y: -this.box() / this.h, v: sp, kind, col: PRESENT_COLS[Math.floor(Math.random() * PRESENT_COLS.length)], spr: goods[Math.floor(Math.random() * goods.length)] });
    }

    /** players who play with the body: the sensor moves their sleigh (each in their own lane, left to right) */
    useSensor(now) {
        sensor.configure(this.s);
        const n = this.players.length, body = this.phase === 'playing' && this.ctl.slice(0, n).includes('body');
        sensor.tick(now, !body);
        if (!body) return;
        for (let p = 0; p < n; p++) if (this.ctl[p] === 'body') { const pos = sensor.player(p, n); if (pos) { this.goal[p] = pos.u; this.touched[p] = now; } }
    }

    /** what happened, for the ending: alone, a new best score of the day or game over; with a friend, who won */
    outcome() {
        if (!this.winner || this.winner === 3) return null;
        if (this.players.length < 2) return { kind: this.newBest ? 'record' : 'lose', vars: { winner: this.players[0]?.name ?? 'Player', colour: colourName(this.s.color1), score: this.score[0] } };
        const w = this.winner - 1;
        return { kind: 'win', vars: { winner: this.players[w]?.name ?? 'Player ' + this.winner, colour: colourName(w ? this.s.color2 : this.s.color1), score: this.score[w] } };
    }

    /** the game for the statistics (player.mjs sends it when the game ends): null when it did not really end */
    statResult() {
        if (!this.winner || !this.players.length) return null;   // a player left, or nobody was playing
        const solo = this.players.length < 2;
        return { players: this.players.map((p, i) => ({ name: p.name, score: this.score[i] })),
            winner: solo || this.winner === 3 ? '' : this.players[this.winner - 1]?.name ?? '', cpuWon: false, what: this.mode };
    }

    step(now) {
        this.useSensor(now);
        if (this.phase === 'waiting' && now > this.waitEndsAt) { this.reset(); return; }
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'playing') return;
        const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
        this.last = now;
        if (this.touched.slice(0, this.players.length).every((t) => now - t > 45000)) { this.finish(0, 'Nobody was playing.', now); return; }
        for (let p = 0; p < this.players.length; p++) this.pos[p] += Math.max(-2.5 * dt, Math.min(2.5 * dt, this.goal[p] - this.pos[p]));
        if (now < this.started) return;
        if (now >= this.endsAt) {
            const [a, b] = this.score;
            if (this.players.length > 1) this.finish(a === b ? 3 : a > b ? 1 : 2, '', now);
            else this.finish(1, '', now);
            return;
        }
        if (now >= this.nextDrop) {
            this.drop(now);
            const every = this.L().every * (1 - 0.45 * this.progress(now)) * (this.players.length > 1 ? 0.75 : 1);
            this.nextDrop = now + every * (0.7 + Math.random() * 0.6) * 1000;
        }
        // the sleigh's top row: a drop is caught when its bottom reaches that row over a sleigh
        const catchY = (this.h - 2) / this.h, hb = this.box() / this.w / 2, half = this.half();
        const keep = [];
        for (const d of this.drops) {
            const before = d.y + this.box() / this.h;
            d.y += d.v * dt;
            const bottom = d.y + this.box() / this.h;
            let caught = -1;
            if (before <= catchY + 0.02 && bottom >= catchY) {
                let bestD = Infinity;
                for (let p = 0; p < this.players.length; p++) {
                    const dist = Math.abs(d.x - this.pos[p]);
                    if (dist <= half + hb && dist < bestD) { bestD = dist; caught = p; }
                }
            }
            if (caught >= 0) {
                const pts = d.kind === 'coal' ? -2 : d.kind === 'star' ? 3 : 1;
                this.score[caught] = Math.max(0, this.score[caught] + pts);
                if (pts > 0) this.caught[caught]++;
                this.pops.push({ x: this.pos[caught], at: now, kind: d.kind, p: caught });
            } else if (d.y < 1) keep.push(d);
        }
        this.drops = keep;
        this.pops = this.pops.filter((p) => now - p.at < 600);
    }

    saveState() { return { best: this.best, day: this.bestDay }; }
    restore(st) {
        if (st && Array.isArray(st.best) && typeof st.day === 'string') {
            this.best = st.best.filter((b) => b && typeof b.name === 'string' && Number.isInteger(b.score)).slice(0, 5).map((b) => ({ name: cleanName(b.name, 'Player'), score: b.score }));
            this.bestDay = st.day;
        }
    }

    message() {
        if (this.phase === 'idle') return 'Catch the presents!';
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for a friend to join.`;
        if (this.phase === 'playing') return this.players.map((p, i) => `${p.name} ${this.score[i]}`).join('  ·  ');
        if (!this.winner) return this.reason;
        if (this.players.length === 1) return `${this.players[0].name} caught ${this.score[0]} point${this.score[0] === 1 ? '' : 's'}!${this.newBest ? ' Best of the day! 🏆' : ''}`;
        if (this.winner === 3) return `A draw: ${this.score[0]} - ${this.score[1]}!`;
        return `${this.players[this.winner - 1]?.name} wins ${Math.max(...this.score)} - ${Math.min(...this.score)}!${this.reason ? ' ' + this.reason : ''}${this.newBest ? ' Best of the day! 🏆' : ''}`;
    }

    status() {
        const s = this.s, now = Date.now();
        return { game: this.id, mode: this.mode, players: this.players.map((p) => ({ id: p.id, name: p.name })), score: this.score,
            winner: this.winner, pos: this.pos.map((v) => Math.round(v * 1000) / 1000), secs: s.secs,
            left: this.phase === 'playing' ? Math.max(0, Math.ceil((this.endsAt - Math.max(now, this.started)) / 1000)) : 0,
            startsIn: this.phase === 'playing' && now < this.started ? Math.ceil((this.started - now) / 1000) : 0,
            colors: [s.color1, s.color2], friend: s.friend, coal: s.coal, sensor: sensor.state(), ctl: this.ctl.slice(0, this.players.length), stars: s.stars, waitEndsAt: this.waitEndsAt,
            best: this.bestDay === day(now) ? this.best : [] };
    }

    /** a present (with a gold ribbon when big enough), a golden star or a lump of coal, with its top-left at (x0, y0) */
    paintDrop(set, d, x0, y0, b, t) {
        const spr = d.kind === 'coal' ? THEME.bad : d.kind === 'star' ? THEME.bonus : d.spr;   // a theme pack: its own pictures
        if (spr) {   // a picture needs a few pixels: drawn bigger than the catching box on a small matrix, round its middle
            const sb = Math.max(b, Math.min(8, Math.floor(Math.min(this.w, this.h) / 4))), ox = x0 - Math.floor((sb - b) / 2), oy = y0 - (sb - b);
            drawSprite((x, y, c, k) => set(ox + x, oy + y, c, k), spr, d.col, sb, d.kind === 'star' ? 0.8 + 0.2 * Math.sin(t * 14) : 1);
            return;
        }
        if (d.kind === 'coal') {
            for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
                const corner = b > 2 && (x === 0 || x === b - 1) && (y === 0 || y === b - 1);
                if (!corner) set(x0 + x, y0 + y, [105, 105, 115], 0.9 + 0.1 * Math.sin(t * 9 + x + y));
            }
            if (b >= 2) set(x0 + b - 1 - (b > 2 ? 1 : 0), y0, [140, 45, 10], 0.6 + 0.4 * Math.sin(t * 12));   // a glowing ember
            return;
        }
        if (d.kind === 'star') {
            const k = 0.7 + 0.3 * Math.sin(t * 14);
            if (b === 1) { set(x0, y0, GOLD, k); return; }
            const m = (b - 1) / 2;
            for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
                const dx = Math.abs(x - m), dy = Math.abs(y - m);
                if (dx + dy <= m + 0.5 || (b <= 2)) set(x0 + x, y0 + y, dx + dy < 0.6 ? [255, 255, 255] : GOLD, k);
            }
            return;
        }
        const mid = Math.floor(b / 2);
        for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
            const ribbon = b >= 3 && (x === mid || y === mid);
            set(x0 + x, y0 + y, ribbon ? GOLD : d.col);
        }
        if (b >= 3) set(x0 + mid, y0 - 1, GOLD);   // the bow
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000, b = this.box();
        const cols = [hexRgb(this.s.color1), hexRgb(this.s.color2)];
        if (this.s.snow) backdrop(set, w, h, t, THEME.back ?? 'snow');   // falling snow in the back (a theme: its own)
        if (this.phase === 'over') {
            const col = this.winner === 2 ? cols[1] : this.winner === 1 ? cols[0] : GOLD;
            const k = 0.5 + 0.5 * Math.sin(t * 8);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y + Math.floor(t * 6)) % 4 === 0) set(x, y, col, k);
            for (let i = 0; i < Math.min(this.score[Math.max(0, this.winner - 1) % 2] || 0, w * 2); i++) set(i % w, h - 1 - Math.floor(i / w), GOLD, 0.6);
            return;
        }
        // the time left: a line along the top that shrinks
        if (this.phase === 'playing') {
            const left = now < this.started ? 1 : Math.max(0, (this.endsAt - now) / (this.endsAt - this.started));
            const n = Math.round(left * w);
            for (let x = 0; x < n; x++) set(x, 0, left < 0.2 ? [255, 60, 40] : [40, 200, 80], left < 0.2 ? 0.5 + 0.5 * Math.sin(t * 10) : 0.6);
            if (now < this.started) {   // 3, 2, 1: a blinking middle row
                const k = Math.floor((this.started - now) / 250) % 2 ? 1 : 0.2;
                for (let x = 0; x < w; x++) set(x, Math.floor(h / 2), GOLD, k);
            }
        }
        for (const d of this.drops) {
            const x0 = Math.round(d.x * w - b / 2), y0 = Math.round(d.y * h);
            this.paintDrop(set, d, x0, y0, b, t);
        }
        // the sleighs: a row with raised ends, in the player's colour; a waiting friend's sleigh blinks
        const half = this.half();
        for (let p = 0; p < Math.max(1, this.players.length) + (this.phase === 'waiting' ? 1 : 0); p++) {
            const col = cols[p % 2], k = this.phase === 'waiting' && p === 1 ? 0.3 + 0.3 * Math.sin(t * 4) : 1;
            const pos = this.phase === 'waiting' && p === 1 ? 0.7 : this.pos[p];
            const x1 = Math.round((pos - half) * (w - 1)), x2 = Math.round((pos + half) * (w - 1));
            for (let x = x1; x <= x2; x++) set(x, h - 1, col, k);
            set(x1, h - 2, col, k); set(x2, h - 2, col, k);
        }
        for (const pop of this.pops) {   // a catch: sparkles over the sleigh (grey smoke for coal)
            const a = (now - pop.at) / 600, cx = pop.x * (w - 1);
            const col = pop.kind === 'coal' ? [90, 90, 90] : pop.kind === 'star' ? GOLD : [255, 255, 255];
            for (let i = 0; i < 6; i++) {
                const ang = i * Math.PI / 3 + pop.p, r = 1 + a * 3;
                set(cx + Math.cos(ang) * r, h - 3 - Math.abs(Math.sin(ang)) * r, col, 1 - a);
            }
        }
    }
}
