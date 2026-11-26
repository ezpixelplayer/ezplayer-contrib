// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Statues ("musical statues") with the lights: while the matrix is green everybody dances, when it turns red everybody
 * freezes. Whoever moves during the red light is out; the last one standing wins, or everyone left after the last
 * round. The green and red lights last a random time each (between the settings' shortest and longest).
 *
 * Two ways to see who moves (one per game):
 *  - body: the body sensor (sensor.mjs, an ESP32 with an LD2450 radar) sees up to 3 people; they are the players,
 *    named Left / Middle / Right. A short grace time after the light turns red, each one's place is taken; moving
 *    more than the sensitivity's distance from it puts that person out. A phone only starts the game.
 *  - phone: each player holds their phone; it measures its own movement during the red light and sends a level
 *    (0-100) every 300 ms ({type:'move', level, cue}); above the sensitivity's level the player is out.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { painter, cleanName, hex } from './player.mjs';
import { isBad, Text } from './lights.mjs';
import { sensor, SENSOR_DEFAULTS, cleanSensor } from './sensor.mjs';
import { THEME } from './theme.mjs';
import { playBeat } from './beat.mjs';

export const minSize = { w: 8, h: 6 };
// how much movement puts a player out: metres away from where they froze (body), or the phone's level (phone)
export const SENS = { low: { body: 0.4, phone: 35 }, normal: { body: 0.25, phone: 20 }, high: { body: 0.14, phone: 10 } };
const COLS = ['2bb7ff', 'ffd23f', '9b5cff', '00e5e5', 'ff7a1a', 'ff4fd8', 'a0a0ff', 'ffe0a0'];   // never red or green: those are the lights
const LABELS = { 1: ['Middle'], 2: ['Left', 'Right'], 3: ['Left', 'Middle', 'Right'] };
export const MAX_PHONES = 8;
const READY_MS = 3000;
const BODY_WAIT_MS = 12000;
const MATCH_MM = 900;        // a person seen this near where a player was is still that player
const SEEN_MS = 700;         // a person not seen for longer is not judged (the radar loses people now and then)
const words = () => ({ go: THEME.go ?? 'Dance!', stop: THEME.stop ?? 'Freeze!', greeting: THEME.greeting ?? 'Merry Christmas!' });

const DEFAULTS = { ...SENSOR_DEFAULTS, target: '', fps: 20, brightness: 100, wayBody: true, wayPhone: true, sens: 'normal', graceSecs: 0.6,
    greenMin: 3, greenMax: 8, redMin: 3, redMax: 6, rounds: 8, waitSecs: 30, partySecs: 8, showGo: false, music: false, bpm: 120, back: true,
    goColor: '30e050', stopColor: 'ff2020' };

const fl = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10 : d);

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = Math.round(fl(raw.fps, 5, 30, s.fps));
    s.brightness = Math.round(fl(raw.brightness, 10, 100, s.brightness));
    for (const k of ['wayBody', 'wayPhone', 'showGo', 'music', 'back']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (!s.wayBody && !s.wayPhone) s.wayPhone = true;
    if (SENS[raw.sens]) s.sens = raw.sens;
    s.graceSecs = fl(raw.graceSecs, 0.2, 3, s.graceSecs);
    s.greenMin = fl(raw.greenMin, 1, 30, s.greenMin);
    s.greenMax = Math.max(s.greenMin, fl(raw.greenMax, 1, 30, s.greenMax));
    s.redMin = fl(raw.redMin, 1.5, 30, s.redMin);
    s.redMax = Math.max(s.redMin, fl(raw.redMax, 1.5, 30, s.redMax));
    s.rounds = Math.round(fl(raw.rounds, 1, 30, s.rounds));
    s.waitSecs = Math.round(fl(raw.waitSecs, 10, 300, s.waitSecs));
    s.partySecs = Math.round(fl(raw.partySecs, 3, 30, s.partySecs));
    s.bpm = Math.round(fl(raw.bpm, 70, 180, s.bpm));
    s.goColor = hex(raw.goColor, s.goColor);
    s.stopColor = hex(raw.stopColor, s.stopColor);
    cleanSensor(raw, s);
    return s;
}

export const END_TEXTS = { endWinText: '{winner} wins!', endLoseText: 'Everyone moved!' };
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

const NO_SENSOR = 'The body sensor is not answering: play with the phone in your hand.';
const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

