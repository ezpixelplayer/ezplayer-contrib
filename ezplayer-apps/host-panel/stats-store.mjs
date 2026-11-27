// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The host panel's statistics: what the apps report (stats.mjs in every app) kept night by night, in the panel's private
 * document "stats". A night ends at a set hour (06:00 by default), so a show that goes past midnight is one night.
 *
 * stats = { v: 1, since, nights: { 'YYYY-MM-DD': { apps: { <appId>: Night } } }, best: { <appId>: Best }, recent: [...] }
 * Night = { games, players, uses, usesBy: { what: n }, wins, cpuWins, top: { score, name, at } | null, hours: [24] }
 */

export const MAX_NIGHTS = 400, MAX_RECENT = 300;
const pad = (n) => String(n).padStart(2, '0');

export function emptyStats(now = Date.now()) { return { v: 1, since: now, nights: {}, best: {}, recent: [] }; }

/** the night a moment belongs to (local time of this computer): before nightEnds o'clock it is still the night before */
export function nightOf(at, nightEnds = 6) {
    const d = new Date(at);
    if (d.getHours() < nightEnds) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** a stats document read back: anything broken is dropped, so a bad document never stops the panel */
export function cleanStats(o, now = Date.now()) {
    if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.nights !== 'object') return emptyStats(now);
    return { v: 1, since: Number.isFinite(o.since) ? o.since : now, nights: o.nights ?? {}, best: o.best ?? {}, recent: Array.isArray(o.recent) ? o.recent.slice(-MAX_RECENT) : [] };
}

const appOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(s);
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);

/**
 * adds one event an app sent ({ type:'stat', app, kind:'game'|'use', at, players, winner, cpuWon, n, what }).
 * opts: { nightEnds, keepNames }. Returns true when something was counted.
 */
export function addEvent(stats, d, opts = {}, receivedAt = Date.now()) {
    if (!d || d.type !== 'stat' || !appOk(d.app) || (d.kind !== 'game' && d.kind !== 'use')) return false;
    // the time is the panel's own (an app's clock could be off; events arrive within seconds)
    const at = receivedAt, night = nightOf(at, opts.nightEnds ?? 6), hour = new Date(at).getHours();
    const nt = (stats.nights[night] ??= { apps: {} });
    const a = (nt.apps[d.app] ??= { games: 0, players: 0, uses: 0, usesBy: {}, wins: 0, cpuWins: 0, top: null, hours: Array(24).fill(0) });
    const named = (s) => (opts.keepNames === false ? '' : cleanName(s));
    if (d.kind === 'use') {
        const n = Math.max(1, Math.min(1000, Math.round(Number(d.n) || 1)));
        a.uses += n; a.hours[hour] += n;
        const w = typeof d.what === 'string' && /^[\w -]{1,24}$/.test(d.what) ? d.what : '';
        if (w) a.usesBy[w] = (a.usesBy[w] ?? 0) + n;
        return true;
    }
    const people = (Array.isArray(d.players) ? d.players : []).slice(0, 12);
    a.games += 1; a.players += people.length; a.hours[hour] += 1;
    if (d.cpuWon) a.cpuWins += 1; else if (d.winner) a.wins += 1;
    let best = null;
    for (const p of people) if (Number.isFinite(p?.score) && (!best || p.score > best.score)) best = { score: Math.round(p.score), name: named(p.name), at };
    if (best) {
        if (!a.top || best.score > a.top.score) a.top = best;
        const b = stats.best[d.app];
        if (!b || best.score > b.score) stats.best[d.app] = { ...best, night };
    }
    stats.recent.push({ at, app: d.app, players: people.length, winner: named(d.winner), cpuWon: !!d.cpuWon, ...(best ? { top: best.score } : {}) });
    if (stats.recent.length > MAX_RECENT) stats.recent.splice(0, stats.recent.length - MAX_RECENT);
    // only the latest nights are kept (a season is far shorter than this)
    const keys = Object.keys(stats.nights).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_NIGHTS))) delete stats.nights[k];
    return true;
}

/** the season's totals per app: games, players, uses, and the best score ever (for the page) */
export function seasonOf(stats) {
    const out = {};
    for (const nt of Object.values(stats.nights)) for (const [app, a] of Object.entries(nt.apps)) {
        const s = (out[app] ??= { games: 0, players: 0, uses: 0, nights: 0 });
        s.games += a.games; s.players += a.players; s.uses += a.uses; s.nights += 1;
    }
    for (const [app, b] of Object.entries(stats.best)) if (out[app]) out[app].best = b;
    return out;
}
