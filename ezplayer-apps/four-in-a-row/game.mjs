// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/** Four in a Row: the rules, the computer and the drawing, with nothing about the player's API (that is player.mjs). */

import { cleanEnd, colourName } from './ending.mjs';
import { hexRgb, hsv, painter, cleanName, num, hex, pick } from './player.mjs';

export const COLS = 7, ROWS = 6;
export const LEVELS = ['easy', 'normal', 'hard'];
export const minSize = { w: 7, h: 7 };
const DEFAULTS = { target: '', fps: 15, brightness: 100, color1: 'ff2a2a', color2: 'ffd23f', colorBoard: '0028a0',
    cpu: true, friend: true, levels: [...LEVELS], turnSecs: 45, waitSecs: 90, partySecs: 8 };

function cleanGame(raw) {
    const s = { ...DEFAULTS, levels: [...DEFAULTS.levels] };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    for (const k of ['color1', 'color2', 'colorBoard']) s[k] = hex(raw[k], s[k]);
    for (const k of ['cpu', 'friend']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (!s.cpu && !s.friend) s.cpu = true;
    if (Array.isArray(raw.levels)) { const l = LEVELS.filter((x) => raw.levels.includes(x)); if (l.length) s.levels = l; }
    s.turnSecs = num(raw.turnSecs, 10, 120, s.turnSecs);
    s.waitSecs = num(raw.waitSecs, 15, 300, s.waitSecs);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    return s;
}

const LINES = (() => {
    const out = [];
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
                const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
                if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) out.push(cells.map(([rr, cc]) => rr * COLS + cc));
            }
    return out;
})();

export function dropRow(b, col) {
    for (let r = ROWS - 1; r >= 0; r--) if (b[r * COLS + col] === 0) return r;
    return -1;
}

export function winnerOf(b) {
    for (const l of LINES) { const v = b[l[0]]; if (v && b[l[1]] === v && b[l[2]] === v && b[l[3]] === v) return { v, line: l }; }
    return null;
}

function score(b, me) {
    const op = 3 - me;
    let s = 0;
    for (let r = 0; r < ROWS; r++) { const v = b[r * COLS + 3]; s += v === me ? 3 : v === op ? -3 : 0; }
    for (const l of LINES) {
        let m = 0, o = 0;
        for (const i of l) { if (b[i] === me) m++; else if (b[i] === op) o++; }
        if (o === 0 && m < 4) s += [0, 1, 3, 9][m];
        else if (m === 0 && o < 4) s -= [0, 1, 3, 12][o];
    }
    return s;
}

function negamax(b, depth, me, alpha, beta) {
    const w = winnerOf(b);
    if (w) return w.v === me ? 10000 + depth : -(10000 + depth);
    const moves = [3, 2, 4, 1, 5, 0, 6].filter((c) => b[c] === 0);
    if (!moves.length) return 0;
    if (depth === 0) return score(b, me);
    let best = -1e9;
    for (const c of moves) {
        const i = dropRow(b, c) * COLS + c;
        b[i] = me;
        const v = -negamax(b, depth - 1, 3 - me, -beta, -alpha);
        b[i] = 0;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
    }
    return best;
}

/** the computer's column: easy looks 1 move ahead (and makes mistakes), normal 3, hard 5 */
export function cpuMove(b, me, level) {
    const moves = [...Array(COLS).keys()].filter((c) => b[c] === 0);
    if (!moves.length) return -1;
    if (level === 'easy' && Math.random() < 0.4) return pick(moves);
    const depth = { easy: 1, normal: 3, hard: 5 }[level] ?? 3;
    const scores = new Map();
    for (const c of moves) {
        const bb = b.slice();
        bb[dropRow(bb, c) * COLS + c] = me;
        scores.set(c, -negamax(bb, depth - 1, 3 - me, -1e9, 1e9));
    }
    const top = Math.max(...scores.values());
    return pick(moves.filter((c) => scores.get(c) >= top - (level === 'hard' ? 0 : 2)));
}

