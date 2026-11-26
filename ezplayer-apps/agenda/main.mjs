// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Agenda, as an EZPlayer app. The times of the apps are the player's own schedules (set from the settings page), so
 * they work without this process. This process only does what the player cannot: dates. Every minute it reads the
 * private document "plan" ({ dates: { <instance>: { from: 'MM-DD', to: 'MM-DD' } } }) and switches each listed
 * instance on inside its range and off outside, by the local date of this computer. It only sends a change when the
 * player says otherwise, never touches an instance that is not in the plan, and never touches itself.
 * Its status says how many apps have dates and when the next change is, and lists today's times for the phones' page.
 *
 * Environment (set by the player): EZP_API_URL, EZP_APP_INSTANCE, EZP_APP_TOKEN.
 */
import { THEME } from './theme.mjs';
import { changesFor, nextChange, cleanPlan, effective, dayBars, inRange, mdLabel, hhmm, DAY_SHORT } from './plan.mjs';

const TICK_MS = Math.max(1000, Number(process.env.AGENDA_TICK_MS) || 60_000);   // a shorter tick only for tests
// no request may hang the loop: a stalled player must not stop the next minute's check
const within = (ms) => AbortSignal.timeout(ms);

const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const self = process.env.EZP_APP_INSTANCE;
const token = process.env.EZP_APP_TOKEN;
if (!self || !token) {
    console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
    process.exit(1);
}
const authHeaders = { 'x-ezp-app-token': token };
const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
const appUrl = (p) => `${base}/api/ezp/apps/${encodeURIComponent(self)}${p}`;

let quit = false;
let wake = null;
const stop = () => { quit = true; wake?.(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const nap = (ms) => new Promise((r) => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });

async function readPlan() {
    const res = await fetch(appUrl('/data/private/plan'), { headers: authHeaders, signal: within(5000) });
    if (res.status === 404) return cleanPlan(null);   // nothing set yet
    if (!res.ok) throw new Error(`plan: HTTP ${res.status}`);
    return cleanPlan(await res.json().catch(() => null));
}
async function readApps() {
    const res = await fetch(`${base}/api/ezp/apps`, { headers: authHeaders, signal: within(5000) });
    if (!res.ok) throw new Error(`apps: HTTP ${res.status}`);
    return res.json();
}
async function command(cmd) {
    const res = await fetch(`${base}/api/ezp/apps/command`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(cmd), signal: within(10_000) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error ?? `HTTP ${res.status}`);
    if (out.lastError) throw new Error(out.lastError);   // the player answers with its state; a failed command sets lastError
    return out;
}
const publishStatus = (status) =>
    fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status), signal: within(3000) }).catch(() => undefined);

// Today's times of every app that is on, for the phones' page ("What's on today").
function today(state, plan, now) {
    const day = now.getDay(), md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const icons = Object.fromEntries((state.apps || []).map((a) => [a.id, a.manifest]));
    const rows = [];
    for (const inst of state.instances || []) {
        if (inst.name === self || !inst.enabled) continue;
        const r = plan.dates[inst.name];
        if (r && !inRange(md, r.from, r.to)) continue;
        const bars = dayBars(effective(inst, state.defaultSchedule), day);
        if (!bars.length) continue;
        const m = icons[inst.appId] || {};
        rows.push({ icon: m.icon || '✨', title: inst.title || m.name || inst.name,
            times: bars.map(([s, e]) => (s === 0 && e === 1440 ? 'all day' : `${hhmm(s)}–${hhmm(e)}`)).join(', ') });
    }
    return rows;
}

function message(plan, state, now) {
    // only the dated apps the player still has
    const have = new Set((state.instances || []).map((i) => i.name));
    plan = { dates: Object.fromEntries(Object.entries(plan.dates).filter(([k]) => k !== self && have.has(k))) };
    const n = Object.keys(plan.dates).length;
    if (!n) return 'Agenda: no app has dates; the times are kept by the player.';
    const nx = nextChange(plan, self, now);
    const next = nx ? `, next change ${DAY_SHORT[nx.date.getDay()]} ${mdLabel(nx.md)} (${nx.name} ${nx.enabled ? 'on' : 'off'})` : '';
    return `Agenda: ${n} app${n === 1 ? '' : 's'} with dates${next}`;
}

async function tick() {
    const now = new Date();
    const plan = await readPlan();
    const state = await readApps();
    for (const c of changesFor(plan, state.instances, self, now)) {
        const r = plan.dates[c.name];
        try {
            await command({ op: 'setInstance', name: c.name, patch: { enabled: c.enabled } });
            const inst = state.instances.find((i) => i.name === c.name);
            if (inst) inst.enabled = c.enabled;
            console.log(`${now.toISOString()} turned ${c.name} ${c.enabled ? 'on' : 'off'} (its dates: ${mdLabel(r.from)} to ${mdLabel(r.to)})`);
        } catch (e) {
            console.error(`could not turn ${c.name} ${c.enabled ? 'on' : 'off'}: ${e.message}`);
        }
    }
    return { phase: 'idle', message: message(plan, state, now), players: [], today: today(state, plan, now),
        title: THEME.title ?? 'Agenda', icon: THEME.icon ?? '🗓️', at: now.getTime() };
}

console.log(`agenda ${self}: date enforcer started`);
while (!quit) {
    let status;
    try {
        status = await tick();
    } catch (e) {
        console.error('agenda:', e.message);
        status = { phase: 'idle', message: `Agenda: cannot read the player now (${e.message}); trying again in a minute.`, players: [], today: [],
            title: THEME.title ?? 'Agenda', icon: THEME.icon ?? '🗓️' };
    }
    if (quit) break;
    await publishStatus(status);
    await nap(TICK_MS);
}
console.log('agenda: stopped');
process.exit(0);
