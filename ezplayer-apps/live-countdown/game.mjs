// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Live countdown: a big countdown on a matrix to a moment (midnight, the couple's entrance, the cake), then a
 * celebration (fireworks and a message) and the shared ending (a sound, the words said, a machine).
 *
 * The moment is a date and time, every day at a time, or N minutes after the host presses Start (the settings page
 * writes the private "timer" document, or a show button sends the input "start"). Every date is made with local Date
 * objects (new Date(y, m, d, hh, mm)) and the time left is a plain difference of milliseconds, so a summer-time change
 * between now and the moment does not move it by an hour.
 *
 * The matrix is only taken while the countdown is shown (from N minutes before, or always) and during the
 * celebration: phase 'counting' or 'over'; otherwise 'idle' and the show plays. The phones get the moment itself
 * (status.target, the player's clock) and count down on their own, corrected by the player's clock (skew).
 */

import { THEME } from './theme.mjs';
import { cleanEnd } from './ending.mjs';
import { num, hex, hexRgb } from './player.mjs';
import { Text, Fx, plain } from './lights.mjs';
import { VoiceCount } from './voice.mjs';

export const minSize = { w: 17, h: 5 };
const FXS = ['fireworks', 'bursts', 'rainbow', 'twinkle', 'plasma', 'ripple'];
const WHENS = ['date', 'daily', 'start'];
const DEFAULTS = { target: '', fps: 20, brightness: 100, when: 'date', date: '', time: '', relMins: 10, showMins: 10, always: false,
    showLabel: true, label: '', partySecs: 30, fx: 'theme', message: '', ownColour: false, colour: 'ffc83c', voiceCount: false };

/** the season's words and colours (Christmas when the theme is empty) */
export function theme() {
    return { event: THEME.event ?? 'Christmas', emoji: THEME.emoji ?? '🎄', greeting: THEME.greeting ?? 'Merry Christmas!',
        label: THEME.label ?? 'to Christmas!', colour: THEME.colour ?? 'ffc83c', colour2: THEME.colour2 ?? 'ff2a2a',
        fx: FXS.includes(THEME.fx) ? THEME.fx : 'fireworks', date: THEME.date ?? '12-25', time: THEME.time ?? '00:00' };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
function cleanGame(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (WHENS.includes(raw.when)) s.when = raw.when;
    if (typeof raw.date === 'string' && (raw.date === '' || DATE_RE.test(raw.date.trim()))) s.date = raw.date.trim();
    if (typeof raw.time === 'string' && (raw.time === '' || TIME_RE.test(raw.time.trim()))) s.time = raw.time.trim();
    s.relMins = num(raw.relMins, 1, 720, s.relMins);
    s.showMins = num(raw.showMins, 1, 1440, s.showMins);
    s.partySecs = num(raw.partySecs, 5, 300, s.partySecs);
    for (const k of ['always', 'showLabel', 'ownColour', 'voiceCount']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    for (const k of ['label', 'message']) if (typeof raw[k] === 'string') s[k] = plain(raw[k]).trim().slice(0, 60);
    if (raw.fx === 'theme' || FXS.includes(raw.fx)) s.fx = raw.fx;
    s.colour = hex(raw.colour, s.colour);
    return s;
}

// the ending: the words are the message itself, and a fanfare by default (it is a party)
export const END_TEXTS = { endWinText: '{winner}', endSound: 'built' };
export function cleanSettings(raw) { return cleanEnd(raw, cleanGame(raw), END_TEXTS); }

// ---- the moment ----
export function parseTime(t) {
    const m = TIME_RE.test(String(t ?? '')) ? String(t).split(':').map(Number) : null;
    if (!m || m[0] > 23 || m[1] > 59 || (m[2] ?? 0) > 59) return null;
    return [m[0], m[1], m[2] ?? 0];
}

/** Easter Sunday (Gregorian calendar, the "anonymous" method): [month, day] */
export function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

/** a theme's day in a year: "12-25", or a day that moves (easter, carnival = the Tuesday 47 days before, thanksgiving) */
export function dayOf(rule, y) {
    if (rule === 'easter') return easter(y);
    if (rule === 'carnival') { const [m, d] = easter(y), t = new Date(y, m - 1, d - 47); return [t.getMonth() + 1, t.getDate()]; }
    if (rule === 'thanksgiving') return [11, 1 + ((4 - new Date(y, 10, 1).getDay() + 7) % 7) + 21];   // the 4th Thursday of November
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(rule ?? ''));
    return m ? [+m[1], +m[2]] : null;
}

/**
 * The moment counted down to (ms, this computer's clock), or null: the first one whose celebration has not ended yet
 * (so during the celebration it is still the moment that just passed). rel: { at } a started countdown,
 * { left } a stopped one (nothing to count down to until it starts again).
 */
export function findTarget(s, now, rel = null, th = theme()) {
    const party = s.partySecs * 1000;
    if (rel && Number.isFinite(rel.at)) return rel.at;
    if (rel && Number.isFinite(rel.left)) return null;
    if (s.when === 'start') return null;
    const tm = parseTime(s.time) ?? parseTime(th.time) ?? [0, 0, 0];
    const d = new Date(now);
    if (s.when === 'daily') {
        for (let k = -1; k <= 2; k++) {   // from yesterday: a celebration at 23:59:50 goes on after midnight
            const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, ...tm).getTime();
            if (t + party > now) return t;
        }
        return null;
    }
    if (s.date) {
        const [y, m, dd] = s.date.split('-').map(Number), t = new Date(y, m - 1, dd, ...tm).getTime();
        return Number.isFinite(t) && t + party > now ? t : null;
    }
    if (!th.date) return null;   // a theme with no day of its own (a wedding): the host picks the date
    for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) {
        const md = dayOf(th.date, y);
        if (!md) return null;
        const t = new Date(y, md[0] - 1, md[1], ...tm).getTime();
        if (t + party > now) return t;
    }
    return null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n) => String(n).padStart(2, '0');
