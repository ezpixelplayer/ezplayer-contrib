// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Space Invaders for one player: the phone's slider says where the ship goes (it glides there) and the ship fires by
 * itself, or with a fire button. Waves get faster, a mystery ship crosses the top now and then, three lives and an
 * extra one for each wave cleared.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { hexRgb, painter, cleanName, num, pick } from './player.mjs';
import { sensor, SENSOR_DEFAULTS, cleanSensor, StepTurns } from './sensor.mjs';

export const minSize = { w: 12, h: 12 };
const ROWS = [['ff3cff', 30], ['3cffff', 20], ['3cff5a', 10]];   // colour and points of each row, top first
const LEVELS = {      // ship speed, shot speed, bomb speed, invaders' first step (s), fastest step, bombs at once, bomb gap (s)
    easy: { ship: 7, shot: 18, bomb: 3, step: 1.5, minStep: 0.45, bombs: 1, gap: [2.5, 4.5], ufo: 3 },
    normal: { ship: 10, shot: 20, bomb: 5, step: 1.0, minStep: 0.25, bombs: 2, gap: [1.6, 3.2], ufo: 4 },
    hard: { ship: 14, shot: 22, bomb: 8, step: 0.55, minStep: 0.08, bombs: 2, gap: [1.0, 2.2], ufo: 5 },
};
const DEFAULTS = { ...SENSOR_DEFAULTS, target: '', fps: 20, brightness: 100, level: 'normal', fire: 'auto', maxMinutes: 7, partySecs: 8 };

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (LEVELS[raw.level]) s.level = raw.level;
    if (raw.fire === 'auto' || raw.fire === 'button') s.fire = raw.fire;
    s.maxMinutes = num(raw.maxMinutes, 1, 20, s.maxMinutes);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    cleanSensor(raw, s);
    return s;
}

const ctlOf = (d) => (d && (d.control === 'tilt' || d.control === 'body') ? d.control : 'finger');
const NO_SENSOR = 'The body sensor is not answering: play with the finger or tilt.';

