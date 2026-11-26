// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The rules of Agenda, shared by the process (main.mjs), the settings page (inlined by _src/config.mjs) and the tests:
 *   - time windows in the player's own schedule format (CloudPollScheduleEntry: { id, days, startTime, endTime }),
 *   - date ranges ("only from 1 Dec to 6 Jan", every year) kept in Agenda's private document "plan".
 * No imports, so the same text runs in Node and in the browser.
 */

// Day numbers as Date.getDay() gives them: 0 = Sunday.
export const DAY_SETS = {
    all: [0, 1, 2, 3, 4, 5, 6],
    'weekend-fri-sat': [5, 6],
    'weekend-sat-sun': [6, 0],
    'weekday-mon-fri': [1, 2, 3, 4, 5],
    'weekday-sun-thu': [0, 1, 2, 3, 4],
    sunday: [0], monday: [1], tuesday: [2], wednesday: [3], thursday: [4], friday: [5], saturday: [6],
};
export const DAY_LABELS = [
    ['all', 'Every day'], ['weekend-fri-sat', 'Fri and Sat'], ['weekend-sat-sun', 'Sat and Sun'],
    ['weekday-mon-fri', 'Mon to Fri'], ['weekday-sun-thu', 'Sun to Thu'], ['monday', 'Monday'], ['tuesday', 'Tuesday'],
    ['wednesday', 'Wednesday'], ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'],
];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "HH:MM" -> minutes, or NaN. Hours 0..24; 24 only as "24:00" (the end of the day).
export function toMin(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
    if (!m) return NaN;
    const h = +m[1], mi = +m[2];
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return NaN;
    return h * 60 + mi;
}
export const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

// A ScheduleDays value for exactly this set of days, or null when no single value matches.
function daysValueFor(set) {
    const key = [...set].sort().join(',');
    for (const [v, s] of Object.entries(DAY_SETS)) if ([...s].sort().join(',') === key) return v;
    return null;
}
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Makes a list of rows typed on the page ({ days, startTime, endTime, id? }) into valid schedule entries:
 * times as HH:MM between 00:00 and 24:00, the end after the start, every id unique.
 * The player's type for app windows does not promise times past 24:00, so a window over midnight (18:00 to 02:00) is
 * split in two: 18:00-24:00 on its days and 00:00-02:00 on the next days (one row per day when no single value fits).
 * Returns { list } or { error } naming the first bad row (1-based).
 */
export function cleanWindows(rows) {
    const out = [], used = new Set();
    const idFor = (want) => {
        let id = typeof want === 'string' && /^[\w-]{1,40}$/.test(want) && !used.has(want) ? want : '';
        while (!id || used.has(id)) id = 'w' + Math.random().toString(36).slice(2, 8);
        used.add(id);
        return id;
    };
    const list = Array.isArray(rows) ? rows : [];
    for (let i = 0; i < list.length; i++) {
        const r = list[i] || {};
        if (!DAY_SETS[r.days]) return { error: `Row ${i + 1}: pick the days.` };
        const s = toMin(r.startTime), e = toMin(r.endTime);
        if (!(s >= 0 && s < 1440)) return { error: `Row ${i + 1}: the start time must be between 00:00 and 23:59.` };
        if (!(e >= 0 && e <= 1440)) return { error: `Row ${i + 1}: the end time must be between 00:00 and 24:00.` };
        if (e === s) return { error: `Row ${i + 1}: the start and the end are the same time.` };
        if (e > s) { out.push({ id: idFor(r.id), days: r.days, startTime: hhmm(s), endTime: hhmm(e) }); continue; }
        // over midnight
        out.push({ id: idFor(r.id), days: r.days, startTime: hhmm(s), endTime: '24:00' });
        if (e === 0) continue;   // "until 00:00" is just "until the end of the day"
        const next = DAY_SETS[r.days].map((d) => (d + 1) % 7);
        const v = daysValueFor(next);
        for (const days of v ? [v] : next.map((d) => DAY_NAMES[d])) out.push({ id: idFor(''), days, startTime: '00:00', endTime: hhmm(e) });
    }
    return { list: out };
}

// Whether a schedule is on at this day and minute. Empty or missing means always (as the player reads it).
export function onAt(schedule, day, minute) {
    if (!Array.isArray(schedule) || !schedule.length) return true;
    return schedule.some((w) => (DAY_SETS[w.days] || []).includes(day) && minute >= toMin(w.startTime) && minute < toMin(w.endTime));
}

// The windows of one day as [start, end] minutes, merged and sorted, for the preview bars.
export function dayBars(schedule, day) {
    if (!Array.isArray(schedule) || !schedule.length) return [[0, 1440]];
    const bars = schedule.filter((w) => (DAY_SETS[w.days] || []).includes(day))
        .map((w) => [toMin(w.startTime), Math.min(1440, toMin(w.endTime))]).filter(([s, e]) => s >= 0 && e > s).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const b of bars) {
        const last = out[out.length - 1];
        if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]); else out.push([...b]);
    }
    return out;
}

// The schedule an instance really follows: its own, or the default when it has none.
export const effective = (inst, defaultSchedule) => (Array.isArray(inst?.schedule) ? inst.schedule : defaultSchedule || []);

// ---- dates: "MM-DD" every year, both ends included; a range may cross the new year (12-01 to 01-06)
export function cleanMd(s) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s ?? '').trim());
    if (!m) return null;
    const mo = +m[1], d = +m[2];
    const len = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    if (!len || d < 1 || d > len) return null;
    return String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
const mdOf = (date) => String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
export function inRange(md, from, to) {
    return from <= to ? md >= from && md <= to : md >= from || md <= to;
}
export const mdLabel = (md) => +md.slice(3) + ' ' + MONTHS[+md.slice(0, 2) - 1];

// The plan document, cleaned: { v: 1, dates: { <instance>: { from: 'MM-DD', to: 'MM-DD' } } }.
export function cleanPlan(raw) {
    const dates = {};
    const src = raw && typeof raw === 'object' && raw.dates && typeof raw.dates === 'object' ? raw.dates : {};
    for (const [name, r] of Object.entries(src)) {
        const from = cleanMd(r?.from), to = cleanMd(r?.to);
        if (from && to && /^[\w.-]{1,80}$/.test(name)) dates[name] = { from, to };
    }
    return { v: 1, dates };
}

/**
 * What the date enforcer must change now: for each instance in the plan (never `self`, never one the player does not
 * have), enabled = today is inside its range, only where that differs from what the player says.
 * `now` is the local time of the player computer. Returns [{ name, enabled }].
 */
export function changesFor(plan, instances, self, now = new Date()) {
    const md = mdOf(now), out = [];
    for (const [name, r] of Object.entries(cleanPlan(plan).dates)) {
        if (name === self) continue;
        const inst = (instances || []).find((i) => i.name === name);
        if (!inst) continue;
        const want = inRange(md, r.from, r.to);
        if (!!inst.enabled !== want) out.push({ name, enabled: want });
    }
    return out;
}

// The next day (after today, within a year) on which some dated instance goes on or off: { date, md, name, enabled } or null.
export function nextChange(plan, self, now = new Date()) {
    const dates = Object.entries(cleanPlan(plan).dates).filter(([n]) => n !== self);
    if (!dates.length) return null;
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let prev = mdOf(day);
    for (let k = 1; k <= 366; k++) {
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + k), md = mdOf(d);
        for (const [name, r] of dates) {
            const a = inRange(prev, r.from, r.to), b = inRange(md, r.from, r.to);
            if (a !== b) return { date: d, md, name, enabled: b };
        }
        prev = md;
    }
    return null;
}