export class Game {
    constructor(s, rnd = Math.random) { this.s = s; this.rnd = rnd; this.id = 0; this.statusMs = 200; this.w = 32; this.h = 16; this.reset(); }

    size(w, h) { this.w = w; this.h = h; }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.mode = '';
        this.starter = null;
        this.light = ''; this.cue = 0; this.lightAt = 0; this.lightEnds = 0;
        this.round = 0; this.winners = []; this.until = 0; this.waitEndsAt = null; this.silent = false; this.reason = '';
        this.greet = null;
    }

    grace() { return this.s.graceSecs * 1000; }
    alive() { return this.players.filter((p) => !p.out); }

    handle(client, d, now) {
        const me = this.players.find((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase === 'waiting' || this.phase === 'playing') return 'A game is already on. Wait for it to end.';
            const mode = d.control === 'body' ? 'body' : 'phone';
            if (mode === 'body' && !this.s.wayBody) return 'Playing with the body sensor is switched off.';
            if (mode === 'body' && !sensor.ok()) return NO_SENSOR;
            if (mode === 'phone' && !this.s.wayPhone) return 'Playing with the phone is switched off.';
            this.reset();
            this.id += 1;
            this.mode = mode;
            this.starter = client;
            this.phase = 'waiting';
            if (mode === 'phone') { this.players = [this.phonePlayer(client, d.name)]; this.waitEndsAt = now + this.s.waitSecs * 1000; }
            else this.waitEndsAt = now + BODY_WAIT_MS;
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'waiting') return 'There is no game to join right now.';
            if (this.mode === 'body') return 'This game is played with the body sensor: just stand in front of the lights.';
            if (me) return 'You are in. The game starts soon.';
            if (this.players.length >= MAX_PHONES) return 'The game is full.';
            this.players.push(this.phonePlayer(client, d.name));
            return '';
        }
        if (d.type === 'start') {
            if (this.phase !== 'waiting' || (client !== this.starter && !me)) return '';
            return this.begin(now);
        }
        if (d.type === 'quit') {
            if (this.phase === 'waiting') {
                if (this.mode === 'body' ? client === this.starter : false) { this.reset(); return ''; }
                this.players = this.players.filter((p) => p.id !== client);
                if (!this.players.length) this.reset();
                else if (client === this.starter) this.starter = this.players[0].id;
            } else if (this.phase === 'playing') {
                if (this.mode === 'body' && client === this.starter) this.finish([], now, true);   // the game was stopped: no ending
                else if (me && !me.out) this.out(me, now, 'left');
            }
            return '';
        }
        if (d.type === 'move' || d.type === 'moved') {
            if (!me || this.mode !== 'phone' || this.phase !== 'playing') return '';
            const level = d.type === 'moved' ? 100 : typeof d.level === 'number' && Number.isFinite(d.level) ? Math.max(0, Math.min(100, d.level)) : null;
            if (level === null) return '';
            me.level = level; me.heard = now;
            // only a report made during this red light counts, after its grace time (a little slack for the phone's clock)
            if (this.light !== 'stop' || me.out || (typeof d.cue === 'number' && d.cue !== this.cue)) return '';
            if (now < this.lightAt + this.grace() - 150) return '';
            if (level >= SENS[this.s.sens].phone) this.out(me, now, 'moved');
            return '';
        }
        return '';
    }

    phonePlayer(id, name) {
        const n = this.players.length;
        let nm = cleanName(name, `Player ${n + 1}`);
        if (isBad(nm)) nm = `Player ${n + 1}`;
        return { id, name: nm, col: COLS[n % COLS.length], out: false, outAt: 0, outRound: 0, why: '', level: 0, heard: 0 };
    }

    /** the game begins: for the body, the people the radar sees now are the players (left to right) */
    begin(now) {
        if (this.mode === 'body') {
            const ps = sensor.people().slice(0, 3);
            if (!ps.length) { this.reset(); return 'Nobody is in front of the lights: stand in front of them and start again.'; }
            const names = LABELS[ps.length];
            this.players = ps.map((q, i) => ({ id: 'body' + i, name: names[i], col: COLS[i], out: false, outAt: 0, outRound: 0, why: '',
                pos: { x: q.x, y: q.y }, seenAt: now, ref: null, moved: 0 }));
        }
        if (!this.players.length) { this.reset(); return ''; }
        this.total = this.players.length;
        this.phase = 'playing'; this.waitEndsAt = null; this.round = 0;
        this.setLight('ready', now, READY_MS);
        return '';
    }

    setLight(light, now, ms) {
        this.light = light; this.lightAt = now; this.lightEnds = now + ms; this.cue += 1;
        for (const p of this.players) { p.ref = null; p.moved = 0; p.level = 0; }
    }

    span(lo, hi) { return Math.round((lo + (hi - lo) * this.rnd()) * 1000); }

    nextLight(now) {
        if (this.light === 'go') { this.setLight('stop', now, this.span(this.s.redMin, this.s.redMax)); return; }
        if (this.light === 'stop') {
            // a phone that sent nothing during two red lights in a row has gone (the page was closed): out
            if (this.mode === 'phone' && this.lightEnds - this.lightAt - this.grace() >= 1000) for (const p of this.alive()) {
                if (p.heard >= this.lightAt + this.grace()) p.missed = 0;
                else if ((p.missed = (p.missed || 0) + 1) >= 2) this.out(p, now, 'gone');
            }
            this.round += 1;
            let alive = this.alive();
            if (!alive.length && this.total > 1) {   // everyone left moved in this same red light: they all go on
                for (const p of this.players) if (p.out && p.outRound === this.round - 1 && p.why === 'moved') { p.out = false; p.why = ''; }
                alive = this.alive();
            }
            if (!alive.length || (this.total > 1 && alive.length === 1) || this.round >= this.s.rounds) {
                this.finish(alive, now, this.players.every((p) => p.why === 'left' || p.why === 'gone'));   // nobody played to the end: no ending
                return;
            }
        }
        const ms = this.span(this.s.greenMin, this.s.greenMax);
        this.setLight('go', now, ms);
        playBeat(this.s, ms / 1000, this.s.bpm);
    }

    out(p, now, why) { p.out = true; p.outAt = now; p.outRound = this.round; p.why = why; }

    finish(winners, now, silent = false) {
        this.phase = 'over'; this.light = '';
        this.winners = winners.map((p) => p.id);
        this.silent = silent;
        this.until = now + this.s.partySecs * 1000;
    }

    /** the radar's people matched to the body players (nearest first), and who moved during the red light */
    useSensor(now) {
        sensor.configure(this.s);
        const body = this.mode === 'body' && (this.phase === 'playing' || this.phase === 'waiting');
        sensor.tick(now, !body);
        if (!body || this.phase !== 'playing') return;
        const ps = sensor.people(), pairs = [];
        for (const p of this.players) for (let j = 0; j < ps.length; j++) {
            const d = Math.hypot(ps[j].x - p.pos.x, ps[j].y - p.pos.y);
            if (d < MATCH_MM) pairs.push([d, p, j]);
        }
        pairs.sort((a, b) => a[0] - b[0]);
        const usedP = new Set(), usedQ = new Set();
        for (const [, p, j] of pairs) {
            if (usedP.has(p) || usedQ.has(j)) continue;
            usedP.add(p); usedQ.add(j);
            p.pos = { x: (p.pos.x + ps[j].x) / 2, y: (p.pos.y + ps[j].y) / 2 };   // smoothed: the radar's own jitter is not a move
            p.seenAt = now;
        }
        if (this.light !== 'stop' || now < this.lightAt + this.grace()) return;
        const limit = SENS[this.s.sens].body * 1000;
        for (const p of this.alive()) {
            if (now - p.seenAt > SEEN_MS) continue;
            if (!p.ref) { p.ref = { ...p.pos }; continue; }
            p.moved = Math.hypot(p.pos.x - p.ref.x, p.pos.y - p.ref.y);
            if (p.moved > limit) this.out(p, now, 'moved');
        }
    }

    step(now) {
        this.useSensor(now);
        if (this.phase === 'waiting' && now > this.waitEndsAt) { this.reason = this.begin(now); return; }
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'playing') return;
        if (now >= this.lightEnds) this.nextLight(now);
    }

    /** what happened, for the ending (a sound, the words, a machine) */
    outcome() {
        if (this.silent || !this.players.length) return null;
        const ws = this.players.filter((p) => this.winners.includes(p.id)), score = `${this.round} ${this.round === 1 ? 'round' : 'rounds'}`;
        if (!ws.length) return { kind: 'lose', vars: { winner: '', colour: '', score } };
        return { kind: 'win', vars: { winner: ws.map((p) => p.name).join(' & '), colour: colourName(ws[0].col), score } };
    }

    message() {
        const W = words();
        if (this.phase === 'idle') return this.reason || 'Start a game!';
        if (this.phase === 'waiting') {
            if (this.mode === 'body') return 'Stand in front of the lights (up to 3 people): the game starts soon.';
            return `${this.players.length} ${this.players.length === 1 ? 'player' : 'players'} in. Open this page and tap Join!`;
        }
        if (this.phase === 'playing') {
            const last = this.players.filter((p) => p.out && p.why === 'moved').sort((a, b) => b.outAt - a.outAt)[0];
            const news = last && Date.now() - last.outAt < 4000 ? ` ${last.name} moved: out!` : '';
            if (this.light === 'ready') return 'Get ready…';
            return `${this.light === 'go' ? W.go : W.stop + ' Do not move!'} Round ${this.round + 1} of ${this.s.rounds}.${news}`;
        }
        if (this.silent) return 'The game was stopped.';
        const ws = this.players.filter((p) => this.winners.includes(p.id)).map((p) => p.name);
        return `${ws.length ? `${ws.join(' & ')} ${ws.length === 1 ? 'wins' : 'win'}!` : 'Everyone moved!'} ${W.greeting}`;
    }

    status() {
        const s = this.s, stop = this.light === 'stop' || this.light === 'ready';
        return { game: this.id, mode: this.mode, starter: this.starter, light: this.light, cue: this.cue, lightAt: this.lightAt,
            // how long the green light lasts is a secret unless the settings show it (the phones cannot tell either)
            lightEndsAt: stop || s.showGo ? this.lightEnds : null, graceMs: this.grace(), round: this.round, rounds: s.rounds,
            players: this.players.map((p) => ({ id: p.id, name: p.name, col: p.col, out: p.out, why: p.why })),
            winners: this.winners, words: words(), colors: { go: s.goColor, stop: s.stopColor }, wayBody: s.wayBody, wayPhone: s.wayPhone,
            sensor: sensor.state(), level: SENS[s.sens].phone, waitEndsAt: this.waitEndsAt };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), t = now / 1000;
        const go = rgb(this.s.goColor), stop = rgb(this.s.stopColor);
        let bg = [0, 0, 0], k = 0;
        if (this.phase === 'waiting') { bg = [255, 170, 40]; k = 0.08 + 0.06 * Math.sin(t * 3); }
        else if (this.light === 'go') { bg = go; k = 0.3 + 0.12 * Math.max(0, Math.cos((t * this.s.bpm / 60) * 2 * Math.PI)); }   // pulses with the beat
        else if (this.light === 'stop') { bg = stop; k = 0.4; }
        else if (this.light === 'ready') { bg = [255, 255, 255]; k = Math.floor(t * 2) % 2 ? 0.08 : 0.03; }
        if (k) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, bg, k);
        if (this.s.back && this.light !== 'stop') this.backdrop(out, w, h, t);

        const bar = h >= 16 ? 2 : 1, mh = Math.max(2, Math.round(h / 4));
        // the countdown bar: how long the light has left (the green one only when the settings show it)
        if (this.phase === 'playing' && (this.light !== 'go' || this.s.showGo)) {
            const f = Math.max(0, Math.min(1, (this.lightEnds - now) / Math.max(1, this.lightEnds - this.lightAt)));
            const col = this.light === 'go' ? go : this.light === 'stop' ? stop : [255, 255, 255];
            for (let x = 0; x < Math.round(f * w); x++) for (let y = 0; y < bar; y++) set(x, y, col);
        }
        if (this.phase === 'over') this.drawOver(out, set, w, h, now, mh);
        this.drawMarkers(set, w, h, now, mh);
    }

    /** one block per player along the bottom, in their colour; crossed out when out */
    drawMarkers(set, w, h, now, mh) {
        const n = this.players.length;
        if (!n) return;
        const sw = Math.max(1, Math.floor(w / n)), x0 = Math.floor((w - sw * n) / 2), y0 = h - mh;
        this.players.forEach((p, i) => {
            const bx = x0 + i * sw, bw = sw >= 3 ? sw - 1 : sw, col = rgb(p.col);
            const flash = p.out && now - p.outAt < 900 && Math.floor(now / 120) % 2;
            for (let y = y0; y < h; y++) for (let x = bx; x < bx + bw; x++) {
                if (flash) { set(x, y, [255, 255, 255]); continue; }
                if (!p.out) { set(x, y, col); continue; }
                const u = bw > 1 ? (x - bx) / (bw - 1) : 0.5, v = mh > 1 ? (y - y0) / (mh - 1) : 0.5;
                const cross = Math.abs(u - v) < 0.6 / Math.max(bw, mh) + 0.12 || Math.abs(u - (1 - v)) < 0.6 / Math.max(bw, mh) + 0.12;
                set(x, y, cross ? [255, 255, 255] : col, cross ? 0.8 : 0.12);
            }
        });
    }

    /** the end: the winners' colours sparkle and the greeting scrolls across (after the ending's own words) */
    drawOver(out, set, w, h, now, mh) {
        const t = now / 1000, ws = this.players.filter((p) => this.winners.includes(p.id));
        const cols = ws.length ? ws.map((p) => rgb(p.col)) : [rgb(this.s.stopColor)];
        for (let y = 0; y < h - mh; y++) for (let x = 0; x < w; x++) if ((x * 7 + y * 13 + Math.floor(t * 8)) % 9 === 0) set(x, y, cols[(x + y) % cols.length], 0.6);
        if (this.ending?.busy?.()) return;
        const g = words().greeting, th = Math.max(5, h - mh - 1);
        if (!this.greet || this.greet.w !== w || this.greet.h !== th || this.greet.text !== g) this.greet = { w, h: th, text: g, anim: new Text(w, th, g.toUpperCase(), [255, 210, 60]), t0: now };
        const f = this.greet.anim.frame((now - this.greet.t0) / 1000);
        for (let y = 0; y < th; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 3;
            if (f[i] || f[i + 1] || f[i + 2]) set(x, y, [f[i], f[i + 1], f[i + 2]]);
        }
    }

    /** what falls in the back (a theme pack: its own), drawn a little lighter than the light under it */
    backdrop(out, w, h, t) {
        const kind = THEME.back ?? 'snow';
        if (!kind || kind === 'none') return;
        const n = Math.ceil(w * h / 45);
        const glow = (x, y, c) => {
            x = Math.floor(((x % w) + w) % w); y = Math.floor(y);
            if (y < 0 || y >= h) return;
            const o = (y * w + x) * 3;
            for (let i = 0; i < 3; i++) out[o + i] = Math.min(255, out[o + i] * 0.5 + c[i] * 0.5);
        };
        const CONF = [[255, 80, 80], [255, 210, 60], [80, 200, 255], [255, 90, 220], [120, 230, 120]];
        for (let i = 0; i < n; i++) {
            const sx = i * 7.3, sy = i * 13.7;
            if (kind === 'stars') { const q = 0.5 + 0.5 * Math.sin(t * (1 + (i % 5) * 0.4) + i); glow(sx, sy % h, [255, 255, 200].map((v) => v * q)); continue; }
            if (kind === 'bubbles') { glow(sx + Math.sin(t * 0.9 + i) * 1.2, h - 1 - ((sy % h) + t * (1 + (i % 3) * 0.5)) % h, [150, 210, 255]); continue; }
            const fall = kind === 'bats' ? 0.6 : kind === 'leaves' || kind === 'petals' ? 1.1 : 1.5 + (i % 3);
            const sway = kind === 'leaves' || kind === 'petals' ? 2.5 : kind === 'bats' ? 3 : 1.5;
            const x = sx + Math.sin(t * 0.7 + i) * sway, y = kind === 'bats' ? (sy % h + Math.sin(t * 2 + i) * 1.5 + h) % h : ((sy % h) + t * fall) % h;
            const c = kind === 'snow' ? [230, 230, 255] : kind === 'confetti' ? CONF[i % CONF.length] : kind === 'petals' ? [255, 150, 200]
                : kind === 'leaves' ? (i % 2 ? [230, 110, 20] : [200, 160, 30]) : [60, 20, 90];
            glow(x, y, c);
            if (kind === 'bats' && Math.floor(t * 6 + i) % 2) { glow(x + 1, y - 1, c); glow(x - 1, y - 1, c); }
        }
    }
}