export const END_TEXTS = {"endWinText": "{winner} defended the show!", "endLoseText": "Game over! {score} points", "endRecordText": "New record: {score}!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.best = 0; this.W = 16; this.H = 16; this.statusMs = 300; this.reset(); }

    /** the playing field: the matrix's width, and not much taller than wide (a tall matrix gets a field in the middle) */
    size(w, h) { this.W = w; this.H = Math.max(12, Math.min(h, Math.round(w * 1.4))); }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.aliens = []; this.shots = []; this.bombs = []; this.shields = new Set();
        this.ship = (this.W - 1) / 2; this.target = this.ship;
        this.lives = 3; this.score = 0; this.wave = 0;
        this.adx = 1; this.nextStep = 0; this.nextFire = 0; this.nextBomb = 0; this.firePending = false;
        this.ufo = null; this.ufoNext = 0; this.hitAt = 0; this.boom = [];
        this.t0 = 0; this.endsAt = 0; this.last = 0; this.touched = 0; this.died = 0; this.until = 0; this.reason = '';
        this.ctl = 'finger';
    }

    L() { return LEVELS[this.s.level]; }

    handle(client, d, now) {
        const mine = this.players[0]?.id === client;
        if (d.type === 'new') {
            if (this.phase === 'ready' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            if (ctlOf(d) === 'body' && !sensor.ok()) return NO_SENSOR;
            this.reset();
            this.ctl = ctlOf(d);
            this.id += 1;
            this.players = [{ id: client, name: cleanName(d.name, 'Player') }];
            this.bestBefore = this.best;
            const hy = this.H - 4;
            for (let c = 1; c < 4; c++) for (const x of [Math.floor(c * this.W / 4) - 1, Math.floor(c * this.W / 4)]) this.shields.add(x + ',' + hy);
            this.phase = 'ready'; this.t0 = now; this.touched = now;
            this.endsAt = now + 2500 + this.s.maxMinutes * 60000;
            this.newWave(now + 2500);
            return '';
        }
        if (!mine) return d.type === 'go' || d.type === 'fire' ? 'You are watching this game.' : '';
        if (d.type === 'go' && (this.phase === 'ready' || this.phase === 'playing') && typeof d.x === 'number' && Number.isFinite(d.x)) {
            this.target = Math.max(0, Math.min(1, d.x)) * (this.W - 1);
            this.touched = now;
        } else if (d.type === 'fire' && this.phase === 'playing') { this.firePending = true; this.touched = now; }
        else if (d.type === 'quit' && (this.phase === 'ready' || this.phase === 'playing')) this.finish('You stopped the game.', now);
        return '';
    }

    newWave(at) {
        this.wave += 1;
        const cols = Math.max(3, Math.min(8, Math.floor((this.W - 4) / 2)));
        const x0 = Math.floor((this.W - (cols * 2 - 1)) / 2);
        // lower each wave, but the bottom row stays 4 rows above the shields (H - 4): on a short field always at the top
        const top = Math.min(2 + Math.min(3, this.wave - 1), Math.max(2, this.H - 12));
        this.aliens = [];
        for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < cols; c++) this.aliens.push([x0 + c * 2, top + r * 2, r]);
        this.n0 = this.aliens.length;
        this.adx = 1; this.shots = []; this.bombs = [];
        this.nextStep = at; this.nextFire = at + 500; this.nextBomb = at + this.L().gap[1] * 700;
        this.ufoNext = at + 12000 + Math.random() * 13000;
    }

    stepTime() {
        const L = this.L(), frac = this.aliens.length / Math.max(1, this.n0);
        return Math.max(L.minStep, L.step * 0.92 ** (this.wave - 1) * (0.3 + 0.7 * frac)) * 1000;
    }

    finish(reason, now) {
        this.phase = 'over'; this.reason = reason; this.died = now; this.until = now + this.s.partySecs * 1000;
        this.best = Math.max(this.best, this.score);
    }

    /** a player who plays with the body: walking left and right moves the ship, which fires by itself */
    useSensor(now) {
        sensor.configure(this.s);
        const body = (this.phase === 'ready' || this.phase === 'playing') && this.ctl === 'body';
        sensor.tick(now, !body);
        if (!body) return;
        const pos = sensor.player(0, 1);
        if (pos) { this.target = pos.u * (this.W - 1); this.touched = now; }
    }

    /** what happened, for the ending: a new best score, the time up with lives left, or game over */
    outcome() {
        if (this.reason === 'You stopped the game.' || this.reason === 'Nobody was playing.') return null;
        const vars = { winner: this.players[0]?.name ?? 'Player', colour: '', score: this.score };
        // a record only beats an earlier score (the best starts at 0 when the player starts: the first game is no record)
        if (this.bestBefore > 0 && this.score > this.bestBefore) return { kind: 'record', vars };
        return { kind: this.reason === 'Time is up!' ? 'win' : 'lose', vars };
    }

    step(now) {
        this.useSensor(now);
        if (this.phase === 'over') { if (now > this.until) this.reset(); this.last = now; return; }
        if (this.phase !== 'ready' && this.phase !== 'playing') { this.last = now; return; }
        if (now > this.endsAt || now - this.touched > 90000) { this.finish(now > this.endsAt ? 'Time is up!' : 'Nobody was playing.', now); return; }
        const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
        this.last = now;
        if (this.phase === 'ready') { if (now >= this.nextStep) this.phase = 'playing'; return; }
        const L = this.L(), W = this.W, H = this.H;
        this.ship += Math.max(-L.ship * dt, Math.min(L.ship * dt, this.target - this.ship));
        this.ship = Math.max(1, Math.min(W - 2, this.ship));
        const canFire = this.s.fire === 'auto' || this.ctl === 'body' ? now >= this.nextFire && !this.shots.length : this.firePending && this.shots.length < 2;
        if (canFire) { this.shots.push({ x: Math.round(this.ship), y: H - 3, was: H - 3 }); this.nextFire = now + 550; this.firePending = false; }
        for (const s of this.shots) { s.was = s.y; s.y -= L.shot * dt; }
        for (const b of this.bombs) { b.was = b.y; b.y += L.bomb * dt; }
        if (now >= this.nextStep && this.aliens.length) {                       // the invaders march
            const xs = this.aliens.map((a) => a[0]);
            if ((this.adx > 0 && Math.max(...xs) + 1 >= W) || (this.adx < 0 && Math.min(...xs) - 1 < 0)) { for (const a of this.aliens) a[1] += 1; this.adx = -this.adx; }
            else for (const a of this.aliens) a[0] += this.adx;
            this.nextStep = now + this.stepTime();
            for (const a of this.aliens) this.shields.delete(a[0] + ',' + a[1]);   // the invaders crush the shields they reach
            if (Math.max(...this.aliens.map((a) => a[1])) >= H - 2) { this.finish('Invaded!', now); return; }
        }
        if (now >= this.nextBomb && this.aliens.length) {                       // a bomb from the lowest invader of a column
            const low = new Map();
            for (const a of this.aliens) if (!low.has(a[0]) || a[1] > low.get(a[0])[1]) low.set(a[0], a);
            const a = pick([...low.values()]);
            const most = this.wave < 3 && this.s.level !== 'hard' ? 1 : L.bombs;
            if (this.bombs.length < most) this.bombs.push({ x: a[0], y: a[1] + 1, was: a[1] + 1 });
            this.nextBomb = now + (L.gap[0] + Math.random() * (L.gap[1] - L.gap[0])) * 1000 * 0.95 ** (this.wave - 1);
        }
        if (!this.ufo && now >= this.ufoNext) { const d = Math.random() < 0.5 ? -1 : 1; this.ufo = { x: d > 0 ? -1 : W, d }; }
        if (this.ufo) { this.ufo.x += this.ufo.d * L.ufo * dt; if (this.ufo.x < -2 || this.ufo.x > W + 1) { this.ufo = null; this.ufoNext = now + 15000 + Math.random() * 15000; } }
        this.shots = this.shots.filter((s) => {                                 // every square a shot crosses is checked
            for (let sy = Math.round(s.was); sy >= Math.round(s.y); sy--) {
                const hit = this.aliens.find((a) => a[0] === s.x && a[1] === sy);
                if (hit) { this.aliens.splice(this.aliens.indexOf(hit), 1); this.score += ROWS[hit[2]][1]; this.boom.push([s.x, sy, now]); return false; }
                if (this.shields.delete(s.x + ',' + sy)) return false;
                if (this.ufo && sy === 0 && Math.abs(this.ufo.x - s.x) <= 1) { this.score += pick([50, 100, 150]); this.boom.push([s.x, 0, now]); this.ufo = null; this.ufoNext = now + 15000 + Math.random() * 15000; return false; }
                if (sy < 0) return false;
            }
            return true;
        });
        const keep = [];
        for (const b of this.bombs) {
            const by = Math.round(b.y);
            if (by >= H) continue;
            let blocked = false;
            for (let y = Math.round(b.was); y <= by; y++) if (this.shields.delete(b.x + ',' + y)) { blocked = true; break; }
            if (blocked) continue;
            if (by >= H - 2 && Math.abs(b.x - this.ship) <= 1 && now - this.hitAt > 1500) {
                this.lives -= 1; this.hitAt = now; this.boom.push([Math.round(this.ship), H - 1, now]);
                if (this.lives <= 0) { this.finish('No lives left!', now); return; }
                continue;
            }
            keep.push(b);
        }
        this.bombs = keep;
        this.boom = this.boom.filter((x) => now - x[2] < 400);
        if (!this.aliens.length) {
            this.score += 100 * this.wave;
            this.lives = Math.min(5, this.lives + 1);
            this.newWave(now + 2000);
            this.phase = 'ready';
        }
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        const n = this.players[0]?.name;
        if (this.phase === 'ready') return this.wave > 1 ? `Wave ${this.wave}!` : 'Get ready…';
        if (this.phase === 'playing') return `${n}: ${this.score} points, wave ${this.wave}`;
        return `${this.reason} ${n} scored ${this.score} (wave ${this.wave}).`;
    }

    status() {
        return { game: this.id, players: this.players.map((p) => ({ id: p.id, name: p.name })), score: this.score, best: this.best, sensor: sensor.state(), ctl: this.ctl,
            lives: this.lives, wave: this.wave, fire: this.s.fire, x: Math.round(this.ship / Math.max(1, this.W - 1) * 1000) / 1000,
            endsAt: this.phase === 'playing' ? this.endsAt : null };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        const ox = Math.floor((w - this.W) / 2), oy = Math.floor((h - this.H) / 2);
        const P = (x, y, c) => set(ox + x, oy + y, c);
        const legs = Math.floor(t * 2) % 2;
        for (const a of this.aliens) {
            const c = hexRgb(ROWS[a[2]][0]);
            P(a[0], a[1], c);
            if (legs && a[1] + 1 < this.H - 4) P(a[0], a[1] + 1, c.map((v) => v / 6));
        }
        for (const k of this.shields) { const [x, y] = k.split(',').map(Number); P(x, y, [0, 90, 30]); }
        for (const s of this.shots) P(s.x, Math.round(s.y), [255, 255, 255]);
        for (const b of this.bombs) P(b.x, Math.round(b.y), Math.floor(t * 8) % 2 ? [255, 120, 0] : [255, 40, 0]);
        if (this.ufo) for (const dx of [-1, 0, 1]) P(Math.round(this.ufo.x) + dx, 0, dx ? [255, 30, 30] : [255, 200, 200]);
        const flicker = now - this.hitAt < 1500 && Math.floor(now / 125) % 2;
        if (this.phase !== 'over' && !flicker) {
            const sx = Math.round(this.ship);
            for (const dx of [-1, 0, 1]) P(sx + dx, this.H - 1, [60, 255, 60]);
            P(sx, this.H - 2, [160, 255, 160]);
        }
        if (!this.ufo) for (let i = 0; i < Math.max(0, this.lives); i++) P(i * 2, 0, [60, 255, 60]);
        for (const [x, y, at] of this.boom) {
            const r = Math.min(1, Math.max(0, (now - at) / 400));
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) P(x + dx, y + dy, (dx === 0 && dy === 0) || r > 0.3 ? [255, 255 * (1 - r), 0] : [255, 200, 60]);
        }
        if (this.phase === 'ready' && this.wave > 1 && Math.floor(now / 250) % 2) for (let x = 0; x < this.W; x++) P(x, this.H - 1, [40, 40, 120]);
        if (this.phase === 'over' && Math.floor((now - this.died) / 333) % 2) for (let x = 0; x < this.W; x++) P(x, this.H - 1, [255, 0, 0]);
        if (oy > 0) for (let x = 0; x < this.W; x++) { P(x, -1, [15, 15, 35]); P(x, this.H, [15, 15, 35]); }   // the field's edges on a tall matrix
    }
}
