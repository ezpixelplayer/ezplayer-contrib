// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Slice the treats: Christmas treats (baubles, candy canes, gingerbread men, presents, now and then a golden star) are
 * thrown up from the bottom of a matrix of the show, and the visitor slices them by swiping on the phone, where the
 * swipe pad stands for the matrix. Lumps of coal fly too: slicing one costs a life. Alone, or two phones slicing the
 * same treats (the most points wins). The game ends when the time is up or the lives are gone.
 *
 * A swipe takes a moment to reach the player, so it is checked against where the treats were during the last
 * moments too (LAG_MS), with a generous reach: what the visitor saw on the lights is what they can slice.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { painter, cleanName, num, hex, hexRgb } from './player.mjs';
import { THEME } from './theme.mjs';
import { drawSprite } from './sprites.mjs';

export const minSize = { w: 8, h: 8 };
const LAG_MS = 700;               // how far back a swipe is checked (the time for a swipe to reach the player)
const COAL_LAG_MS = 400;          // for coal: only around where it was about a moment ago (strict)
const KINDS = THEME.kinds ?? ['bauble', 'cane', 'ginger', 'present'];   // a theme pack: its own (pictures of sprites.mjs)
const COLS = [[255, 40, 40], [40, 120, 255], [60, 220, 90], [255, 95, 200], [160, 90, 255], [255, 140, 26], [60, 240, 255]];
const GOLD = [255, 200, 60];
// gravity (heights per second²), how often treats are thrown (seconds), how likely coal is, how many at once at most
const LEVELS = {
    easy: { g: 0.55, every: 1.6, coal: 0.12, burst: 2 },
    normal: { g: 0.7, every: 1.25, coal: 0.18, burst: 3 },
    hard: { g: 0.9, every: 0.95, coal: 0.24, burst: 4 },
};
const DEFAULTS = { target: '', fps: 30, brightness: 100, level: 'normal', secs: 60, lives: 5, coal: true, stars: true, missLoses: false,
    friend: true, waitSecs: 60, partySecs: 6, color1: 'ff3c3c', color2: '3c8cff' };

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (LEVELS[raw.level]) s.level = raw.level;
    s.secs = num(raw.secs, 20, 300, s.secs);
    s.lives = num(raw.lives, 1, 9, s.lives);
    for (const k of ['coal', 'stars', 'missLoses', 'friend']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    s.waitSecs = num(raw.waitSecs, 15, 300, s.waitSecs);
    s.partySecs = num(raw.partySecs, 3, 30, s.partySecs);
    for (const k of ['color1', 'color2']) s[k] = hex(raw[k], s[k]);
    return s;
}

// the local date (not UTC, which turns the day in the evening in the Americas)
const day = (now) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** the distance from point (px, py) to the segment (ax, ay)-(bx, by), with x scaled by the matrix's shape */
function segDist(px, py, ax, ay, bx, by, sx) {
    const dx = (bx - ax) * sx, dy = by - ay, qx = (px - ax) * sx, qy = py - ay;
    const L = dx * dx + dy * dy, k = L ? Math.max(0, Math.min(1, (qx * dx + qy * dy) / L)) : 0;
    return Math.hypot(qx - k * dx, qy - k * dy);
}

export const END_TEXTS = {"endWinText": "{winner} wins!", "endLoseText": "Game over! {score} points", "endRecordText": "New record: {score}!"};
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

export class Game {
    constructor(s) { this.s = s; this.id = 0; this.statusMs = 200; this.w = 16; this.h = 16; this.best = []; this.bestDay = ''; this.reset(); }

