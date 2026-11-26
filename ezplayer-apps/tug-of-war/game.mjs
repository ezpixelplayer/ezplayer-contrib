// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Tug of war: two teams of phones tap as fast as they can and the rope on the matrix moves to the side that pulls
 * harder. A team wins when the knot reaches its line, or by being ahead when the time is up. Each team's pull is the
 * taps of its players divided by how many they are, so a small team can beat a big one. With only one team, the
 * computer pulls the other side.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { hexRgb, hex, painter, cleanName, num } from './player.mjs';
import { bigGlyph } from './lights.mjs';

export const minSize = { w: 8, h: 4 };
const DEFAULTS = { target: '', fps: 25, brightness: 100, color1: 'ff2a2a', color2: '2a7bff', name1: '', name2: '',
    maxPlayers: 16, lobbySecs: 20, roundSecs: 30, strength: 'normal', cpu: 'normal' };
const STRENGTH = { easy: 0.6, normal: 1, hard: 1.6 };     // taps needed: hard asks for more
const CPU = { off: 0, easy: 3.5, normal: 5, hard: 6.5 };    // the computer's taps a second
const MAX_BATCH = 8, BATCH_MS = 250;                       // a phone sends its taps in batches; more than ~30 a second do not count

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    s.color1 = hex(raw.color1, s.color1);
    s.color2 = hex(raw.color2, s.color2);
    for (const k of ['name1', 'name2']) if (typeof raw[k] === 'string') s[k] = cleanName(raw[k], '');
    s.maxPlayers = num(raw.maxPlayers, 2, 40, s.maxPlayers);
    s.lobbySecs = num(raw.lobbySecs, 5, 120, s.lobbySecs);
    s.roundSecs = num(raw.roundSecs, 10, 120, s.roundSecs);
    if (STRENGTH[raw.strength]) s.strength = raw.strength;
    if (raw.cpu in CPU) s.cpu = raw.cpu;
    return s;
}

const COUNT_MS = 3000, END_MS = 10000;

