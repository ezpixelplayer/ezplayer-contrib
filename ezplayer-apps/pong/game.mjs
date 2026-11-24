// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Pong: a visitor against the computer, or two phones against each other. Each phone's slider says where its paddle
 * goes. On a wide matrix the paddles are on the left and right; on a tall one the field turns, with the paddles at
 * the bottom (player 1) and the top (player 2). First to the winning score.
 */

import { painter, cleanName, num, pick } from './player.mjs';

export const minSize = { w: 8, h: 8 };
const LEVELS = {
    easy: { ball: 0.26, max: 0.6, accel: 1.05, cpu: 0.27, cpuUp: 0.02, react: 0.45, aim: 0.33, half: 0.27, serve: 1600 },
    normal: { ball: 0.36, max: 0.9, accel: 1.06, cpu: 0.33, cpuUp: 0.025, react: 0.42, aim: 0.27, half: 0.21, serve: 1300 },
    hard: { ball: 0.45, max: 1.4, accel: 1.07, cpu: 0.4, cpuUp: 0.03, react: 0.4, aim: 0.22, half: 0.16, serve: 1000 },
};
const DEFAULTS = { target: '', fps: 30, brightness: 100, level: 'normal', points: 5, cpu: true, friend: true, waitSecs: 60, partySecs: 6,
    color1: 'ff3c3c', color2: '3c8cff' };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (LEVELS[raw.level]) s.level = raw.level;
    s.points = num(raw.points, 1, 21, s.points);
    for (const k of ['cpu', 'friend']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (!s.cpu && !s.friend) s.cpu = true;
    s.waitSecs = num(raw.waitSecs, 15, 300, s.waitSecs);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    for (const k of ['color1', 'color2']) { const c = String(raw[k] ?? '').replace(/^#/, '').toLowerCase(); if (/^[0-9a-f]{6}$/.test(c)) s[k] = c; }
    return s;
}

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.statusMs = 250; this.w = 32; this.h = 16; this.reset(); }

    /** the field: along the matrix's longer side */
    size(w, h) { this.w = w; this.h = h; }
    turned() { return this.h > this.w * 1.2; }
    lengthPx() { return this.turned() ? this.h : this.w; }
    acrossPx() { return this.turned() ? this.w : this.h; }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.mode = '';
        this.pad = [0.5, 0.5]; this.goal = [0.5, 0.5];
        this.score = [0, 0];
        this.ball = [0.5, 0.5]; this.vel = [0, 0];
        this.serveAt = 0; this.last = 0; this.touched = 0; this.flash = 0; this.aim = 0;
        this.winner = 0; this.reason = ''; this.until = 0; this.waitEndsAt = null;
    }

    L() { return LEVELS[this.s.level]; }
    half() { return Math.max(this.L().half, 3 / Math.max(3, this.acrossPx())); }

    handle(client, d, now) {
        const me = this.players.findIndex((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase === 'waiting' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            const mode = d.mode === 'friend' ? 'friend' : 'cpu';
            if (mode === 'cpu' && !this.s.cpu) return 'Playing the computer is switched off.';
            if (mode === 'friend' && !this.s.friend) return 'Playing a friend is switched off.';
            this.reset();
            this.id += 1;
            this.mode = mode;
            this.players = [{ id: client, name: cleanName(d.name, 'Player 1') }];
            if (mode === 'cpu') { this.players.push({ id: 'cpu', name: 'Computer' }); this.start(now); }
            else { this.phase = 'waiting'; this.waitEndsAt = now + this.s.waitSecs * 1000; }
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'waiting') return 'There is no game waiting for a friend.';
            if (me >= 0) return 'You are already in this game. Ask a friend to join from their phone.';
            this.players.push({ id: client, name: cleanName(d.name, 'Player 2') });
            this.start(now);
            return '';
        }
        if (me < 0) return d.type === 'go' ? 'You are watching this game.' : '';
        if (d.type === 'go' && this.phase === 'playing' && typeof d.y === 'number' && Number.isFinite(d.y)) {
            this.goal[me] = Math.max(0, Math.min(1, d.y));
            this.touched = now;
        } else if (d.type === 'quit') {
            if (this.phase === 'waiting') this.reset();
            else if (this.phase === 'playing') this.finish(2 - me, `${this.players[me].name} left the game.`, now);
        }
        return '';
    }

    start(now) {
        this.phase = 'playing'; this.waitEndsAt = null; this.touched = now; this.last = now;
        this.serve(Math.random() < 0.5 ? -1 : 1, now);
    }

    serve(dir, now) {
        this.ball = [0.5, 0.5];
        const a = (Math.random() * 1.2 - 0.6), sp = this.L().ball;
        this.vel = [dir * sp * Math.cos(a), sp * Math.sin(a)];
        this.serveAt = now + this.L().serve;
    }

    finish(winner, reason, now) { this.phase = 'over'; this.winner = winner; this.reason = reason; this.until = now + this.s.partySecs * 1000; }

    step(now) {
        if (this.phase === 'waiting' && now > this.waitEndsAt) { this.reset(); return; }
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'playing') return;
        if (now - this.touched > 60000) { this.finish(0, 'Nobody was playing.', now); return; }
        const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
        this.last = now;
        const L = this.L(), ph = this.half();
        for (let p = 0; p < 2; p++) {
            if (this.players[p]?.id === 'cpu') {          // the computer reacts late and aims a little off
                const coming = (this.vel[0] > 0) === (p === 1);
                const near = p === 1 ? this.ball[0] > L.react : this.ball[0] < 1 - L.react;
                const goal = coming && near ? this.ball[1] + this.aim : 0.5;
                const sp = L.cpu + L.cpuUp * (this.score[0] + this.score[1]);
                this.pad[p] += Math.max(-sp * dt, Math.min(sp * dt, goal - this.pad[p]));
            } else this.pad[p] += Math.max(-3 * dt, Math.min(3 * dt, this.goal[p] - this.pad[p]));
        }
        if (now < this.serveAt) return;
        let bx = this.ball[0] + this.vel[0] * dt, by = this.ball[1] + this.vel[1] * dt;
        if (by < 0 || by > 1) { by = by < 0 ? -by : 2 - by; this.vel[1] = -this.vel[1]; }
        const edge = 1 / Math.max(4, this.lengthPx());
        for (const [p, xh] of [[0, edge * 1.5], [1, 1 - edge * 1.5]]) {
            const coming = p === 0 ? this.vel[0] < 0 : this.vel[0] > 0;
            const crossed = p === 0 ? bx <= xh : bx >= xh;
            if (coming && crossed && Math.abs(by - this.pad[p]) <= ph + 0.04) {
                const off = (by - this.pad[p]) / (ph + 0.04);
                const sp = Math.min(L.max, Math.hypot(...this.vel) * L.accel), a = off * 0.9;
                this.vel = [(p === 0 ? 1 : -1) * sp * Math.cos(a), sp * Math.sin(a)];
                bx = xh; this.flash = now; this.aim = (Math.random() * 2 - 1) * L.aim;
            }
        }
        if (bx < 0 || bx > 1) {
            const scorer = bx < 0 ? 1 : 0;
            this.score[scorer] += 1;
            if (this.score[scorer] >= this.s.points) { this.finish(scorer + 1, '', now); return; }
            this.serve(scorer === 0 ? 1 : -1, now);
            return;
        }
        this.ball = [bx, by];
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for a friend to join.`;
        if (this.phase === 'playing') return `${this.players[0].name} ${this.score[0]} - ${this.score[1]} ${this.players[1].name}`;
        if (!this.winner) return this.reason;
        return `${this.players[this.winner - 1]?.name} wins ${Math.max(...this.score)} - ${Math.min(...this.score)}!${this.reason ? ' ' + this.reason : ''}`;
    }

    status() {
        const s = this.s;
        return { game: this.id, mode: this.mode, players: this.players.map((p) => ({ id: p.id, name: p.name })), score: this.score,
            winner: this.winner, turned: this.turned(), pad: this.pad.map((v) => Math.round(v * 1000) / 1000), points: s.points,
            colors: [s.color1, s.color2], cpu: s.cpu, friend: s.friend, waitEndsAt: this.waitEndsAt };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        const turned = this.turned(), Lp = turned ? h : w, Ap = turned ? w : h;
        // logical (along, across) -> pixel; on a tall matrix player 1 is at the bottom
        const P = (a, c, col, k) => (turned ? set(c, h - 1 - a, col, k) : set(a, c, col, k));
        const c1 = [parseInt(this.s.color1.slice(0, 2), 16), parseInt(this.s.color1.slice(2, 4), 16), parseInt(this.s.color1.slice(4), 16)];
        const c2 = [parseInt(this.s.color2.slice(0, 2), 16), parseInt(this.s.color2.slice(2, 4), 16), parseInt(this.s.color2.slice(4), 16)];
        for (let c = 0; c < Ap; c += 2) P(Math.floor(Lp / 2), c, [40, 40, 40]);           // the net
        for (let i = 0; i < this.score[0]; i++) P(Math.floor(Lp / 2) - 2 - i, 0, c1);       // the score as dots along the edge
        for (let i = 0; i < this.score[1]; i++) P(Math.floor(Lp / 2) + 2 + i, 0, c2);
        const ph = Math.max(1, Math.round(this.half() * Ap));
        for (const [p, a, col] of [[0, 0, c1], [1, Lp - 1, c2]]) {
            const cy = Math.round(this.pad[p] * (Ap - 1));
            for (let c = cy - ph; c <= cy + ph; c++) P(a, c, col);
        }
        if (this.phase === 'waiting') {
            const k = 0.3 + 0.3 * Math.sin(t * 4);
            for (let c = 0; c < Ap; c++) P(Lp - 1, c, c2, k);
        } else if (this.phase === 'over' && this.winner) {
            const col = this.winner === 1 ? c1 : c2, k = 0.5 + 0.5 * Math.sin(t * 8);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y + Math.floor(t * 6)) % 4 === 0) set(x, y, col, k);
        } else if (this.phase === 'playing' && (now >= this.serveAt || Math.floor(now / 166) % 2)) {
            P(Math.round(this.ball[0] * (Lp - 1)), Math.round(this.ball[1] * (Ap - 1)), now - this.flash > 120 ? [255, 255, 255] : [255, 255, 120]);
        }
    }
}
