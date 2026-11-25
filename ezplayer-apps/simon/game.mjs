// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Simon (memory of colours): the matrix shows a sequence of four colours, the player repeats it on the four pads of
 * their phone. Each press reaches the game at once and lights its colour on the matrix; a wrong one ends the game.
 * Each round adds a colour and goes a little faster. One player; anyone can watch.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { hexRgb, painter, cleanName, num, hex } from './player.mjs';

export const minSize = { w: 4, h: 4 };
const DEFAULTS = { target: '', fps: 20, brightness: 100, speed: 'normal', maxRounds: 30, pressSecs: 8, partySecs: 8,
    colors: ['39d353', 'ff2a2a', 'ffd23f', '2a7bff'] };
const SPEEDS = { slow: 1.35, normal: 1, fast: 0.75 };

function cleanGame(raw) {
    const s = { ...DEFAULTS, colors: [...DEFAULTS.colors] };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (SPEEDS[raw.speed]) s.speed = raw.speed;
    s.maxRounds = num(raw.maxRounds, 5, 99, s.maxRounds);
    s.pressSecs = num(raw.pressSecs, 3, 30, s.pressSecs);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    for (let i = 0; i < 4; i++) s.colors[i] = hex(raw['color' + i], s.colors[i]);
    return s;
}

export const END_TEXTS = {"endWinText": "{winner} did all the rounds!", "endLoseText": "Game over! {score} rounds", "endRecordText": "New record: {score} rounds!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.best = 0; this.reset(); }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.seq = []; this.pos = 0; this.score = 0;
        this.ok = false; this.miss = -1; this.expected = -1; this.reason = '';
        this.t0 = 0; this.until = 0; this.finishedAt = 0;
        this.press = -1; this.pressAt = 0;
    }

    stepMs() { return Math.max(320, 720 - 25 * this.seq.length) * SPEEDS[this.s.speed]; }

    show(ok, now) {
        this.phase = 'showing'; this.ok = ok; this.pos = 0;
        this.t0 = now + (ok ? 1300 : 1000);
        this.until = this.t0 + this.stepMs() * this.seq.length + 300;
    }

    handle(client, d, now) {
        const mine = this.players[0]?.id === client;
        if (d.type === 'new') {
            if (this.phase === 'showing' || this.phase === 'input') return 'A game is already on. Wait for it to end.';
            this.reset();
            this.id += 1;
            this.players = [{ id: client, name: cleanName(d.name, 'Player') }];
            this.bestBefore = this.best;
            this.seq = [Math.floor(Math.random() * 4)];
            this.show(false, now);
            return '';
        }
        if (d.type === 'quit') {
            if (mine && (this.phase === 'showing' || this.phase === 'input')) this.finish('You stopped the game.', now);
            return '';
        }
        if (d.type === 'press') {
            if (d.game !== this.id || (this.phase !== 'input' && this.phase !== 'showing')) return '';
            if (!mine) return 'You are watching this game.';
            if (this.phase !== 'input') return 'Wait until the lights have shown all the colours.';
            if (!Number.isInteger(d.c) || d.c < 0 || d.c > 3 || d.i !== this.pos) return '';
            this.press = d.c; this.pressAt = now;
            if (d.c !== this.seq[this.pos]) {
                this.miss = this.pos; this.expected = this.seq[this.pos];
                this.finish('Wrong colour!', now);
                return '';
            }
            this.pos += 1;
            this.until = now + this.s.pressSecs * 1000;
            if (this.pos === this.seq.length) {
                this.score = this.seq.length;
                this.best = Math.max(this.best, this.score);
                if (this.score >= this.s.maxRounds) { this.finish(`All ${this.score} rounds!`, now, true); return ''; }
                this.seq.push(Math.floor(Math.random() * 4));
                this.show(true, now + 350);
            }
            return '';
        }
        return '';
    }

    finish(reason, now, won = false) {
        this.phase = 'finished'; this.reason = reason; this.won = won; this.finishedAt = now;
        this.until = now + this.s.partySecs * 1000;
        this.best = Math.max(this.best, this.score);
    }

    /** what happened, for the ending: a new best score, all the rounds, or game over */
    outcome() {
        if (this.reason === 'You stopped the game.') return null;
        const vars = { winner: this.players[0]?.name ?? 'Player', colour: '', score: this.score };
        if (this.score > 0 && this.score > (this.bestBefore ?? 0)) return { kind: 'record', vars };
        return { kind: this.won ? 'win' : 'lose', vars };
    }

    step(now) {
        if (this.phase === 'showing' && now > this.until) { this.phase = 'input'; this.until = now + this.s.pressSecs * 1000; }
        else if (this.phase === 'input' && now > this.until) this.finish('Time ran out.', now);
        else if (this.phase === 'finished' && now > this.until) this.reset();
    }

    lit(now) {
        if (this.phase !== 'showing' || now < this.t0) return -1;
        const k = (now - this.t0) / this.stepMs(), i = Math.floor(k);
        return i < this.seq.length && k - i < 0.72 ? this.seq[i] : -1;
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        const n = this.players[0]?.name;
        if (this.phase === 'showing') return `Round ${this.seq.length}: watch the lights!`;
        if (this.phase === 'input') return `Round ${this.seq.length}: ${n}, repeat the colours.`;
        return `${this.reason} ${n} scored ${this.score}.`;
    }

    status() {
        return { game: this.id, players: this.players.map((p) => ({ id: p.id, name: p.name })), round: this.seq.length, pos: this.pos,
            score: this.score, best: this.best, until: this.until, miss: this.miss, expected: this.expected, won: !!this.won,
            colors: this.s.colors, showEndsAt: this.phase === 'showing' ? this.until : null };
    }

    /** four colours, one per corner; the one being shown (or pressed) lights up; green flash = right, red = wrong */
    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        if (this.phase === 'showing' && this.ok && now < this.t0) {
            const f = Math.floor((now - this.t0) / 166) % 2 ? [0, 255, 60] : [0, 60, 15];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, f);
            return;
        }
        if (this.phase === 'finished' && this.won && now - this.finishedAt > 1500) {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, hexRgb(this.s.colors[(Math.floor(x / 2 + y / 2 + t * 6)) % 4]));
            return;
        }
        const hw = Math.floor(w / 2), hh = Math.floor(h / 2), gap = Math.min(w, h) >= 8 ? 1 : 0;
        const lit = this.lit(now);
        for (let q = 0; q < 4; q++) {
            let rgb = hexRgb(this.s.colors[q]), k;
            if (this.phase === 'finished') {
                const tt = (now - this.finishedAt) / 1000;
                if (this.expected >= 0) {
                    if (q === this.expected) k = Math.floor(tt * 4) % 2 ? 1 : 0.12;
                    else { rgb = [255, 0, 0]; k = Math.floor(tt * 4) % 2 ? 0.25 : 0.05; }
                } else k = Math.floor(tt * 2) % 2 ? 1 : 0.25;
            } else if (this.phase === 'input') k = q === this.press && now - this.pressAt < 300 ? 1 : 0.3 + 0.15 * Math.sin(t * 4);
            else k = q === lit ? 1 : 0.08;
            const x0 = (q % 2) * hw, y0 = Math.floor(q / 2) * hh;
            const x1 = q % 2 ? w : hw, y1 = q < 2 ? hh : h;
            for (let y = y0 + (q >= 2 ? gap : 0); y < y1 - (q < 2 ? gap : 0); y++)
                for (let x = x0 + (q % 2 ? gap : 0); x < x1 - (q % 2 ? 0 : gap); x++) set(x, y, rgb, k);
        }
    }
}