export const END_TEXTS = {"endWinText": "{winner} wins!", "endLoseText": "The computer wins!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    static startTypes = ['new'];
    statusMs = 250;

    constructor(s) { this.s = s; this.id = 0; this.reset(); }

    reset() {
        this.phase = 'idle';
        this.players = [];          // { id, name, team, taps, left, last }
        this.pos = 0;               // the knot: -1 is team 1's line (left), +1 team 2's (right)
        this.t0 = 0; this.until = 0; this.reason = ''; this.winner = 0; this.cpuTeam = 0; this.lastStep = 0; this.pull = [0, 0];
    }

    /** a team's name: the one in the settings, or its colour ("Red team") */
    teamName(t) {
        const n = t === 1 ? this.s.name1 : this.s.name2;
        if (n) return n;
        const c = colourName(this.teamColor(t)) || (t === 1 ? 'first' : 'second');
        return c[0].toUpperCase() + c.slice(1) + ' team';
    }
    teamColor(t) { return t === 1 ? this.s.color1 : this.s.color2; }
    team(t) { return this.players.filter((p) => p.team === t && !p.left); }

    /** the team with fewer players (team 1 when equal) */
    smaller() { return this.team(1).length <= this.team(2).length ? 1 : 2; }

    handle(client, d, now) {
        const me = this.players.find((p) => p.id === client);
        const want = d.team === 1 || d.team === 2 ? d.team : 0;
        if (d.type === 'new') {
            if (this.phase !== 'idle' && this.phase !== 'over') return 'A game is already on. Wait for it to end.';
            this.reset();
            this.id += 1;
            this.players = [{ id: client, name: cleanName(d.name, 'Player 1'), team: want || 1, taps: 0, left: false, last: 0 }];
            this.phase = 'lobby';
            this.until = now + this.s.lobbySecs * 1000;
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'lobby') return 'The game has started; join the next one.';
            if (me) { if (want) me.team = want; return ''; }
            if (this.players.length >= this.s.maxPlayers) return 'The game is full.';
            this.players.push({ id: client, name: cleanName(d.name, 'Player ' + (this.players.length + 1)), team: want || this.smaller(), taps: 0, left: false, last: 0 });
            return '';
        }
        if (!me) return d.type === 'pull' ? 'You are watching this game.' : '';
        if (d.type === 'team') {
            if (this.phase === 'lobby' && want) me.team = want;
            return '';
        }
        if (d.type === 'start') {
            if (this.phase === 'lobby' && me === this.players[0]) this.begin(now);
            return '';
        }
        if (d.type === 'pull') {
            if (this.phase !== 'pull' || d.game !== this.id) return '';
            const n = Number.isInteger(d.n) ? Math.max(0, Math.min(MAX_BATCH, d.n)) : 0;
            if (now - me.last < BATCH_MS * 0.6) return '';     // too often: the batch does not count
            me.last = now; me.taps += n;
            this.pull[me.team - 1] += n;
            return '';
        }
        if (d.type === 'quit') {
            if (me === this.players[0] && this.phase !== 'over') this.finish(0, 'The game was stopped.', now);
            else me.left = true;
        }
        return '';
    }

    begin(now) {
        const a = this.team(1).length, b = this.team(2).length;
        if (!a && !b) { this.reset(); return; }
        this.cpuTeam = CPU[this.s.cpu] && (!a || !b) ? (a ? 2 : 1) : 0;
        if (!this.cpuTeam && (!a || !b)) {      // no computer: everybody on one side, so split them
            const all = this.players.filter((p) => !p.left);
            if (all.length < 2) { this.cpuTeam = a ? 2 : 1; }
            else all.forEach((p, i) => { p.team = 1 + (i % 2); });
        }
        this.phase = 'count'; this.t0 = now; this.until = now + COUNT_MS;
    }

    finish(winner, reason, now) { this.phase = 'over'; this.winner = winner; this.reason = reason; this.t0 = now; this.until = now + END_MS; }

    /** what happened, for the ending: a team won; if it was the computer's, the players lost */
    outcome() {
        if (this.reason && !this.winner) return null;
        if (!this.winner) return null;      // a draw
        if (this.winner === this.cpuTeam) return { kind: 'lose', vars: { winner: 'The computer', colour: colourName(this.teamColor(this.winner)), score: Math.round(Math.abs(this.pos) * 100) } };
        return { kind: 'win', vars: { winner: this.teamName(this.winner), colour: colourName(this.teamColor(this.winner)), score: Math.round(Math.abs(this.pos) * 100) } };
    }

    step(now) {
        if (this.phase === 'idle') return;
        if (this.phase === 'pull') {
            const dt = Math.min(0.2, (now - (this.lastStep || now)) / 1000);
            this.lastStep = now;
            if (this.cpuTeam) this.pull[this.cpuTeam - 1] += CPU[this.s.cpu] * dt * (0.75 + 0.5 * Math.random());
            // each team's pull: its taps per player; the knot moves by the difference
            const n1 = this.cpuTeam === 1 ? 1 : Math.max(1, this.team(1).length), n2 = this.cpuTeam === 2 ? 1 : Math.max(1, this.team(2).length);
            const k = 0.025 / STRENGTH[this.s.strength];
            this.pos += (this.pull[1] / n2 - this.pull[0] / n1) * k;
            this.pull = [0, 0];
            if (this.pos <= -1) { this.pos = -1; this.finish(1, '', now); return; }
            if (this.pos >= 1) { this.pos = 1; this.finish(2, '', now); return; }
            if (now >= this.until) {
                const w = Math.abs(this.pos) < 0.02 ? 0 : this.pos < 0 ? 1 : 2;
                this.finish(w, w ? '' : 'A draw! Nobody moved the rope.', now);
            }
            return;
        }
        if (now <= this.until) return;
        if (this.phase === 'lobby') this.begin(now);
        else if (this.phase === 'count') { this.phase = 'pull'; this.t0 = now; this.lastStep = now; this.until = now + this.s.roundSecs * 1000; this.pull = [0, 0]; }
        else if (this.phase === 'over') this.reset();
    }

    message() {
        const n1 = this.team(1).length, n2 = this.team(2).length;
        if (this.phase === 'idle') return 'Start a tug of war!';
        if (this.phase === 'lobby') return `${this.teamName(1)}: ${n1} · ${this.teamName(2)}: ${n2}. Join now!`;
        if (this.phase === 'count') return 'Get ready to pull…';
        if (this.phase === 'pull') return 'PULL! Tap as fast as you can!';
        if (this.reason) return this.reason;
        if (this.winner === this.cpuTeam) return 'The computer wins! Try again?';
        return `${this.teamName(this.winner)} wins!`;
    }

    status() {
        return { game: this.id, until: this.until, maxPlayers: this.s.maxPlayers, pos: Math.round(this.pos * 1000) / 1000, winner: this.winner, cpu: this.cpuTeam,
            teams: [[this.teamName(1), this.s.color1], [this.teamName(2), this.s.color2]], cpuOn: CPU[this.s.cpu] > 0, batchMs: BATCH_MS, maxBatch: MAX_BATCH,
            players: this.players.map((p) => ({ id: p.id, name: p.name, team: p.team, taps: p.taps, left: p.left })) };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        const c1 = hexRgb(this.s.color1), c2 = hexRgb(this.s.color2);
        const kx = Math.round((w - 1) / 2 + this.pos * (w - 1) / 2 * 0.86);     // the knot's column
        const line1 = Math.round((w - 1) / 2 - (w - 1) / 2 * 0.86), line2 = Math.round((w - 1) / 2 + (w - 1) / 2 * 0.86);
        const ry = Math.floor(h / 2), rh = Math.max(1, Math.floor(h / 8));
        if (this.phase === 'lobby') {           // the two colours breathing, a dot for each player on their side
            const b = 0.25 + 0.15 * Math.sin(t * 3);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, x < w / 2 ? c1 : c2, b);
            this.team(1).forEach((_, i) => set(1 + (i % Math.max(1, Math.floor(w / 2) - 1)), h - 2 - Math.floor(i / Math.max(1, Math.floor(w / 2) - 1)), [255, 255, 255]));
            this.team(2).forEach((_, i) => set(w - 2 - (i % Math.max(1, Math.floor(w / 2) - 1)), h - 2 - Math.floor(i / Math.max(1, Math.floor(w / 2) - 1)), [255, 255, 255]));
            return;
        }
        // the field: each side lit in its colour up to the knot, the two lines, the rope and the knot
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, x < kx ? c1 : c2, 0.18);
        for (let y = 0; y < h; y++) { set(line1, y, c1, 0.8); set(line2, y, c2, 0.8); }
        const wob = this.phase === 'pull' ? Math.sin(t * 20) * 0.5 : 0;
        for (let x = 0; x < w; x++) for (let i = 0; i < rh; i++) set(x, ry - Math.floor(rh / 2) + i + (x % 4 === 0 ? Math.round(wob) : 0), [200, 150, 80]);
        for (let i = -rh; i <= rh; i++) for (let j = -1; j <= 1; j++) set(kx + j, ry + i, [255, 255, 255]);
        if (this.phase === 'count') {
            const n = 3 - Math.floor((now - this.t0) / 1000), sc = Math.max(1, Math.floor(Math.min(w / 2, h) / 16));
            if (n > 0) bigGlyph({ px: (x, y, c) => set(x, y, c) }, String(n), Math.floor(w / 2), Math.floor(h / 2), sc, [255, 255, 255]);
        } else if (this.phase === 'over' && this.winner) {      // the winner's colour sparkling over its side
            const c = this.winner === 1 ? c1 : c2;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
                if (((x * 7919 + y * 104729 + Math.floor(t * 10) * 31) % 7) === 0) set(x, y, c);
        }
    }
}
