// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Count the colours: a party game for up to 8 phones. The matrix flashes colours quickly, then everyone answers how
 * many times one of them flashed. A point for each right answer; after the last round, a podium.
 */

import { hexRgb, painter, cleanName, num } from './player.mjs';

export const minSize = { w: 4, h: 4 };
export const COLOURS = [['red', 'ff2a2a'], ['green', '39d353'], ['blue', '2a7bff'], ['yellow', 'ffd23f']];
export const AVATARS = ['🦊', '🐼', '🐸', '🐧', '🦁', '🐯', '🐨', '🐵'];
const DEFAULTS = { target: '', fps: 20, brightness: 100, rounds: 5, lobbySecs: 25, answerSecs: 12, speed: 'normal', maxPlayers: 8 };
const SPEEDS = { slow: 1.3, normal: 1, fast: 0.8 };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    s.rounds = num(raw.rounds, 1, 15, s.rounds);
    s.lobbySecs = num(raw.lobbySecs, 5, 120, s.lobbySecs);
    s.answerSecs = num(raw.answerSecs, 5, 60, s.answerSecs);
    s.maxPlayers = num(raw.maxPlayers, 1, 8, s.maxPlayers);
    if (SPEEDS[raw.speed]) s.speed = raw.speed;
    return s;
}

