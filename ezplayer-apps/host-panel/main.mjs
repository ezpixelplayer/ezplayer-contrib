// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

// Host panel, as an EZPlayer app. The panel itself is the settings page (config/index.html, made from _src/panel.html),
// which the player serves even while this process is stopped. The process keeps the statistics: every app reports
// what happened (stats.mjs: a game played, a visitor using an app) as an event to this instance, and the totals are
// kept night by night in the private document "stats" (stats-store.mjs). No lease: it never lights anything.
import { THEME } from './theme.mjs';
import { emptyStats, cleanStats, addEvent, nightOf } from './stats-store.mjs';

const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const instance = process.env.EZP_APP_INSTANCE;
const token = process.env.EZP_APP_TOKEN;
if (!instance || !token) {
    console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
    process.exit(1);
}
const auth = { 'x-ezp-app-token': token }, json = { ...auth, 'content-type': 'application/json' };
const appUrl = (p) => `${base}/api/ezp/apps/${encodeURIComponent(instance)}${p}`;
const within = (ms) => AbortSignal.timeout(ms);   // every request has a time limit, so a busy player never freezes the loop
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getDoc = async (key) => {
    const r = await fetch(appUrl(`/data/private/${key}`), { headers: auth, signal: within(5000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
    return r.json();
};
const putDoc = (key, o) => fetch(appUrl(`/data/private/${key}`), { method: 'PUT', headers: json, body: JSON.stringify(o), signal: within(5000) });

let quit = false;
const poll = new AbortController();
const stop = () => { quit = true; poll.abort(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

// ---- the statistics: read once (nothing is written before that, so a player not ready at start cannot wipe them)
let stats = null, dirty = false, savedAt = 0, counted = 0;
let opts = { nightEnds: 6, keepNames: true }, cmdN = null;
async function load() {
    while (!quit && !stats) {
        try { stats = cleanStats(await getDoc('stats')); }
        catch (e) { console.log(`stats: ${e.message}; trying again`); await sleep(10_000); }
    }
}
async function save(force = false) {
    if (!stats || !dirty || (!force && Date.now() - savedAt < 15_000)) return;
    savedAt = Date.now();
    const r = await putDoc('stats', stats).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) dirty = false; else console.log(`stats: could not save (${r.status})`);
}
// the settings page writes "statsOptions" ({ nightEnds, keepNames }) and "statsCmd" ({ n, op: 'reset' }) for the process
async function readPage() {
    try {
        const o = await getDoc('statsOptions');
        if (o) opts = { nightEnds: Number.isInteger(o.nightEnds) && o.nightEnds >= 0 && o.nightEnds <= 12 ? o.nightEnds : 6, keepNames: o.keepNames !== false };
        const c = await getDoc('statsCmd');
        const n = c && typeof c === 'object' ? c.n : 'none';
        if (n !== cmdN) {
            const first = cmdN === null;
            cmdN = n;
            if (!first && c?.op === 'reset' && stats) { stats = emptyStats(); dirty = true; await save(true); console.log('statistics: a new season (all cleared from the settings page)'); }
        }
    } catch (e) { console.log(`settings page documents: ${e.message}`); }
}

// ---- the events the apps send
async function events() {
    let since = 0;
    const startedAt = Date.now();
    while (!quit) {
        try {
            const r = await fetch(appUrl(`/events?since=${since}&wait=30`), { headers: auth, signal: poll.signal });
            if (!r.ok) throw new Error(`events: HTTP ${r.status}`);
            const { events: list = [] } = await r.json();
            for (const ev of list) {
                since = Math.max(since, ev.id);
                if (!stats || ev.ts < startedAt - 2000) continue;   // the feed starts empty for a new process; older ones are not ours
                // only apps report (their client is "app:<instance>"); a phone has nothing to tell the panel
                if (typeof ev.client === 'string' && ev.client.startsWith('app:') && addEvent(stats, ev.data, opts, ev.ts)) { dirty = true; counted++; }
            }
        } catch (e) {
            if (quit) return;
            console.log(e.message);
            await sleep(2000);
        }
    }
}

// ---- the status: what the panel knows right now (the settings page reads the full document)
function publish() {
    const night = stats?.nights[nightOf(Date.now(), opts.nightEnds)]?.apps ?? {};
    const games = Object.values(night).reduce((s, a) => s + a.games, 0), uses = Object.values(night).reduce((s, a) => s + a.uses, 0);
    const status = { phase: 'idle', players: [], theme: THEME.key ?? 'christmas',
        message: stats ? `Host panel ready · tonight: ${games} game${games === 1 ? '' : 's'}, ${uses} use${uses === 1 ? '' : 's'}` : 'Host panel ready (reading the statistics…)' };
    fetch(appUrl('/status'), { method: 'PUT', headers: json, body: JSON.stringify(status), signal: within(3000) })
        .then((r) => { if (!r.ok) console.log(`status: HTTP ${r.status}`); }, (e) => console.log(`status: ${e.message}`));
}

console.log(`host panel ${instance} ready`);
await load();
void events();
let lastPage = 0, lastPublish = 0;
while (!quit) {
    const now = Date.now();
    if (now - lastPage > 5000) { lastPage = now; await readPage(); }
    if (now - lastPublish > 30_000) { lastPublish = now; publish(); }
    await save();
    await sleep(1000);
}
await save(true);
console.log(`host panel stopped (${counted} reports counted this run)`);
process.exit(0);
