// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Tic-tac-toe: the rules and the drawing, with nothing about the player's API, so the same game can be moved to
 * another way of talking to the phones (ShowPlay's ntfy.sh bridge, for example) by changing only tictactoe.mjs.
 */

export const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];
export const LEVELS = ['easy', 'normal', 'hard'];
export const DEFAULTS = {
    target: '',
    fps: 15,
    brightness: 100,
    colorX: 'ff2a2a',
    colorO: '2a7bff',
    colorGrid: 'ffffff',
    cpu: true,
    friend: true,
    levels: [...LEVELS],
    turnSecs: 30,
    waitSecs: 60,
    partySecs: 8,
};
const PARTY_MIN = 3;

/** Settings as saved by the config page, every field checked and defaulted. */
export function cleanSettings(raw) {
    const s = { ...DEFAULTS, levels: [...DEFAULTS.levels] };
    if (!raw || typeof raw !== 'object') return s;
    const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
    const hex = (v, d) => {
        const c = String(v ?? '').replace(/^#/, '').toLowerCase();
        return /^[0-9a-f]{6}$/.test(c) ? c : d;
    };
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    s.colorX = hex(raw.colorX, s.colorX);
    s.colorO = hex(raw.colorO, s.colorO);
    s.colorGrid = hex(raw.colorGrid, s.colorGrid);
    if (typeof raw.cpu === 'boolean') s.cpu = raw.cpu;
    if (typeof raw.friend === 'boolean') s.friend = raw.friend;
    if (!s.cpu && !s.friend) s.cpu = true;
    if (Array.isArray(raw.levels)) {
        const l = LEVELS.filter((x) => raw.levels.includes(x));
        if (l.length) s.levels = l;
    }
    s.turnSecs = num(raw.turnSecs, 10, 120, s.turnSecs);
    s.waitSecs = num(raw.waitSecs, 15, 300, s.waitSecs);
    s.partySecs = num(raw.partySecs, PARTY_MIN, 30, s.partySecs);
    return s;
}

export function winnerOf(board) {
    for (const l of LINES) {
        const [a, b, c] = l;
        if (board[a] !== '.' && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line: l };
    }
    return board.includes('.') ? null : { mark: 'draw', line: null };
}

/** The computer's move: easy is random (but takes a win), normal wins or blocks, hard never loses. */
export function cpuMove(board, me, level, rnd = Math.random) {
    const you = me === 'X' ? 'O' : 'X';
    const free = [...board].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);
    if (!free.length) return -1;
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const finishing = (mark) => free.filter((i) => winnerOf(board.slice(0, i) + mark + board.slice(i + 1))?.mark === mark);
    const win = finishing(me);
    if (win.length) return pick(win);
    if (level === 'easy') return pick(free);
    const block = finishing(you);
    if (block.length) return pick(block);
    if (level === 'normal') {
        if (board[4] === '.' && rnd() < 0.6) return 4;
        return pick(free);
    }
    // hard: minimax, a random choice among the best moves so it does not always play the same game
    const score = (b, turn, depth) => {
        const w = winnerOf(b);
        if (w) return w.mark === me ? 10 - depth : w.mark === you ? depth - 10 : 0;
        const vals = [];
        for (let i = 0; i < 9; i++) if (b[i] === '.') vals.push(score(b.slice(0, i) + turn + b.slice(i + 1), turn === 'X' ? 'O' : 'X', depth + 1));
        return turn === me ? Math.max(...vals) : Math.min(...vals);
    };
    let best = -Infinity;
    let moves = [];
    for (const i of free) {
        const v = score(board.slice(0, i) + me + board.slice(i + 1), you, 1);
        if (v > best) { best = v; moves = [i]; } else if (v === best) moves.push(i);
    }
    return pick(moves);
}

const clean = (name) => String(name ?? '').replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, 16);

/**
 * One game at a time. Phases: idle, waiting (for a friend), playing, finished (a short party on the lights).
 * Players are { id, name, mark }; id is the phone's client id, or "cpu".
 */
export class Game {
    constructor(settings) {
        this.s = settings;
        this.reset();
        this.id = 0;
    }

    reset() {
        this.phase = 'idle';
        this.board = '.........';
        this.players = [];
        this.mode = '';
        this.level = '';
        this.turn = 'X';
        this.turnEndsAt = null;
        this.waitEndsAt = null;
        this.winner = null;
        this.line = null;
        this.reason = '';
        this.lastMove = -1;
        this.lastMoveAt = 0;
        this.finishedAt = 0;
        this.cpuAt = 0;
    }

