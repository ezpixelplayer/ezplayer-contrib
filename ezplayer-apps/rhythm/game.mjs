// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Rhythm on the lights: notes fall down a matrix of the show in 4 lanes, to the beat of a song the app makes itself
 * (or the owner's own WAV), and up to 4 phones tap the lane's pad when a note reaches the line near the bottom.
 *
 * The taps are judged ON THE PHONE (the delay through the network would ruin the timing): the phone gets the chart
 * ([ms after the start, lane]) and the start time t0 (the player computer's clock) in the status, keeps its clock in
 * step with the player's, and sends what it hit in small batches: { type: 'hits', h: [[note, deltaMs, lane], ...] }.
 * The server checks every hit (the note exists, the lane matches, not counted before for that phone, at most 140 ms
 * off, and it arrives no sooner than 1 s before the note and no later than 3 s after) and counts it: perfect
 * (within 70 ms) 3 points, good 1, plus a bonus for a long run of notes hit in a row.
 */

import { cleanEnd, colourName } from './ending.mjs';
import { THEME } from './theme.mjs';
import { painter, cleanName, num, hexRgb } from './player.mjs';
import { playSound, readWav, busFor } from './audio.mjs';
import { makeSong, chartOf, synth } from './song.mjs';

export const minSize = { w: 8, h: 8 };
export const PERFECT_MS = 70, GOOD_MS = 140;
const EARLY_MS = 1000, LATE_MS = 3000;          // when a hit may arrive, around its note's time
const FALL_MS = { easy: 2200, normal: 1700, hard: 1350 };   // how long a note takes from the top to the line
const RATE = 22050;
const NO_SOUND_MS = 8000;                       // the sound has not started by then: the song goes on with the lights only
const COLS = THEME.cols ?? ['ff2a2a', '39d353', 'ffc83c', '2bb7ff'];   // the 4 lanes (a theme pack: its own)
const GREETING = THEME.greeting ?? 'Merry Christmas!';
const TITLE = THEME.title ?? 'Rhythm on the lights';

const DEFAULTS = { target: '', fps: 30, brightness: 100, bpm: 110, level: 'normal', secs: 60, maxPlayers: 4, waitSecs: 15, partySecs: 6,
    sound: 'built', musicVolume: 70, musicBus: 'immediate', musicPi: '', musicPiKey: '', musicDelay: 0, musicFile: '', musicBpm: 120, musicStart: 0 };

// a select gives its value as text ("110"); a number field as a number
const numOf = (v, lo, hi, d) => num(typeof v === 'string' && v.trim() !== '' ? Number(v) : v, lo, hi, d);

function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = numOf(raw.fps, 5, 30, s.fps);
    s.brightness = numOf(raw.brightness, 10, 100, s.brightness);
    s.bpm = numOf(raw.bpm, 60, 180, s.bpm);
    if (FALL_MS[raw.level]) s.level = raw.level;
    s.secs = numOf(raw.secs, 30, 120, s.secs);
    s.maxPlayers = numOf(raw.maxPlayers, 1, 4, s.maxPlayers);
    s.waitSecs = numOf(raw.waitSecs, 5, 60, s.waitSecs);
    s.partySecs = numOf(raw.partySecs, 3, 30, s.partySecs);
    if (['built', 'file', 'off'].includes(raw.sound)) s.sound = raw.sound;
    s.musicVolume = numOf(raw.musicVolume, 5, 100, s.musicVolume);
    if (['immediate', 'main', 'local', 'pi'].includes(raw.musicBus)) s.musicBus = raw.musicBus;
    if (typeof raw.musicPi === 'string' && (raw.musicPi.trim() === '' || /^[\w.-]{1,253}(:\d{1,5})?$/.test(raw.musicPi.trim()))) s.musicPi = raw.musicPi.trim();
    if (typeof raw.musicPiKey === 'string') s.musicPiKey = raw.musicPiKey.trim().slice(0, 64);
    s.musicDelay = numOf(raw.musicDelay, -500, 1500, s.musicDelay);
    if (typeof raw.musicFile === 'string') s.musicFile = raw.musicFile.trim().slice(0, 300);
    s.musicBpm = numOf(raw.musicBpm, 40, 240, s.musicBpm);
    s.musicStart = numOf(raw.musicStart, 0, 10000, s.musicStart);
    return s;
}

// the season's greeting goes into the ending's words ({greeting}), so the same settings page serves every pack
export const END_TEXTS = { endWinText: '{winner} wins! {greeting}', endLoseText: 'Song over: {score} points. {greeting}', endRecordText: 'New record: {score}! {greeting}' };
export function cleanSettings(raw) {
    const s = cleanEnd(raw, cleanGame(raw), END_TEXTS);
    for (const k of Object.keys(END_TEXTS)) s[k] = String(s[k]).replace(/\{greeting\}/g, GREETING).replace(/\s+/g, ' ').trim();
    return s;
}

// the local date (not UTC, which turns the day in the evening in the Americas)
const day = (now) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const newPlayer = (id, name) => ({ id, name, score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, hit: new Set(), last: -1, left: false });

export class Game {
    constructor(s) {
        this.s = s; this.id = 0; this.statusMs = 300; this.w = 16; this.h = 16; this.best = []; this.bestDay = '';
        this.play = playSound;     // the tests put a stand-in here
        this.reset();
    }

    size(w, h) { this.w = w; this.h = h; }

    reset() {
        this.phase = 'idle';
        this.players = [];
        this.mode = '';
        this.song = null; this.chart = []; this.hitBy = [];
        this.t0 = null; this.soundAt = 0; this.sound = '';
        this.flash = [0, 0, 0, 0];
        this.winner = 0; this.draw = false; this.counted = false; this.reason = ''; this.until = 0; this.waitEndsAt = null; this.newBest = false;
    }

    handle(client, d, now) {
        const me = this.players.findIndex((p) => p.id === client);
        if (d.type === 'new') {
            if (this.phase === 'waiting') return me >= 0 ? 'You are in the game: tap Start now, or wait for friends.' : 'A game is open: tap Join the game.';
            if (this.phase === 'playing') return 'A song is already on. Wait for it to end.';
            const mode = d.mode === 'group' && this.s.maxPlayers > 1 ? 'group' : 'solo';
            this.reset();
            this.id += 1;
            this.mode = mode;
            this.players = [newPlayer(client, cleanName(d.name, 'Player 1'))];
            if (mode === 'solo') this.start(now);
            else { this.phase = 'waiting'; this.waitEndsAt = now + this.s.waitSecs * 1000; }
            return '';
        }
        if (d.type === 'join') {
            if (this.phase !== 'waiting') return 'There is no game waiting for players.';
            if (me >= 0) return 'You are already in this game.';
            if (this.players.length >= this.s.maxPlayers) return 'The game is full.';
            this.players.push(newPlayer(client, cleanName(d.name, `Player ${this.players.length + 1}`)));
            if (this.players.length >= this.s.maxPlayers) this.start(now);
            return '';
        }
        if (me < 0) return '';
        if (d.type === 'start' && this.phase === 'waiting') this.start(now);
        else if (d.type === 'hits') this.hits(me, d.h, now);
        else if (d.type === 'quit') {
            if (this.phase === 'waiting') {
                this.players.splice(me, 1);
                if (!this.players.length) this.reset();
            } else if (this.phase === 'playing') {
                this.players[me].left = true;
                if (this.players.every((p) => p.left)) this.finish(now, false, this.players.length > 1 ? 'Everyone left the song.' : 'You left the song.');
            }
        }
        return '';
    }

    /** the song for this game: the owner's WAV when set (and readable), else the app's own (or none, silent) */
    prepare(seed) {
        const s = this.s;
        if (s.sound === 'file' && s.musicFile) {
            try {
                const wav = readWav(s.musicFile), secs = Math.min(s.secs, wav.seconds);
                if (secs < 10) throw new Error('shorter than 10 seconds');
                const song = makeSong({ seed, bpm: s.musicBpm, secs, level: s.level, startMs: s.musicStart });
                return { song, samples: wav.mono(0, secs), rate: wav.rate };
            } catch (e) { console.log(`music: ${s.musicFile}: ${e.message}; playing the app's own music`); }
        }
        const song = makeSong({ seed, bpm: s.bpm, secs: s.secs, level: s.level });
        return s.sound === 'off' ? { song, samples: null } : { song, samples: synth(song, RATE), rate: RATE };
    }

    start(now) {
        const s = this.s, id = this.id;
        this.phase = 'playing'; this.waitEndsAt = null;
        const { song, samples, rate } = this.prepare((Math.random() * 2 ** 31) >>> 0);
        this.song = song; this.chart = chartOf(song); this.hitBy = new Array(this.chart.length).fill(0);
        if (!samples) { this.t0 = now + 2500; this.sound = 'off'; return; }   // silent: the phones get the chart, then the lights count in
        // the chart starts when the sound is heard: onStart says how long until then (and the owner's delay is added)
        this.t0 = null; this.soundAt = now; this.sound = 'starting';
        const begin = (lead, how) => { if (this.id === id && this.phase === 'playing' && this.t0 === null) { this.t0 = Date.now() + lead; this.sound = how; } };
        Promise.resolve()
            .then(() => this.play(samples, rate, s.musicVolume / 100, busFor(s.musicBus, s.musicPi, s.musicPiKey), (lead) => begin(Math.max(0, lead) + s.musicDelay, 'on')))
            .then((r) => { if (r === false) begin(1500, 'none'); }, (e) => { console.log(`music: ${e.message}`); begin(1500, 'none'); });
    }

    /** a phone's batch of hits: each checked, and counted once */
    hits(me, h, now) {
        const p = this.players[me];
        if (this.phase !== 'playing' || this.t0 === null || !p || p.left || !Array.isArray(h)) return 0;
        const list = h.slice(0, 32).filter((x) => Array.isArray(x) && Number.isInteger(x[0]) && typeof x[1] === 'number' && Number.isFinite(x[1]))
            .sort((a, b) => a[0] - b[0]);
        let counted = 0;
        for (const [i, delta, lane] of list) {
            const note = this.chart[i];
            if (!note || p.hit.has(i) || Math.abs(delta) > GOOD_MS) continue;
            if (lane !== undefined && lane !== note[1]) continue;
            const at = this.t0 + note[0];
            if (now < at - EARLY_MS || now > at + LATE_MS) continue;
            p.hit.add(i);
            // a run: unbroken while every note between the last one hit and this one was hit too
            if (i > p.last) {
                let broken = false;
                for (let j = p.last + 1; j < i && !broken; j++) if (!p.hit.has(j)) broken = true;
                p.combo = broken ? 1 : p.combo + 1;
                p.last = i;
            }
            p.maxCombo = Math.max(p.maxCombo, p.combo);
            const perfect = Math.abs(delta) <= PERFECT_MS;
            if (perfect) p.perfect++; else p.good++;
            p.score += (perfect ? 3 : 1) + Math.min(4, Math.floor(p.combo / 8));
            this.hitBy[i] |= 1 << me;
            this.flash[note[1]] = now;
            counted++;
        }
        return counted;
    }

    endsAt() { return this.t0 === null ? Infinity : this.t0 + this.song.lengthMs + 800; }

    finish(now, counted, reason = '') {
        if (counted && this.players.every((p) => p.score === 0)) { counted = false; reason = 'Nobody hit a note this time. Try again!'; }   // nobody played: no ending
        this.phase = 'over'; this.counted = counted; this.reason = reason; this.until = now + this.s.partySecs * 1000;
        if (this.bestDay !== day(now)) { this.best = []; this.bestDay = day(now); }
        if (!counted) return;          // everyone left: no winner, no ending, no best score
        const scores = this.players.map((p) => p.score), top = Math.max(...scores);
        this.winner = scores.indexOf(top) + 1;
        this.draw = this.players.length > 1 && scores.filter((x) => x === top).length > 1;
        const before = this.best[0]?.score ?? 0;
        for (const p of this.players) if (p.score > 0) this.best.push({ name: p.name, score: p.score });
        if (top > before) this.newBest = true;
        this.best.sort((a, b) => b.score - a.score); this.best = this.best.slice(0, 5);
    }

    /** what happened, for the ending: alone, a new best of the day or "song over"; together, who won */
    outcome() {
        if (!this.counted || !this.winner) return null;
        const w = this.winner - 1, p = this.players[w];
        if (this.players.length < 2) return { kind: this.newBest ? 'record' : 'lose', vars: { winner: p.name, colour: colourName(COLS[0]), score: p.score } };
        const names = this.players.filter((x) => x.score === p.score).map((x) => x.name).join(' & ');
        return { kind: 'win', vars: { winner: names, colour: colourName(COLS[w % 4]), score: p.score } };
    }

    /** the game for the statistics (player.mjs sends it when the game ends): null when it did not really end */
    statResult() {
        if (!this.counted || !this.winner) return null;   // everyone left, or nobody hit a note
        const w = this.players[this.winner - 1];
        return { players: this.players.map((p) => ({ name: p.name, score: p.score })), winner: this.players.length > 1 && !this.draw ? w.name : '', cpuWon: false, what: this.mode };
    }

    step(now) {
        if (this.phase === 'waiting' && now > this.waitEndsAt) { this.start(now); return; }
        if (this.phase === 'over') { if (now > this.until) this.reset(); return; }
        if (this.phase !== 'playing') return;
        if (this.t0 === null && now - this.soundAt > NO_SOUND_MS) { console.log('music: the sound did not start; the song goes on with the lights only'); this.t0 = now + 1500; this.sound = 'none'; }
        if (now > this.endsAt()) this.finish(now, true);
    }

    saveState() { return { best: this.best, day: this.bestDay }; }
    restore(st) {
        if (st && Array.isArray(st.best) && typeof st.day === 'string') {
            this.best = st.best.filter((b) => b && typeof b.name === 'string' && Number.isInteger(b.score)).slice(0, 5).map((b) => ({ name: cleanName(b.name, 'Player'), score: b.score }));
            this.bestDay = st.day;
        }
    }

    message() {
        if (this.phase === 'idle') return `${TITLE}: start a song!`;
        if (this.phase === 'waiting') return `${this.players[0].name} is waiting for players (${this.players.length} of ${this.s.maxPlayers}).`;
        if (this.phase === 'playing') return this.t0 === null ? 'Get ready…' : this.players.map((p) => `${p.name} ${p.score}`).join('  ·  ');
        if (!this.counted) return this.reason;
        const p = this.players[this.winner - 1];
        if (this.players.length === 1) return `${p.name} scored ${p.score} point${p.score === 1 ? '' : 's'}!${this.newBest ? ' Best of the day! 🏆' : ''}`;
        if (this.draw) return `A draw: ${this.players.filter((x) => x.score === p.score).map((x) => x.name).join(' & ')} with ${p.score}!`;
        return `${p.name} wins with ${p.score} points!${this.newBest ? ' Best of the day! 🏆' : ''}`;
    }

    status() {
        const s = this.s, song = this.song, now = Date.now();
        return {
            game: this.id, mode: this.mode, title: TITLE, cols: COLS, maxPlayers: s.maxPlayers, waitEndsAt: this.waitEndsAt,
            players: this.players.map((p) => ({ id: p.id, name: p.name, left: p.left })),
            score: this.players.map((p) => p.score), combo: this.players.map((p) => p.combo),
            perfect: this.players.map((p) => p.perfect), good: this.players.map((p) => p.good), maxCombo: this.players.map((p) => p.maxCombo),
            winner: this.winner, draw: this.draw, counted: this.counted, sound: this.sound,
            // the chart, while the song is on: [ms after t0, lane]; t0 is the player computer's clock (the phones follow it)
            notes: this.phase === 'playing' ? this.chart : [], t0: this.phase === 'playing' ? this.t0 : null,
            lengthMs: song?.lengthMs ?? s.secs * 1000, beatMs: song?.beatMs ?? 60000 / s.bpm, startMs: song?.startMs ?? 0,
            fallMs: FALL_MS[s.level], perfectMs: PERFECT_MS, goodMs: GOOD_MS, level: s.level, secs: s.secs,
            best: this.bestDay === day(now) ? this.best : [],
        };
    }

    render(out, w, h, now) {
        const set = painter(out, w, h), cols = COLS.map(hexRgb), t = now / 1000;
        const lw = w / 4, gap = lw >= 3 ? 1 : 0, hy = h >= 10 ? h - 2 : h - 1;
        const lane = (l, y, c, k) => { for (let x = Math.floor(l * lw); x <= Math.floor((l + 1) * lw) - 1 - gap; x++) set(x, y, c, k); };
        if (this.phase === 'over') {   // a shower of the 4 colours
            for (let i = 0; i < (w * h) / 5; i++) {
                const r = Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233) * 43758.5453, f = r - Math.floor(r);
                set(Math.floor(f * w), Math.floor(((f * 977) % 1) * h), cols[i % 4], 0.4 + 0.6 * ((f * 31) % 1));
            }
            return;
        }
        for (let l = 0; l < 4; l++) for (let y = 0; y < hy; y++) lane(l, y, cols[l], 0.05);   // the lanes, faintly
        if (this.phase === 'waiting') {   // a lane lights up for each player in
            for (let l = 0; l < 4; l++) lane(l, hy, cols[l], l < this.players.length ? 0.6 + 0.4 * Math.sin(t * 5 + l) : 0.12);
            return;
        }
        if (this.phase !== 'playing') return;
        const song = this.song;
        // the beat: the line pulses on every beat (the click track when there is no sound), stronger on the bar
        let pulse = Math.floor(now / 250) % 2 ? 0.5 : 0.1;
        if (this.t0 !== null && now >= this.t0 + song.startMs) {
            const beats = (now - this.t0 - song.startMs) / song.beatMs, ph = beats - Math.floor(beats);
            pulse = Math.max(0, 1 - ph * 3) * (Math.floor(beats) % 4 === 0 ? 1 : 0.6);
        } else if (this.t0 !== null) pulse = 0.15;
        for (let l = 0; l < 4; l++) {
            const f = Math.max(0, 1 - (now - this.flash[l]) / 250);
            lane(l, hy, f > 0 ? [255, 255, 255].map((v, i) => cols[l][i] + (v - cols[l][i]) * f * 0.6) : cols[l], Math.min(1, 0.25 + 0.5 * pulse + f));
            if (f > 0) { lane(l, hy - 1, cols[l], f * 0.7); if (hy + 1 < h) lane(l, hy + 1, cols[l], f); }
        }
        if (this.t0 === null) return;
        const fall = FALL_MS[this.s.level], nh = Math.max(1, Math.round(h / 16));
        for (let i = 0; i < this.chart.length; i++) {
            const [ms, l] = this.chart[i], dt = this.t0 + ms - now;
            if (dt > fall) break;              // the chart is in time order: the rest are later
            if (dt < -400 || this.hitBy[i]) continue;
            const y = Math.round(hy - (dt / fall) * hy), k = dt < -GOOD_MS ? 0.25 : 1;   // missed: dim, falling past the line
            for (let r = 0; r < nh; r++) lane(l, y - r, cols[l], k);
        }
    }
}