const RESULT_MS = 4000, END_MS = 12000, INTRO_MS = 2000;

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.reset(); }

    reset() {
        this.phase = 'idle';
        this.players = [];          // { id, name, avatar, score, answer, left }
        this.round = 0; this.seq = []; this.target = 0; this.right = 0;
        this.t0 = 0; this.until = 0; this.reason = '';
    }

    stepMs() { return Math.max(380, 620 - 50 * this.round) * SPEEDS[this.s.speed]; }

    newRound(now) {
        this.round += 1;
        this.target = Math.floor(Math.random() * 4);
        const count = 2 + Math.floor(Math.random() * (3 + this.round));
        const others = 5 + this.round + Math.floor(Math.random() * (3 + this.round));
        const seq = [...Array(count).fill(this.target), ...[...Array(others)].map(() => { let c; do c = Math.floor(Math.random() * 4); while (c === this.target); return c; })];
        for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
        for (let i = 1; i < seq.length; i++)      // never the same colour twice in a row, so every flash can be counted
            if (seq[i] === seq[i - 1])
                for (let j = i + 1; j < seq.length; j++)
                    if (seq[j] !== seq[i - 1] && (j + 1 >= seq.length || seq[j + 1] !== seq[i]) && seq[j - 1] !== seq[i]) { [seq[i], seq[j]] = [seq[j], seq[i]]; break; }
        this.seq = seq;
        this.right = seq.filter((c) => c === this.target).length;
        for (const p of this.players) p.answer = null;
        this.phase = 'show';
        this.t0 = now + INTRO_MS;
        this.until = this.t0 + this.stepMs() * seq.length + 400;
    }

    active() { return this.players.filter((p) => !p.left); }

    handle(client, d, now) {
        const me = this.players.find((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase !== 'idle' && this.phase !== 'over') return 'A game is already on. Wait for it to end.';
            this.reset();
            this.id += 1;
            this.players = [{ id: client, name: cleanName(d.name, 'Player 1'), avatar: AVATARS[0], score: 0, answer: null, left: false }];
            this.phase = 'lobby';
            this.until = now + this.s.lobbySecs * 1000;
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'lobby') return 'The game has started; join the next one.';
            if (me) return '';
            if (this.players.length >= this.s.maxPlayers) return 'The game is full.';
            const n = this.players.length;
            this.players.push({ id: client, name: cleanName(d.name, 'Player ' + (n + 1)), avatar: AVATARS[n], score: 0, answer: null, left: false });
            return '';
        }
        if (!me) return d.type === 'answer' ? 'You are watching this game.' : '';
        if (d.type === 'start') {
            if (this.phase === 'lobby' && me === this.players[0]) this.newRound(now);
            return '';
        }
        if (d.type === 'answer') {
            if ((this.phase !== 'show' && this.phase !== 'answer') || d.round !== this.round) return 'Too late for that round.';
            if (me.answer !== null) return 'You already answered.';
            if (!Number.isInteger(d.value) || d.value < 0 || d.value > 40) return '';
            me.answer = d.value;
            if (this.phase === 'answer' && this.active().every((p) => p.answer !== null)) this.until = now;   // all in: the result now
            return '';
        }
        if (d.type === 'quit') {
            if (me === this.players[0] && this.phase !== 'over') this.finish('The game was stopped.', now);
            else me.left = true;
        }
        return '';
    }

    finish(reason, now) { this.phase = 'over'; this.reason = reason; this.t0 = now; this.until = now + END_MS; }

    step(now) {
        if (this.phase === 'idle' || now <= this.until) return;
        if (this.phase === 'lobby') this.newRound(now);
        else if (this.phase === 'show') {
            this.phase = 'answer';
            this.until = this.active().every((p) => p.answer !== null) ? now + 1000 : now + this.s.answerSecs * 1000;
        } else if (this.phase === 'answer') {
            for (const p of this.players) if (p.answer === this.right) p.score += 1;
            this.phase = 'result'; this.t0 = now; this.until = now + RESULT_MS;
        } else if (this.phase === 'result') {
            if (this.round >= this.s.rounds) this.finish('', now); else this.newRound(now);
        } else if (this.phase === 'over') this.reset();
    }

    lit(now) {
        if (this.phase !== 'show' || now < this.t0) return -1;
        const k = (now - this.t0) / this.stepMs(), i = Math.floor(k);
        return i < this.seq.length && k - i < 0.7 ? this.seq[i] : -1;
    }

    message() {
        const tn = COLOURS[this.target][0];
        if (this.phase === 'idle') return 'Start a game!';
        if (this.phase === 'lobby') return `${this.players.length} player${this.players.length > 1 ? 's' : ''} in. Join now!`;
        if (this.phase === 'show') return `Round ${this.round} of ${this.s.rounds}: count the ${tn} flashes!`;
        if (this.phase === 'answer') return `How many times did ${tn} flash?`;
        if (this.phase === 'result') return `${tn[0].toUpperCase() + tn.slice(1)} flashed ${this.right} times.`;
        if (this.reason) return this.reason;
        const top = Math.max(...this.players.map((p) => p.score));
        const win = this.players.filter((p) => p.score === top).map((p) => p.name);
        return `${win.join(' and ')} win${win.length > 1 ? '' : 's'} with ${top} point${top === 1 ? '' : 's'}!`;
    }

    status() {
        const reveal = this.phase === 'result' || this.phase === 'over';
        return { game: this.id, round: this.round, rounds: this.s.rounds, target: this.target, targetName: COLOURS[this.target][0],
            targetColor: COLOURS[this.target][1], right: reveal ? this.right : -1, until: this.until, maxPlayers: this.s.maxPlayers,
            players: this.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, answered: p.answer !== null, left: p.left,
                ok: reveal && p.answer !== null ? p.answer === this.right : null, answer: reveal ? p.answer : null })) };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        const tc = hexRgb(COLOURS[this.target][1]);
        const border = (c, k, d = Math.max(1, Math.floor(Math.min(w, h) / 8))) => {
            for (let x = 0; x < w; x++) for (let i = 0; i < d; i++) { set(x, i, c, k); set(x, h - 1 - i, c, k); }
            for (let y = 0; y < h; y++) for (let i = 0; i < d; i++) { set(i, y, c, k); set(w - 1 - i, y, c, k); }
        };
        if (this.phase === 'lobby') {               // four colours turning, a white dot for each player
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const q = Math.floor((((Math.atan2(y - h / 2 + 0.5, x - w / 2 + 0.5) / (2 * Math.PI) + t * 0.15) % 1 + 1) % 1) * 4);
                set(x, y, hexRgb(COLOURS[q][1]), 1 / 6);
            }
            this.players.forEach((_, i) => set(1 + 2 * i, h - 2, [255, 255, 255]));
        } else if (this.phase === 'show' && now < this.t0) border(tc, 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 8)));
        else if (this.phase === 'show') {
            const lit = this.lit(now);
            if (lit >= 0) { const c = hexRgb(COLOURS[lit][1]); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) set(x, y, c); }
        } else if (this.phase === 'answer') border(tc, 0.35 + 0.25 * Math.sin(t * 4), 1);
        else if (this.phase === 'result') {         // the right number, as dots appearing one by one
            const n = Math.min(this.right, Math.floor((now - this.t0) / 250) + 1);
            const cols = Math.max(1, Math.min(4, this.right)), rows = Math.ceil(this.right / cols);
            const cell = Math.max(1, Math.min(Math.floor((w - 2) / cols), Math.floor((h - 2) / Math.max(1, rows))));
            const ox = Math.floor((w - cell * cols) / 2), oy = Math.floor((h - cell * rows) / 2);
            for (let i = 0; i < n; i++) {
                const cx = ox + (i % cols) * cell, cy = oy + Math.floor(i / cols) * cell;
                for (let dy = 0; dy < Math.max(1, cell - 1); dy++) for (let dx = 0; dx < Math.max(1, cell - 1); dx++) set(cx + dx, cy + dy, tc);
            }
        } else if (this.phase === 'over') {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
                if (((x * 7919 + y * 104729 + Math.floor(t * 8) * 31) % 13) === 0) set(x, y, hexRgb(COLOURS[(x + y + Math.floor(t * 8)) % 4][1]));
        }
    }
}
