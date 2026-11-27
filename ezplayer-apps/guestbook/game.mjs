// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Guestbook: visitors leave their name and a short note from their phone. A new note scrolls across the matrix at once;
 * every few minutes the book is "read": its title, then the latest notes, one after another. In between the show plays.
 * Names and notes go through the word filter, also the ones already in the book, so a word added to the blocked list
 * takes a note out. The book is kept in the instance's private "state" document, so it survives a restart.
 */

import { num, cleanName } from './player.mjs';
import { Text, PAL, hexRgb, plain, isBad, setBadExtra } from './lights.mjs';
import { THEME } from './theme.mjs';

export const minSize = { w: 8, h: 5 };
const DEFAULTS = { target: '', fps: 25, brightness: 100, title: THEME.title ?? 'Our guestbook', titleColor: THEME.titleColor ?? 'ffd23f', free: true,
    presets: THEME.presets ?? 'Merry Christmas!\nWe loved the lights!\nSee you next year!\nThank you!', badWords: '',
    showNew: true, everyMins: 5, readCount: 5, keep: 300, waitSecs: 120, book: 1 };

export function cleanSettings(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return s;
    s.loaded = true;      // the real settings: only then may a new book number empty the book
    if (typeof raw.target === 'string') s.target = raw.target.trim();
    s.fps = num(raw.fps, 5, 30, s.fps);
    s.brightness = num(raw.brightness, 10, 100, s.brightness);
    if (typeof raw.title === 'string') s.title = plain(raw.title).trim().slice(0, 40);
    if (typeof raw.titleColor === 'string' && /^#?[0-9a-fA-F]{6}$/.test(raw.titleColor)) s.titleColor = raw.titleColor.replace('#', '').toLowerCase();
    for (const k of ['free', 'showNew']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (typeof raw.presets === 'string') s.presets = raw.presets.slice(0, 2000);
    if (typeof raw.badWords === 'string') s.badWords = raw.badWords.slice(0, 3000);
    setBadExtra(s.badWords);
    for (const [k, lo, hi] of [['everyMins', 0, 240], ['readCount', 1, 30], ['keep', 10, 1000], ['waitSecs', 0, 3600], ['book', 1, 9999]]) s[k] = num(raw[k], lo, hi, s[k]);
    return s;
}

export const presetsOf = (s) => s.presets.split('\n').map((x) => plain(x).trim().slice(0, 40)).filter((x) => x && !isBad(x)).slice(0, 20);

export class Game {
    static startTypes = ['sign'];

    constructor(s) {
        this.s = s; this.w = 32; this.h = 16; this.book = []; this.bookNo = s.book; this.byPhone = new Map();
        this.reset(); this.nextRead = Date.now() + 60000;
        this.usesBy = {};   // notes written, for the statistics (player.mjs sends it)
    }

    size(w, h) { this.w = w; this.h = h; }
    reset() { this.phase = 'idle'; this.queue = []; this.cur = null; this.players = []; }

    // ---- the book, kept across restarts ----
    saveState() { return { book: this.bookNo, notes: this.book }; }
    restore(st) {
        if (!st || !Array.isArray(st.notes)) return;
        this.bookNo = Number.isInteger(st.book) ? st.book : 1;
        this.book = st.notes.filter((n) => n && typeof n.n === 'string' && typeof n.t === 'string').slice(0, 1000)
            .map((n) => ({ n: n.n.slice(0, 16), t: n.t.slice(0, 40), c: Number.isInteger(n.c) && n.c >= 1 && n.c < PAL.length ? n.c : 1, at: +n.at || 0 }));
    }
    /** the notes that may be shown: a new book number starts an empty book, and the word filter is applied again */
    notes() {
        if (this.s.loaded && this.s.book !== this.bookNo) { this.bookNo = this.s.book; this.book = []; }
        if (this.book.length > this.s.keep) this.book.length = this.s.keep;
        // filtered again only when the book or the blocked words change (not every frame)
        const key = [this.book, this.book.length, this.book[0], this.bookNo, this.s.keep, this.s.badWords];
        if (!this.shown || this.shown.key.some((v, i) => v !== key[i])) this.shown = { key, list: this.book.filter((x) => !isBad(x.n) && !isBad(x.t)) };
        return this.shown.list;
    }

    handle(client, d, now) {
        if (d.type !== 'sign') return '';
        const last = this.byPhone.get(client) ?? -Infinity;
        const left = Math.ceil((last + this.s.waitSecs * 1000 - now) / 1000);
        if (left > 0) return `You can write again in ${left} s.`;
        const name = plain(cleanName(d.name, '')).trim();
        if (!name) return 'Write your name first.';
        const t = plain(String(d.text ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!t) return 'Write a few words first.';
        if (!this.s.free && !presetsOf(this.s).includes(t)) return 'Pick one of the notes.';
        if (isBad(name) || isBad(t)) return 'That cannot go in the book.';
        const c = Number.isInteger(d.color) && d.color >= 1 && d.color < PAL.length ? d.color : 1;
        this.notes();
        const note = { n: name, t, c, at: now };
        this.book.unshift(note);
        this.usesBy['note'] = (this.usesBy['note'] ?? 0) + 1;
        if (this.book.length > this.s.keep) this.book.length = this.s.keep;
        this.byPhone.set(client, now);
        if (this.byPhone.size > 2000) for (const [k, v] of this.byPhone) if (now - v > 3600000) this.byPhone.delete(k);
        if (this.s.showNew && this.queue.length < 10) this.queue.push({ kind: 'note', note, client });
        return '';
    }

    /** reading the book: the title, then the latest notes */
    read(now) {
        const list = this.notes().slice(0, this.s.readCount);
        this.nextRead = now + Math.max(1, this.s.everyMins) * 60000;
        if (!list.length) return;
        if (this.s.title) this.queue.push({ kind: 'title' });
        for (const note of list) this.queue.push({ kind: 'note', note, client: '' });
    }

    next(now) {
        const it = this.queue.shift();
        if (!it) { this.cur = null; this.phase = 'idle'; return; }
        it.anim = this.make(it);
        it.t0 = now; it.until = now + it.anim.seconds() * 1000 + 300;
        this.cur = it; this.phase = 'showing';
    }

    make(it) {
        if (it.kind === 'title') return new Text(this.w, this.h, this.s.title, hexRgb(this.s.titleColor));
        return new Text(this.w, this.h, `${it.note.n}: ${it.note.t}`, hexRgb(PAL[it.note.c]));
    }

    step(now) {
        if (this.cur && now < this.cur.until) return;
        if (!this.cur && !this.queue.length && this.s.everyMins > 0 && now >= this.nextRead) this.read(now);
        if (this.cur || this.queue.length) this.next(now);
    }

    render(out, w, h, now) {
        if (!this.cur) return;
        if (this.cur.anim.w !== w || this.cur.anim.h !== h) { this.size(w, h); this.cur.anim = this.make(this.cur); }
        out.set(this.cur.anim.frame((now - this.cur.t0) / 1000));
    }

    message() {
        if (!this.cur) return 'Write in the guestbook!';
        return this.cur.kind === 'title' ? 'Reading the guestbook…' : `On the lights: ${this.cur.note.n}`;
    }

    status() {
        const s = this.s, list = this.notes();
        return { title: s.title, free: s.free, presets: presetsOf(s), colors: PAL, waitSecs: s.waitSecs, players: [], count: list.length,
            latest: list.slice(0, 12).map((x) => ({ n: x.n, t: x.t, c: PAL[x.c] })),
            now: this.cur && this.cur.kind === 'note' ? { id: this.cur.client, n: this.cur.note.n } : null,
            queue: this.queue.filter((q) => q.client).map((q) => ({ id: q.client })) };
    }
}