    size(w, h) { this.w = w; this.h = h; }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.mode = '';
        this.score = [0, 0]; this.lives = 0; this.sliced = [0, 0];
        this.items = []; this.halves = []; this.trails = []; this.sparks = []; this.lastCut = [0, 0];
        this.started = 0; this.endsAt = 0; this.nextThrow = 0; this.last = 0; this.touched = [0, 0]; this.hurtAt = 0; this.seq = 0;
        this.winner = 0; this.reason = ''; this.until = 0; this.waitEndsAt = null; this.newBest = false;
    }

    L() { return LEVELS[this.s.level]; }
    /** a treat's size in pixels, and its radius as a part of the height */
    box() { return Math.max(2, Math.min(6, Math.round(Math.min(this.w, this.h) / 7))); }
    rad() { return this.box() / 2 / this.h; }
    aspect() { return this.w / this.h; }

    /** where a treat is at time t: thrown at t0 from (x0, y0) with speed (vx, vy); y grows downwards */
    at(it, t) { const d = (t - it.t0) / 1000; return [it.x0 + it.vx * d, it.y0 + it.vy * d + 0.5 * this.L().g * d * d]; }

    handle(client, d, now) {
        const me = this.players.findIndex((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase === 'waiting' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            const mode = d.mode === 'friend' ? 'friend' : 'solo';
            if (mode === 'friend' && !this.s.friend) return 'Playing with a friend is switched off.';
            this.reset();
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
            this.players.push({ id: client, name: cleanName(d.name, 'Player 2') });
            this.start(now);
            return '';
        }
        if (me < 0) return d.type === 'cut' ? 'You are watching this game.' : '';
        if (d.type === 'cut' && this.phase === 'playing') {
            this.touched[me] = now;
            const pts = Array.isArray(d.p) ? d.p.slice(0, 12).filter((q) => Array.isArray(q) && q.length === 2 && q.every((v) => typeof v === 'number' && Number.isFinite(v)))
                .map(([x, y]) => [Math.max(-0.1, Math.min(1.1, x)), Math.max(-0.1, Math.min(1.1, y))]) : [];
            if (pts.length >= 2 && now >= this.started) this.cut(me, pts, now);
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
        this.started = now + 2000; this.endsAt = this.started + this.s.secs * 1000; this.nextThrow = this.started; this.last = now;
        this.touched = [now, now]; this.lives = this.s.lives;
    }

    /** a swipe: every treat it crossed (now, or where it was a moment ago) is sliced */
    cut(p, pts, now) {
        // generous for treats (where they were during the last LAG_MS, with extra reach), strict for coal (only the
        // last moment, and only the coal itself), so a swipe near a lump of coal does not cost a life
        const sx = this.aspect(), reach = this.rad() + 0.07, coalReach = this.rad() * 0.8;
        this.trails.push({ pts, at: now, p });
        let n = 0, coal = false;
        for (const it of this.items) {
            if (it.cut) continue;
            let hit = false;
            const coalIt = it.kind === 'coal', back = coalIt ? COAL_LAG_MS : LAG_MS, r = coalIt ? coalReach : reach;
            for (let t = now - (coalIt ? COAL_LAG_MS / 2 : 0); t >= Math.max(it.t0, now - back) && !hit; t -= 40) {
                const [x, y] = this.at(it, t);
                for (let k = 1; k < pts.length && !hit; k++) if (segDist(x, y, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], sx) <= r) hit = true;
            }
            if (!hit) continue;
            it.cut = true;
            const [x, y] = this.at(it, now);
            if (it.kind === 'coal') { coal = true; this.sparks.push({ x, y, at: now, coal: true }); continue; }
            n += 1;
            this.score[p] += it.kind === 'star' ? 5 : 1;
            this.sliced[p] += 1;
            const [ax, ay] = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]];
            const side = Math.abs(ax) >= Math.abs(ay) * sx ? 'h' : 'v';   // a sideways swipe cuts top and bottom halves
            const vx = this.at(it, now + 1)[0] - x, vy = this.at(it, now + 1)[1] - y;
            for (const half of [0, 1]) {
                const push = (half ? 1 : -1) * 0.12;
                this.halves.push({ kind: it.kind, col: it.col, half, side, t0: now, x0: x, y0: y,
                    vx: vx * 1000 + (side === 'v' ? push : 0), vy: Math.min(vy * 1000, 0) * 0.5 + (side === 'h' ? push : -0.05) });
            }
            this.sparks.push({ x, y, at: now, col: it.kind === 'star' ? GOLD : it.col });
        }
        if (n > 1) this.score[p] += n - 1;                       // a combo: one more point for each extra treat in one swipe
        if (n > 0) this.lastCut[p] = n;
        // with a friend the lives are shared: coal takes 2 points off the one who sliced it instead (as in catch the
        // presents), so the leader cannot slice coal on purpose to end the game; the friend game ends when the time is up
        if (coal && this.players.length > 1) { this.score[p] = Math.max(0, this.score[p] - 2); this.hurtAt = now; }
        else if (coal) this.hurt(now);
    }

    hurt(now, miss) {
        if (!miss && now - this.hurtAt < 600) return;     // one swipe through coal: one life; every missed treat counts
        this.hurtAt = now;
        this.lives -= 1;
        if (this.lives <= 0) this.end(now, 'No lives left.');
    }

    end(now, why) {
        if (this.players.length > 1) { const [a, b] = this.score; this.finish(a === b ? 3 : a > b ? 1 : 2, why, now); }
        else this.finish(1, why, now);
    }

    finish(winner, reason, now) {
        this.phase = 'over'; this.winner = winner; this.reason = reason; this.until = now + this.s.partySecs * 1000;
        if (this.bestDay !== day(now)) { this.best = []; this.bestDay = day(now); }
        if (!winner) return;
        const top = this.best[0]?.score ?? 0;
        for (let p = 0; p < this.players.length; p++) {
            const sc = this.score[p];
            if (sc <= 0) continue;
            this.best.push({ name: this.players[p].name, score: sc });
            if (sc > top && sc === Math.max(...this.score)) this.newBest = true;
        }
        this.best.sort((a, b) => b.score - a.score); this.best = this.best.slice(0, 5);
    }

    progress(now) { return Math.max(0, Math.min(1, (now - this.started) / Math.max(1, this.endsAt - this.started))); }

    /** throws one to a few treats up from the bottom, so they peak somewhere in the top half */
    throwSome(now) {
        const L = this.L(), n = 1 + Math.floor(Math.random() * Math.min(L.burst, 1 + Math.floor(this.progress(now) * L.burst + 0.5)));
        for (let i = 0; i < n; i++) {
            const r = Math.random();
            const kind = this.s.coal && r < L.coal ? 'coal' : this.s.stars && r > 0.95 ? 'star' : KINDS[Math.floor(Math.random() * KINDS.length)];
            const x0 = 0.15 + Math.random() * 0.7, peak = 0.15 + Math.random() * 0.35;      // the highest point, from the top
            const y0 = 1 + this.rad() * 1.5, vy = -Math.sqrt(2 * L.g * (y0 - peak));
            const flight = 2 * -vy / L.g, x1 = Math.max(0.1, Math.min(0.9, x0 + (Math.random() - 0.5) * 0.6));
            this.items.push({ kind, col: COLS[Math.floor(Math.random() * COLS.length)], t0: now + i * 150, x0, y0, vx: (x1 - x0) / flight, vy, cut: false, id: ++this.seq });
        }
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
        if (this.phase === 'waiting' && now > this.waitEndsAt) { this.reset(); return; }
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'playing') return;
        this.last = now;
        if (this.touched.slice(0, this.players.length).every((t) => now - t > 45000)) { this.finish(0, 'Nobody was playing.', now); return; }
        if (now < this.started) return;
        if (now >= this.endsAt) { this.end(now, ''); return; }
        if (now >= this.nextThrow) {
            this.throwSome(now);
            this.nextThrow = now + this.L().every * (1 - 0.35 * this.progress(now)) * (0.7 + Math.random() * 0.6) * 1000;
        }
        const keep = [];
        for (const it of this.items) {
            if (it.cut) continue;
            const [, y] = this.at(it, now);
            if (now > it.t0 + 300 && y > 1 + this.rad() * 2 && this.at(it, now + 50)[1] > y) {   // fell back down
                if (this.s.missLoses && it.kind !== 'coal') this.hurt(now, true);
                if (this.phase !== 'playing') return;
                continue;
            }
            keep.push(it);
        }
        this.items = keep;
        this.halves = this.halves.filter((h) => now - h.t0 < 1500);
        this.trails = this.trails.filter((t) => now - t.at < 400);
        this.sparks = this.sparks.filter((s) => now - s.at < 500);
    }

    saveState() { return { best: this.best, day: this.bestDay }; }
    restore(st) {
        if (st && Array.isArray(st.best) && typeof st.day === 'string') {
            this.best = st.best.filter((b) => b && typeof b.name === 'string' && Number.isInteger(b.score)).slice(0, 5).map((b) => ({ name: cleanName(b.name, 'Player'), score: b.score }));
            this.bestDay = st.day;
        }
    }

    message() {
        if (this.phase === 'idle') return 'Slice the treats!';
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for a friend to join.`;
        if (this.phase === 'playing') return this.players.map((p, i) => `${p.name} ${this.score[i]}`).join('  ·  ');
        if (!this.winner) return this.reason;
        const why = this.reason && this.reason !== 'No lives left.' ? ' ' + this.reason : this.reason ? ' No lives left.' : '';
        if (this.players.length === 1) return `${this.players[0].name} sliced ${this.score[0]} point${this.score[0] === 1 ? '' : 's'}!${why}${this.newBest ? ' Best of the day! 🏆' : ''}`;
        if (this.winner === 3) return `A draw: ${this.score[0]} - ${this.score[1]}!`;
        return `${this.players[this.winner - 1]?.name} wins ${Math.max(...this.score)} - ${Math.min(...this.score)}!${why}${this.newBest ? ' Best of the day! 🏆' : ''}`;
    }

    status() {
        const s = this.s, now = Date.now();
        // the treats in the air, for the phone's pad (where they are now, rounded): [x, y, kind letter]
        const air = this.phase === 'playing' ? this.items.filter((it) => !it.cut && now >= it.t0).slice(0, 12).map((it) => {
            const [x, y] = this.at(it, now); return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, it.kind === 'coal' ? 'c' : it.kind === 'star' ? 's' : 't'];
        }) : [];
        return { game: this.id, mode: this.mode, players: this.players.map((p) => ({ id: p.id, name: p.name })), score: this.score,
            winner: this.winner, lives: this.lives, maxLives: s.lives, secs: s.secs, aspect: Math.round(this.aspect() * 100) / 100,
            left: this.phase === 'playing' ? Math.max(0, Math.ceil((this.endsAt - Math.max(now, this.started)) / 1000)) : 0,
            startsIn: this.phase === 'playing' && now < this.started ? Math.ceil((this.started - now) / 1000) : 0,
            colors: [s.color1, s.color2], friend: s.friend, coal: s.coal, stars: s.stars, waitEndsAt: this.waitEndsAt, air,
            best: this.bestDay === day(now) ? this.best : [] };
    }

    /** a treat (or half of one) with its middle at (cx, cy), b pixels across */
    paint(set, kind, col, cx, cy, b, t, half, side) {
        const r = b / 2, x0 = Math.round(cx - r), y0 = Math.round(cy - r);
        const keep = (x, y) => half === undefined || (side === 'v' ? (half ? x >= b / 2 : x < b / 2) : (half ? y >= b / 2 : y < b / 2));
        const P = (x, y, c, k) => { if (keep(x, y)) set(x0 + x, y0 + y, c, k); };
        const m = (b - 1) / 2;
        const spr = kind === 'coal' ? THEME.bad : kind === 'star' ? THEME.bonus : THEME.kinds ? kind : null;
        if (spr) { drawSprite(P, spr, col, b, kind === 'star' ? 0.85 + 0.15 * Math.sin(t * 14) : 1); return; }
        for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
            const dx = x - m, dy = y - m, d = Math.hypot(dx, dy);
            if (kind === 'bauble') { if (d <= r - 0.1) P(x, y, (dx < -r * 0.2 && dy < -r * 0.2 && d > r * 0.3 && d < r * 0.75) ? [255, 255, 255] : col); }
            else if (kind === 'coal') { if (d <= r - 0.1) P(x, y, [105, 105, 115], 0.9 + 0.1 * Math.sin(t * 9 + x + y)); }
            else if (kind === 'star') { if (Math.abs(dx) + Math.abs(dy) <= m + 0.5 || b <= 2) P(x, y, d < 0.8 ? [255, 255, 255] : GOLD, 0.75 + 0.25 * Math.sin(t * 14)); }
            else if (kind === 'present') P(x, y, b >= 3 && (x === Math.floor(b / 2) || y === Math.floor(b / 2)) ? GOLD : col);
            else if (kind === 'cane') {      // a hook: the stick down the middle-left, the curve at the top right; red and white stripes
                const stick = x === Math.floor(b / 3) && y >= 1, top = y <= 1 && x >= Math.floor(b / 3) && x <= Math.floor(b / 3) + Math.max(1, Math.floor(b / 2)), tip = x === Math.floor(b / 3) + Math.max(1, Math.floor(b / 2)) && y === 2;
                if (stick || top || tip) P(x, y, (x + y) % 2 ? [255, 255, 255] : [255, 30, 30]);
            } else if (kind === 'ginger') {  // a gingerbread man: brown, with white eyes and buttons when big enough
                const head = Math.hypot(dx, y - b * 0.22) <= b * 0.25, body = y >= b * 0.4 && Math.abs(dx) <= (y < b * 0.7 ? r : r * 0.55) && !(y > b * 0.75 && Math.abs(dx) < 0.6);
                if (head || body) P(x, y, b >= 4 && ((y === Math.round(b * 0.2) && Math.abs(Math.abs(dx) - b * 0.12) < 0.5) || (body && Math.abs(dx) < 0.5 && (y === Math.round(b * 0.5) || y === Math.round(b * 0.65)))) ? [255, 255, 255] : [170, 95, 40]);
            }
        }
        if (kind === 'coal' && b >= 2) P(Math.ceil(m), Math.floor(m), [140, 45, 10], 0.6 + 0.4 * Math.sin(t * 12));
        if (kind === 'bauble' && b >= 3) P(Math.round(m), 0, [200, 200, 200]);
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000, b = this.box();
        const cols = [hexRgb(this.s.color1), hexRgb(this.s.color2)];
        if (this.phase === 'over') {
            const col = this.winner === 2 ? cols[1] : this.winner === 1 ? cols[0] : GOLD, k = 0.5 + 0.5 * Math.sin(t * 8);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - y + Math.floor(t * 6) + 400) % 4 === 0) set(x, y, col, k);
            for (let i = 0; i < Math.min(this.score[Math.max(0, this.winner - 1) % 2] || 0, w * 2); i++) set(i % w, h - 1 - Math.floor(i / w), GOLD, 0.6);
            return;
        }
        if (this.phase === 'waiting') {
            const k = 0.3 + 0.3 * Math.sin(t * 4);
            this.paint(set, THEME.kinds ? KINDS[0] : 'bauble', cols[1], w / 2, h / 2, b + 2, t);
            for (let x = 0; x < w; x++) set(x, h - 1, cols[1], k);
            return;
        }
        if (this.phase !== 'playing') return;
        if (now - this.hurtAt < 400) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [90, 0, 0]);   // coal sliced: a red flash
        // the time left along the top, and the lives as dots in the top-right corner
        const left = now < this.started ? 1 : Math.max(0, (this.endsAt - now) / (this.endsAt - this.started));
        for (let x = 0; x < Math.round(left * w); x++) set(x, 0, left < 0.2 ? [255, 60, 40] : [40, 200, 80], left < 0.2 ? 0.5 + 0.5 * Math.sin(t * 10) : 0.5);
        for (let i = 0; i < this.lives; i++) set(w - 1 - i * 2, 2, [255, 40, 80]);
        if (now < this.started) { const k = Math.floor((this.started - now) / 250) % 2 ? 1 : 0.2; for (let x = 0; x < w; x++) set(x, Math.floor(h / 2), GOLD, k); }
        for (const it of this.items) {
            if (it.cut || now < it.t0) continue;
            const [x, y] = this.at(it, now);
            this.paint(set, it.kind, it.col, x * w, y * h, b, t);
        }
        for (const hf of this.halves) {
            const d = (now - hf.t0) / 1000, x = hf.x0 + hf.vx * d, y = hf.y0 + hf.vy * d + 0.5 * this.L().g * 1.4 * d * d;
            this.paint(set, hf.kind, hf.col.map((v) => v * Math.max(0.2, 1 - d * 0.6)), x * w, y * h, b, t, hf.half, hf.side);
        }
        for (const s of this.sparks) {                         // juice: sparkles flying out (grey smoke for coal)
            const a = (now - s.at) / 500;
            for (let i = 0; i < 8; i++) {
                const ang = i * Math.PI / 4, r = 1 + a * b * 1.2;
                set(s.x * w + Math.cos(ang) * r, s.y * h + Math.sin(ang) * r, s.coal ? [120, 120, 120] : s.col, 1 - a);
            }
        }
        for (const tr of this.trails) {                        // the swipe: a fading line in the player's colour (white alone)
            const a = (now - tr.at) / 400, col = this.players.length > 1 ? cols[tr.p] : [255, 255, 255];
            for (let k = 1; k < tr.pts.length; k++) {
                const [ax, ay] = tr.pts[k - 1], [bx, by] = tr.pts[k], n = Math.max(2, Math.ceil(Math.hypot((bx - ax) * w, (by - ay) * h)));
                for (let j = 0; j <= n; j++) set((ax + (bx - ax) * j / n) * w, (ay + (by - ay) * j / n) * h, col, (1 - a) * 0.8);
            }
        }
    }
}