    player(id) {
        return this.players.find((p) => p.id === id) ?? null;
    }

    /** a phone asks for a new game; returns '' or why not */
    open(client, data, now) {
        if (this.phase === 'waiting' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
        const mode = data?.mode === 'friend' ? 'friend' : 'cpu';
        if (mode === 'cpu' && !this.s.cpu) return 'Playing the computer is switched off.';
        if (mode === 'friend' && !this.s.friend) return 'Playing a friend is switched off.';
        const level = this.s.levels.includes(data?.level) ? data.level : this.s.levels.includes('normal') ? 'normal' : this.s.levels[0];
        this.reset();
        this.id += 1;
        this.mode = mode;
        this.players = [{ id: client, name: clean(data?.name) || 'Player 1', mark: 'X' }];
        if (mode === 'cpu') {
            this.level = level;
            this.players.push({ id: 'cpu', name: 'Computer', mark: 'O' });
            this.start(now);
        } else {
            this.phase = 'waiting';
            this.waitEndsAt = now + this.s.waitSecs * 1000;
        }
        return '';
    }

    join(client, data, now) {
        if (this.phase !== 'waiting') return 'There is no game waiting for a friend.';
        if (this.player(client)) return 'You are already in this game. Ask a friend to join from their phone.';
        this.players.push({ id: client, name: clean(data?.name) || 'Player 2', mark: 'O' });
        this.start(now);
        return '';
    }

    start(now) {
        this.phase = 'playing';
        this.turn = 'X';
        this.waitEndsAt = null;
        this.turnEndsAt = now + this.s.turnSecs * 1000;
        this.cpuAt = 0;
    }

    move(client, cell, gameId, now) {
        if (this.phase !== 'playing' || gameId !== this.id) return 'This game is over.';
        const p = this.player(client);
        if (!p) return 'You are watching this game.';
        if (p.mark !== this.turn) return "It is not your turn.";
        if (!Number.isInteger(cell) || cell < 0 || cell > 8 || this.board[cell] !== '.') return 'That square is taken.';
        this.place(cell, now);
        return '';
    }

    place(cell, now) {
        this.board = this.board.slice(0, cell) + this.turn + this.board.slice(cell + 1);
        this.lastMove = cell;
        this.lastMoveAt = now;
        const w = winnerOf(this.board);
        if (w) {
            this.finish(w.mark, w.line, w.mark === 'draw' ? 'A draw!' : '', now);
            return;
        }
        this.turn = this.turn === 'X' ? 'O' : 'X';
        this.turnEndsAt = now + this.s.turnSecs * 1000;
        this.cpuAt = this.mode === 'cpu' && this.turn === 'O' ? now + 700 + Math.random() * 600 : 0;
    }

    quit(client, now) {
        const p = this.player(client);
        if (!p) return;
        if (this.phase === 'waiting') this.reset();
        else if (this.phase === 'playing') this.finish(p.mark === 'X' ? 'O' : 'X', null, `${p.name} left the game.`, now);
    }

    finish(mark, line, reason, now) {
        this.phase = 'finished';
        this.winner = mark;
        this.line = line;
        this.reason = reason;
        this.turnEndsAt = null;
        this.finishedAt = now;
        this.cpuAt = 0;
    }

    /** the game clock: the computer's move, time running out, the waiting room and the party ending */
    step(now) {
        if (this.phase === 'waiting' && now > this.waitEndsAt) this.reset();
        else if (this.phase === 'playing') {
            if (this.cpuAt && now >= this.cpuAt) {
                this.cpuAt = 0;
                const c = cpuMove(this.board, 'O', this.level);
                if (c >= 0) this.place(c, now);
            } else if (now > this.turnEndsAt) {
                const p = this.players.find((x) => x.mark === this.turn);
                this.finish(this.turn === 'X' ? 'O' : 'X', null, `${p?.name ?? 'A player'} ran out of time.`, now);
            }
        } else if (this.phase === 'finished' && now - this.finishedAt > this.s.partySecs * 1000) this.reset();
    }

    message() {
        if (this.phase === 'idle') return 'Start a game!';
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for a friend to join.`;
        if (this.phase === 'playing') {
            const p = this.players.find((x) => x.mark === this.turn);
            return p?.id === 'cpu' ? 'The computer is thinking...' : `${p?.name}'s turn (${this.turn}).`;
        }
        if (this.winner === 'draw') return this.reason || 'A draw!';
        const w = this.players.find((x) => x.mark === this.winner);
        return `${w?.name ?? this.winner} wins!${this.reason ? ' ' + this.reason : ''}`;
    }
}