/** the moment in words, in this computer's time (the phones may be set to another time zone) */
export function whenText(t) {
    if (t == null) return '';
    const d = new Date(t);
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}${d.getSeconds() ? ':' + p2(d.getSeconds()) : ''}`;
}

/** what the clock shows for S seconds left, longest first (a narrow matrix takes the first one that fits) */
export function clockTexts(S) {
    const d = Math.floor(S / 86400), h = Math.floor(S / 3600) % 24, m = Math.floor(S / 60) % 60, sec = S % 60;
    if (S >= 86400) return [`${d}d ${p2(h)}:${p2(m)}`, `${d}d ${h}h`, `${d}d`];
    if (S >= 3600) return [`${h}:${p2(m)}:${p2(sec)}`, `${h}h${p2(m)}`, `${h}h`];
    return [`${m}:${p2(sec)}`];
}

// ---- the digits: a 3 x 5 font for small matrices and a 5 x 7 one, scaled up by whole pixels ----
const F3 = { w: 3, h: 5, g: { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    d: '001001111101111', h: '100100111101101', ':': '01010', ' ': '00000' } };
const F5 = { w: 5, h: 7, g: {
    0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
    3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
    6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
    9: '01110100011000101111000010001001100', d: '00001000010110110011100011001101101', h: '10000100001011011001100011000110001',
    ':': '0010100', ' ': '0000000' } };
const glyphW = (f, ch) => f.g[ch].length / f.h;
const textW = (f, str) => [...str].reduce((a, ch) => a + glyphW(f, ch), 0) + str.length - 1;   // a pixel between characters

/** the biggest way to write str in an aw x ah box: { f, k, tw, th } or null when even the small font does not fit */
export function fitClock(str, aw, ah) {
    let best = null;
    for (const f of [F5, F3]) {
        const tw = textW(f, str), k = Math.floor(Math.min(aw / tw, ah / f.h));
        if (k >= 1 && (!best || k * f.h > best.k * best.f.h)) best = { f, k, tw: tw * k, th: f.h * k };
    }
    return best;
}

/** writes str centred in the box (x0, y0, aw, ah); false when it does not fit */
export function drawClock(out, w, str, x0, y0, aw, ah, col, bright = 1) {
    const fit = fitClock(str, aw, ah);
    if (!fit) return false;
    const { f, k } = fit, c = col.map((v) => Math.min(255, v * bright));
    let x = x0 + Math.floor((aw - fit.tw) / 2);
    const y = y0 + Math.floor((ah - fit.th) / 2);
    for (const ch of str) {
        const gw = glyphW(f, ch), bits = f.g[ch];
        for (let r = 0; r < f.h; r++) for (let cx = 0; cx < gw; cx++) {
            if (bits[r * gw + cx] !== '1') continue;
            for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
                const px = x + cx * k + dx, py = y + r * k + dy;
                if (px < 0 || px >= w || py < 0) continue;
                const o = (py * w + px) * 3;
                if (o + 2 >= out.length) continue;
                out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
            }
        }
        x += (gw + 1) * k;
    }
    return true;
}

/** copies an animation's frame into the lease, only its lit pixels, darkening what is behind its rows when asked */
function overlay(out, frame, rows = null) {
    for (let i = 0; i < out.length; i += 3) {
        if (frame[i] || frame[i + 1] || frame[i + 2]) { out[i] = frame[i]; out[i + 1] = frame[i + 1]; out[i + 2] = frame[i + 2]; }
        else if (rows) { out[i] >>= 2; out[i + 1] >>= 2; out[i + 2] >>= 2; }
    }
}

export class Game {
    static startTypes = [];   // nothing a phone sends starts anything
    live = 'timer';           // the settings page's Start / Stop / Reset (read twice a second by player.mjs)

    constructor(s, opts = {}) {
        this.s = s; this.w = 32; this.h = 16; this.statusMs = 500;
        this.rel = null;        // a countdown started from the settings page or a show button: { at } or { left } when stopped
        this.liveN = null;      // the last "timer" document seen (null: not read yet)
        this.armed = null;      // the moment seen still ahead by this process: only that one is celebrated (not after a restart)
        this.voice = opts.voice ?? new VoiceCount();
        this.usesBy = {};       // each celebration (zero reached), for the statistics (player.mjs sends it)
        this.reset();
    }
    size(w, h) { this.w = w; this.h = h; this.anims = {}; }
    reset() { this.phase = 'idle'; this.target = null; this.left = null; this.partyAt = 0; this.anims = {}; }

    th() { return theme(); }
    labelText() { return this.s.label || this.th().label; }
    messageText() { return this.s.message || this.th().greeting; }
    colours() { const t = this.th(); return [hexRgb(this.s.ownColour ? this.s.colour : t.colour), hexRgb(this.s.ownColour ? this.s.colour : t.colour2)]; }

    command(cmd, now, mins = this.s.relMins) {
        const r = this.rel;
        if (cmd === 'start') {
            if (r && Number.isFinite(r.at) && r.at > now) return;                // already counting
            this.rel = r && Number.isFinite(r.left) ? { at: now + r.left } : { at: now + mins * 60_000 };
        } else if (cmd === 'stop') {
            if (r && Number.isFinite(r.at) && r.at > now) this.rel = { left: r.at - now };
        } else if (cmd === 'reset') this.rel = null;
    }

    /** the settings page's buttons: { cmd: 'start' | 'stop' | 'reset', mins, n } */
    onLive(o, now) {
        const n = o && typeof o === 'object' && Number.isFinite(o.n) ? o.n : 'none';   // 'none': no such document yet
        if (n === this.liveN) return;
        const first = this.liveN === null;
        this.liveN = n;
        if (first || n === 'none') return;   // left from before the app started: not done again
        this.command(o.cmd, now, num(o.mins, 1, 720, this.s.relMins));
    }

    /** a show input (a button of the show; player.mjs only passes those the player marks as show inputs) */
    onInput(name, d, now) { if (name === 'start') this.command('start', now); }

    handle() { return ''; }   // phones only watch

    step(now) {
        const party = this.s.partySecs * 1000;
        if (this.rel && Number.isFinite(this.rel.at) && now >= this.rel.at + party) this.rel = null;   // celebrated: over
        const t = findTarget(this.s, now, this.rel);
        if (t !== this.target) { this.target = t; this.anims = {}; }
        const left = t == null ? null : t - now;
        this.left = left;
        if (left != null && left > 0) this.armed = t;
        let ph = 'idle';
        if (left != null) {
            if (left <= 0) { if (this.armed === t && left > -party) ph = 'over'; }
            else if (this.s.always || left <= this.s.showMins * 60_000) ph = 'counting';
        }
        if (ph === 'over' && this.phase !== 'over') { this.partyAt = now; this.usesBy['celebration'] = (this.usesBy['celebration'] ?? 0) + 1; }
        this.phase = ph;
        this.voice.step(this.s, t, left);
    }

    outcome() { return { kind: 'win', vars: { winner: this.messageText() } }; }
    statResult() { return null; }   // a celebration is not a game: it is counted in usesBy

    saveState() { return { rel: this.rel }; }
    restore(st) {
        const r = st?.rel;
        if (r && Number.isFinite(r.at)) this.rel = { at: r.at };
        else if (r && Number.isFinite(r.left) && r.left > 0) this.rel = { left: r.left };
    }

    message() {
        const s = this.s;
        if (this.rel && Number.isFinite(this.rel.left)) return 'The countdown is stopped.';
        if (this.phase === 'over') return this.messageText();
        if (this.target == null && s.when === 'date' && s.date) return 'The moment has passed: pick a new date in the settings (or press Start).';
        if (this.target == null) return s.when === 'start' ? 'The countdown starts when the host presses Start.' : 'No moment set yet: pick the date and time in the settings.';
        if (this.phase === 'counting') return '';
        return s.always ? '' : `The lights show the countdown from ${s.showMins} minute${s.showMins === 1 ? '' : 's'} before.`;
    }

    status() {
        const t = this.th(), [c1, c2] = this.colours(), hx = (c) => c.map((v) => p2(v.toString(16))).join('');
        return { players: [], target: this.target, when: whenText(this.target), paused: this.rel && Number.isFinite(this.rel.left) ? this.rel.left : null,
            partyUntil: this.target == null ? null : this.target + this.s.partySecs * 1000, label: this.s.showLabel ? this.labelText() : '',
            greeting: this.messageText(), emoji: t.emoji, event: t.event, colour: hx(c1), colour2: hx(c2), started: !!this.rel };
    }

    anim(key, make) {
        const a = this.anims[key];
        if (a && a.w === this.w && a.h === this.h) return a;
        return (this.anims[key] = make());
    }

    render(out, w, h, now) {
        this.w = w; this.h = h;
        const [c1, c2] = this.colours();
        if (this.phase === 'over') {
            const t = (now - this.partyAt) / 1000, th = this.th();
            const fx = this.anim('fx', () => new Fx(w, h, this.s.fx === 'theme' ? th.fx : this.s.fx));
            out.set(fx.frame(t).subarray(0, out.length));
            const msg = this.anim('msg', () => new Text(w, h, this.messageText(), c1));
            overlay(out, msg.frame(t), true);
            return;
        }
        if (this.phase !== 'counting' || this.left == null) return;
        const S = Math.max(1, Math.ceil(this.left / 1000));
        if (S <= 10) {   // the last ten seconds: one huge number, bright at the start of each second and fading
            const frac = 1 - (this.left / 1000 - (S - 1));
            drawClock(out, w, String(S), 0, 0, w, h, c1, 0.3 + 0.7 * (1 - frac) ** 2);
            return;
        }
        const label = this.s.showLabel ? this.labelText() : '';
        const lh = h >= 40 ? 16 : 8, room = label && h - lh - 1 >= minSize.h;
        let ah = h;
        if (room) {   // the words scroll under the clock
            ah = h - lh - 1;
            const lab = this.anim('label', () => new Text(w, lh, label, c2));
            out.set(lab.frame(now / 1000).subarray(0, w * lh * 3), w * (ah + 1) * 3);
        } else if (label) {   // no room under it: the words scroll across the whole matrix once every 30 seconds
            const lab = this.anim('labelFull', () => new Text(w, h, label, c2));
            const cyc = (now / 1000) % Math.max(30, lab.seconds() + 10);
            if (S > 40 && cyc < lab.seconds()) { out.set(lab.frame(cyc).subarray(0, out.length)); return; }
        }
        for (const str of clockTexts(S)) if (drawClock(out, w, str, 0, 0, w, ah, c1)) break;
    }
}
