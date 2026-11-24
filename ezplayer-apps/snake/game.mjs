// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/** Snake for one player: the phone sends the turns, the snake moves on a square board drawn as big as fits. */

import { painter, cleanName, num, pick } from './player.mjs';

export const minSize = { w: 8, h: 8 };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];            // up, right, down, left
const SPEEDS = { slow: [800, 420], normal: [560, 260], fast: [400, 170] };   // ms per step: at the start, at the fastest
const DEFAULTS = { target: '', fps: 20, brightness: 100, size: 10, speed: 'normal', maxMinutes: 5, partySecs: 8 };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    s.size = num(raw.size, 6, 32, s.size);
    if (SPEEDS[raw.speed]) s.speed = raw.speed;
    s.maxMinutes = num(raw.maxMinutes, 1, 20, s.maxMinutes);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    return s;
}

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.best = 0; this.n = s.size; this.statusMs = 300; this.reset(); }

    size(w, h) { this.n = Math.max(6, Math.min(this.s.size, w, h)); }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.body = []; this.dir = 1; this.turns = []; this.food = [0, 0];
        this.score = 0; this.reason = '';
        this.t0 = 0; this.next = 0; this.endsAt = 0; this.died = 0; this.until = 0;
    }

    placeFood() {
        const free = [];
        for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) if (!this.body.some(([bx, by]) => bx === x && by === y)) free.push([x, y]);
        this.food = free.length ? pick(free) : [-1, -1];
    }

    interval() { const [a, b] = SPEEDS[this.s.speed]; return Math.max(b, a - 25 * this.score); }

    handle(client, d, now) {
        const mine = this.players[0]?.id === client;
        if (d.type === 'new') {
            if (this.phase === 'ready' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            this.reset();
            this.id += 1;
            this.players = [{ id: client, name: cleanName(d.name, 'Player') }];
            const m = Math.floor(this.n / 2);
            this.body = [[m - 1, m], [m - 2, m], [m - 3, m]];
            this.dir = 1;
            this.placeFood();
            this.phase = 'ready'; this.t0 = now; this.next = now + 3000;
            this.endsAt = now + 3000 + this.s.maxMinutes * 60000;
            return '';
        }
        if (!mine) return d.type === 'dir' ? 'You are watching this game.' : '';
        if (d.type === 'dir') {
            if (this.phase !== 'ready' && this.phase !== 'playing') return '';
            const dd = d.d;
            if (!Number.isInteger(dd) || dd < 0 || dd > 3) return '';
            const last = this.turns.length ? this.turns[this.turns.length - 1] : this.dir;
            if (dd !== last && dd !== (last + 2) % 4 && this.turns.length < 3) this.turns.push(dd);   // no turning back on itself
            return '';
        }
        if (d.type === 'quit' && (this.phase === 'ready' || this.phase === 'playing')) this.finish('You stopped the game.', now);
        return '';
    }

    finish(reason, now) {
        this.phase = 'over'; this.reason = reason; this.died = now; this.until = now + this.s.partySecs * 1000;
        this.best = Math.max(this.best, this.score);
    }

    step(now) {
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'ready' && this.phase !== 'playing') return;
        if (now > this.endsAt) { this.finish('Time is up!', now); return; }
        while (now >= this.next && (this.phase === 'ready' || this.phase === 'playing')) {
            this.phase = 'playing';
            if (this.turns.length) this.dir = this.turns.shift();
            const [dx, dy] = DIRS[this.dir];
            const hx = this.body[0][0] + dx, hy = this.body[0][1] + dy;
            if (hx < 0 || hy < 0 || hx >= this.n || hy >= this.n || this.body.slice(0, -1).some(([x, y]) => x === hx && y === hy)) { this.finish('Crashed!', now); return; }
            this.body.unshift([hx, hy]);
            if (hx === this.food[0] && hy === this.food[1]) {
                this.score += 1;
                if (this.body.length >= this.n * this.n) { this.finish('The board is full!', now); return; }
                this.placeFood();
            } else this.body.pop();
            this.next += this.interval();
            if (now - this.next > 1000) this.next = now + this.interval();
        }
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        const n = this.players[0]?.name;
        if (this.phase === 'ready') return 'Get ready…';
        if (this.phase === 'playing') return `${n}: ${this.score} point${this.score === 1 ? '' : 's'}`;
        return `${this.reason} ${n} scored ${this.score}.`;
    }

    status() {
        return { game: this.id, players: this.players.map((p) => ({ id: p.id, name: p.name })), score: this.score, best: this.best,
            length: this.body.length, startsAt: this.phase === 'ready' ? this.next : null, endsAt: this.phase === 'playing' ? this.endsAt : null };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000, N = this.n;
        const cell = Math.max(1, Math.floor(Math.min(w, h) / N));
        const ox = Math.floor((w - cell * N) / 2), oy = Math.floor((h - cell * N) / 2);
        const edge = [25, 25, 60];
        for (let k = -1; k <= cell * N; k++) { set(ox + k, oy - 1, edge); set(ox + k, oy + cell * N, edge); set(ox - 1, oy + k, edge); set(ox + cell * N, oy + k, edge); }
        const sq = (x, y, c) => { for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) set(ox + x * cell + dx, oy + y * cell + dy, c); };
        if (this.food[0] >= 0) sq(this.food[0], this.food[1], [255 * (0.6 + 0.4 * Math.sin(t * 6)), 40, 40]);
        const crashed = this.phase === 'over' && Math.floor((now - this.died) / 250) % 2 === 0;
        this.body.forEach(([x, y], i) => {
            const g = Math.max(60, 220 - i * 8);
            sq(x, y, crashed ? [255, 255, 255] : i === 0 ? [180, 255, 120] : [0, g, g * 0.35]);
        });
        if (this.phase === 'ready' && Math.floor((now - this.t0) / 333) % 2) sq(this.body[0][0], this.body[0][1], [255, 255, 255]);
    }
}