// ---- Drawing on a grid of lights ----

const hexRgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

function hsv(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6].map((x) => x * 255);
}

/**
 * Paints the board into a w x h RGB frame: the largest square that fits, centred; a bar above and below in the colour
 * of whose turn it is (when there is room); marks that grow in, the winning line blinking, then a short party.
 */
export function render(out, w, h, game, s, now) {
    out.fill(0);
    const bright = s.brightness / 100;
    const cX = hexRgb(s.colorX), cO = hexRgb(s.colorO), cG = hexRgb(s.colorGrid);
    const set = (x, y, c, k = 1) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const o = (y * w + x) * 3;
        out[o] = Math.min(255, c[0] * k * bright);
        out[o + 1] = Math.min(255, c[1] * k * bright);
        out[o + 2] = Math.min(255, c[2] * k * bright);
    };
    const finished = game.phase === 'finished';
    const tAfter = finished ? now - game.finishedAt : 0;
    if (finished && tAfter > 2500) {                         // the party: the winner's colour, or a rainbow for a draw
        const col = game.winner === 'X' ? cX : game.winner === 'O' ? cO : null;
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const wave = 0.5 + 0.5 * Math.sin((x + y) * 0.5 - now / 120);
                set(x, y, col ?? hsv(((x + y) / (w + h) - now / 2000) % 1 + 1, 1, 1), col ? 0.25 + 0.75 * wave : 1);
            }
        return;
    }
    const S = Math.min(w, h);
    const ox = Math.floor((w - S) / 2), oy = Math.floor((h - S) / 2);
    const t = Math.max(1, Math.round(S / 22));               // grid line thickness
    const cell = (S - 2 * t) / 3;
    const pulse = game.phase === 'waiting' ? 0.35 + 0.35 * Math.sin(now / 300) ** 2 : 0.45;
    for (let k = 1; k <= 2; k++) {                           // the grid
        const p = Math.round(k * cell + (k - 1) * t);
        for (let a = 0; a < S; a++)
            for (let d = 0; d < t; d++) {
                set(ox + p + d, oy + a, cG, pulse);
                set(ox + a, oy + p + d, cG, pulse);
            }
    }
    if (game.phase === 'playing' && oy >= 2) {               // whose turn: bars above and below the board
        const col = game.turn === 'X' ? cX : cO;
        const k = 0.35 + 0.35 * Math.sin(now / 250) ** 2;
        const bh = Math.min(oy - 1, Math.max(1, Math.round(S / 10)));
        for (let y = 0; y < bh; y++)
            for (let x = 0; x < w; x++) {
                set(x, oy - 1 - y - 1, col, k);
                set(x, oy + S + y + 1, col, k);
            }
    }
    const lineOn = finished && game.line && Math.floor(now / 250) % 2 === 0;
    for (let i = 0; i < 9; i++) {
        const m = game.board[i];
        if (m === '.') continue;
        const col = m === 'X' ? cX : cO;
        const x0 = ox + Math.round((i % 3) * (cell + t)), y0 = oy + Math.round(Math.floor(i / 3) * (cell + t));
        const cs = Math.floor(cell);
        const grow = i === game.lastMove ? Math.min(1, (now - game.lastMoveAt) / 300) : 1;
        let k = 1;
        if (finished && game.line && !game.line.includes(i)) k = 0.25;
        const c = lineOn && game.line.includes(i) ? [255, 255, 255] : col;
        const pad = Math.max(1, Math.round(cs * 0.15)), size = (cs - 2 * pad) * grow;
        const cx = x0 + (cs - 1) / 2, cy = y0 + (cs - 1) / 2;
        const thick = Math.max(0.5, cs / 16);
        for (let y = y0; y < y0 + cs; y++)
            for (let x = x0; x < x0 + cs; x++) {
                const dx = x - cx, dy = y - cy;
                let on;
                if (m === 'X') on = Math.abs(dx) <= size / 2 && Math.abs(dy) <= size / 2 && (Math.abs(dx - dy) <= thick || Math.abs(dx + dy) <= thick);
                else { const r = Math.hypot(dx, dy); on = r <= size / 2 + 0.3 && r >= size / 2 - Math.max(0.9, cs / 9); }
                if (on) set(x, y, c, k);
            }
    }
}