export const END_TEXTS = {"endWinText": "{winner} wins!", "endLoseText": "The computer wins!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.reset(); }

    reset() {
        this.phase = 'idle';
        this.b = Array(COLS * ROWS).fill(0);
        this.players = [];
        this.mode = ''; this.level = '';
        this.turn = 0; this.n = 0;
        this.last = -1; this.lastAt = 0;
        this.winner = 0; this.line = null; this.reason = '';
        this.turnEndsAt = null; this.waitEndsAt = null; this.finishedAt = 0; this.cpuAt = 0;
    }

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
            if (mode === 'cpu') {
                this.level = this.s.levels.includes(d.level) ? d.level : this.s.levels.includes('normal') ? 'normal' : this.s.levels[0];
                this.players.push({ id: 'cpu', name: 'Computer' });
                this.start(now);
            } else {
                this.phase = 'waiting';
                this.waitEndsAt = now + this.s.waitSecs * 1000;
            }
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'waiting') return 'There is no game waiting for a friend.';
            if (me >= 0) return 'You are already in this game. Ask a friend to join from their phone.';
            this.players.push({ id: client, name: cleanName(d.name, 'Player 2') });
            this.start(now);
            return '';
        }
        if (d.type === 'quit') {
            if (me < 0) return '';
            if (this.phase === 'waiting') this.reset();
            else if (this.phase === 'playing') this.finish(2 - me, `${this.players[me].name} left the game.`, now);
            return '';
        }
        if (d.type === 'move') {
            if (this.phase !== 'playing' || d.game !== this.id) return 'This game is over.';
            if (me < 0) return 'You are watching this game.';
            if (me !== this.turn) return 'It is not your turn.';
            if (Number.isInteger(d.n) && d.n !== this.n) return 'It is not your turn.';   // a move made for an older board (late or sent twice)
            if (!Number.isInteger(d.col) || d.col < 0 || d.col >= COLS) return 'Pick a column.';
            if (dropRow(this.b, d.col) < 0) return 'That column is full.';
            this.play(d.col, now);
            return '';
        }
        return '';
    }

    start(now) { this.phase = 'playing'; this.turn = 0; this.waitEndsAt = null; this.turnEndsAt = now + this.s.turnSecs * 1000; }

    play(col, now) {
        const r = dropRow(this.b, col);
        this.b[r * COLS + col] = this.turn + 1;
        this.last = r * COLS + col; this.lastAt = now; this.n += 1;
        const w = winnerOf(this.b);
        if (w) { this.line = w.line; this.finish(w.v, '', now); return; }
        if (this.b.slice(0, COLS).every((v) => v)) { this.finish(3, 'The board is full: a draw!', now); return; }
        this.turn = 1 - this.turn;
        this.turnEndsAt = now + this.s.turnSecs * 1000;
        this.cpuAt = this.mode === 'cpu' && this.turn === 1 ? now + 900 + Math.random() * 700 : 0;
    }

    finish(winner, reason, now) {
        this.phase = 'finished'; this.winner = winner; this.reason = reason;
        this.turnEndsAt = null; this.finishedAt = now; this.cpuAt = 0;
    }

    /** what happened, for the ending (a sound, the words, a machine): null for a draw */
    outcome() {
        if (!this.winner || this.winner === 3) return null;
        const p = this.players[this.winner - 1];
        if (!p) return null;
        const colour = colourName(this.winner === 1 ? this.s.color1 : this.s.color2);
        return p.id === 'cpu' ? { kind: 'lose', vars: { winner: 'The computer', colour, score: '' } } : { kind: 'win', vars: { winner: p.name, colour, score: '' } };
    }

    step(now) {
        if (this.phase === 'waiting' && now > this.waitEndsAt) this.reset();
        else if (this.phase === 'playing') {
            if (this.cpuAt && now >= this.cpuAt) { this.cpuAt = 0; this.play(cpuMove(this.b.slice(), 2, this.level), now); }
            else if (now > this.turnEndsAt) this.finish(2 - this.turn, `${this.players[this.turn]?.name} ran out of time.`, now);
        } else if (this.phase === 'finished' && now - this.finishedAt > this.s.partySecs * 1000) this.reset();
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for a friend to join.`;
        if (this.phase === 'playing') return this.players[this.turn]?.id === 'cpu' ? 'The computer is thinking...' : `${this.players[this.turn]?.name}'s turn.`;
        if (this.winner === 3) return this.reason;
        return `${this.players[this.winner - 1]?.name} wins!${this.reason ? ' ' + this.reason : ''}`;
    }

    status() {
        const s = this.s;
        return { game: this.id, mode: this.mode, level: this.level, board: this.b.join(''), turn: this.turn, n: this.n, last: this.last,
            players: this.players.map((p) => ({ id: p.id, name: p.name })), turnEndsAt: this.turnEndsAt, waitEndsAt: this.waitEndsAt,
            winner: this.winner, line: this.line, colors: [s.color1, s.color2], cpu: s.cpu, friend: s.friend, levels: s.levels };
    }

    /** 7 x 6 discs as big as fit, a strip on top in the colour of whose turn it is, the last disc falling in */
    render(out, w, h, now) {
        const set = painter(out, w, h);
        const c1 = hexRgb(this.s.color1), c2 = hexRgb(this.s.color2), cb = hexRgb(this.s.colorBoard);
        const t = now / 1000;
        if (this.phase === 'finished' && now - this.finishedAt > 3000) {      // the party
            const col = this.winner === 1 ? c1 : this.winner === 2 ? c2 : null;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
                set(x, y, col ?? hsv(((x + y) / (w + h) - t * 0.5) % 1 + 1, 1, 1), col ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((x + y) * 0.5 - t * 8)) : 1);
            return;
        }
        const cell = Math.max(1, Math.min(Math.floor(w / COLS), Math.floor((h - 1) / (ROWS + 1))));
        const bw = cell * COLS, bh = cell * ROWS;
        const strip = Math.max(1, Math.min(cell, h - bh));
        const ox = Math.floor((w - bw) / 2), oy = Math.floor((h - bh - strip) / 2) + strip;
        const frameC = this.phase === 'finished' ? (this.winner < 3 ? hsv((t * 0.4) % 1, 1, 0.6) : [60, 60, 60]) : cb;
        let sc = [0, 0, 0], sk = 1;
        if (this.phase === 'waiting') sc = Math.floor(t * 2) % 2 ? c1 : c2;
        else if (this.phase === 'playing') { sc = this.turn ? c2 : c1; sk = 0.55 + 0.45 * Math.sin(t * 5); }
        else if (this.winner === 1 || this.winner === 2) sc = this.winner === 1 ? c1 : c2;
        for (let y = oy - strip; y < oy; y++) for (let x = ox + Math.floor(bw / 2) - cell; x < ox + Math.floor(bw / 2) + cell; x++) set(x, y, sc, sk);
        const disc = (x0, y0, col, onlyDisc) => {
            if (cell <= 2) { for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) set(x0 + dx, y0 + dy, col); return; }
            const rad = cell * 0.42;
            for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
                const inside = (dx + 0.5 - cell / 2) ** 2 + (dy + 0.5 - cell / 2) ** 2 <= rad * rad;
                if (inside) set(x0 + dx, y0 + dy, col); else if (!onlyDisc) set(x0 + dx, y0 + dy, frameC);
            }
        };
        const empty = [0, 0, 25];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const i = r * COLS + c, v = this.b[i];
            let col = v ? (v === 1 ? c1 : c2) : empty;
            const falling = i === this.last && now - this.lastAt < 350;
            if (this.phase === 'finished' && this.line?.includes(i) && Math.floor(t * 3) % 2) col = [255, 255, 255];
            disc(ox + c * cell, oy + r * cell, falling ? empty : col, false);
            if (falling) disc(ox + c * cell, oy + Math.floor((now - this.lastAt) / 350 * r) * cell, col, true);
        }
    }
}
