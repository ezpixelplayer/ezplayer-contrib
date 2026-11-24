// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The part of a ShowPlay app that lights props (real models of the show) which talks to EZPlayer, the same in every such
 * app: it reads the settings and the show's groups, polls the phones' events, opens an overlay lease on each model the
 * app lights (closed again as soon as the model is free, so the model goes back to the sequence) and publishes the
 * app's status. The same idea as player.mjs, for many models at once instead of one matrix.
 *
 * An app (app.mjs) gives: cleanSettings(raw) with at least { fps, brightness }, and a class with
 *   static startTypes      the events refused while the app is not set up
 *   ready                  true when the app is set up (set by prepare)
 *   prepare(ctx)           (async) called when the settings change: ctx = { base, groups }; reads where the pixels are
 *   handle(client, data, now) -> '' or a note for that phone
 *   step(now)              moves time on
 *   frames(now)            -> [{ geom, bytes }]: what to send now (no entries: every model is free)
 *   status(), message()    for the phones; statusMs: least time between two statuses (default 0)
 *   saveState(), restore() optional, kept in the instance's private "state" document
 */

import { groupsOf, showXml } from './models.mjs';

const IDLE_MS = 100;
const NOTICE_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run({ name, App, cleanSettings }) {
    const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
    const instance = process.env.EZP_APP_INSTANCE;
    const token = process.env.EZP_APP_TOKEN;
    if (!instance || !token) {
        console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
        process.exit(1);
    }
    const authHeaders = { 'x-ezp-app-token': token };
    const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
    const appUrl = (p) => `${base}/api/ezp/apps/${encodeURIComponent(instance)}${p}`;
    const publishStatus = (status) => fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status) }).catch(() => undefined);

    let quit = false;
    const poll = new AbortController();
    const stop = () => { quit = true; poll.abort(); };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);

    let app = new App(cleanSettings(null));
    let settingsJson = '', groupsJson = '', groups = {}, lastCheck = -Infinity, preparedAt = 0, configError = 'Starting up';
    const notices = new Map();
    const note = (client, text) => { if (client && text) notices.set(client, { text, at: Date.now() }); };
    const startedAt = Date.now();

    // ---- settings and the show's groups
    async function checkSettings(now) {
        lastCheck = now;
        const xml = showXml();
        if (xml) {
            const g = groupsOf(xml), j = JSON.stringify(g);
            if (j !== groupsJson) {
                groupsJson = j; groups = g;
                await fetch(appUrl('/data/private/groups'), { method: 'PUT', headers: jsonHeaders, body: j }).catch(() => undefined);
            }
        }
        const res = await fetch(appUrl('/data/private/settings'), { headers: authHeaders });
        if (res.status === 404) { configError = 'Not set up yet: open the app settings.'; return; }
        if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
        const s = cleanSettings(await res.json().catch(() => null)), j = JSON.stringify(s);
        // read the pixels again when the settings change, and every minute while something was missing
        if (j === settingsJson && !(app.problems?.length && now - preparedAt > 60000)) { app.s = s; return; }
        settingsJson = j; preparedAt = now;
        app.s = s;
        try { await app.prepare({ base, groups }); configError = app.ready ? '' : app.notReady ?? 'Not set up yet: open the app settings.'; }
        catch (e) { configError = `Could not read the show: ${e.message}`; }
        if (app.problems?.length) console.log('problems:', app.problems.join('; '));
    }

    // ---- the phones
    const handleEvent = (ev) => {
        const d = ev?.data;
        if (!d || typeof d !== 'object') return;
        const client = typeof ev.client === 'string' && ev.client ? ev.client : null;
        if (!client) return;
        if ((App.startTypes ?? []).includes(d.type) && !app.ready) return note(client, configError || 'Not ready yet.');
        note(client, app.handle(client, d, Date.now(), ev));
    };
    void (async () => {
        let since = 0;
        while (!quit) {
            try {
                const res = await fetch(appUrl(`/events?since=${since}&wait=30`), { headers: authHeaders, signal: poll.signal });
                if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
                const { events = [] } = await res.json();
                for (const ev of events) {
                    since = Math.max(since, ev.id);
                    if (ev.ts >= startedAt - 2000) handleEvent(ev);
                }
            } catch (e) {
                if (quit) return;
                console.log(`events: ${e.message}`);
                await sleep(2000);
            }
        }
    })();

    // ---- the leases: one per model while the app lights it
    const leases = new Map();   // model -> { id, token, frameBytes, seq, failedAt, fmt, w, h, n, idleSince }
    async function openLease(g) {
        const body = g.fmt === 'grid' ? { model: g.model, format: 'grid', width: g.w, height: g.h } : { model: g.model, format: 'nodes' };
        const res = await fetch(`${base}/api/ezp/overlays`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...body, name: `${name}: ${g.model}`, blend: 'replace', ttlMs: 8000 }) });
        const o = await res.json().catch(() => ({}));
        if (!o.ok || !o.lease) throw new Error(o.error ?? `HTTP ${res.status}`);
        return { id: o.lease.id, token: o.lease.token, frameBytes: o.lease.frameBytes, seq: 1, fmt: g.fmt, w: g.w, h: g.h, n: g.n };
    }
    const closeLease = (l) => fetch(`${base}/api/ezp/overlays/${l.id}?token=${l.token}`, { method: 'DELETE' }).catch(() => undefined);
    const failed = new Map();   // model -> time a lease last failed to open
    async function send(list, k) {
        const now = Date.now(), seen = new Set();
        await Promise.all(list.map(async ({ geom: g, bytes }) => {
            seen.add(g.model);
            let l = leases.get(g.model);
            if (l && (l.fmt !== g.fmt || l.w !== g.w || l.h !== g.h || l.n !== g.n)) { leases.delete(g.model); await closeLease(l); l = null; }
            if (!l) {
                if (now - (failed.get(g.model) ?? 0) < 5000) return;
                try { l = await openLease(g); leases.set(g.model, l); console.log(`Lease ${l.id} on ${g.model}`); }
                catch (e) { failed.set(g.model, now); console.log(`Could not light ${g.model}: ${e.message}`); return; }
            }
            l.idleSince = 0;
            const out = new Uint8Array(l.frameBytes);
            out.set(bytes.subarray(0, Math.min(bytes.length, out.length)));
            if (k < 1) for (let i = 0; i < out.length; i++) out[i] = out[i] * k;
            const r = await fetch(`${base}/api/ezp/overlays/${l.id}/frame?token=${l.token}&seq=${l.seq++}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: out }).catch(() => null);
            if (r && r.status >= 400 && r.status < 500) { leases.delete(g.model); console.log(`Lease on ${g.model} lost (HTTP ${r.status}); opening it again`); }
        }));
        for (const [m, l] of leases) {   // a model nobody lights any more goes back to the show (after a moment, so a key let go fades out cleanly)
            if (seen.has(m)) continue;
            if (!l.idleSince) l.idleSince = now;
            if (now - l.idleSince > 400) { leases.delete(m); await closeLease(l); }
        }
    }

    // ---- state kept across restarts
    let savedJson = '', savedAt = 0;
    if (app.saveState) {
        try { const res = await fetch(appUrl('/data/private/state'), { headers: authHeaders }); if (res.ok) { const st = await res.json(); app.restore?.(st); savedJson = JSON.stringify(st); } }
        catch (e) { console.log(`state: ${e.message}`); }
    }
    const saveState = async (now, force = false) => {
        const j = JSON.stringify(app.saveState());
        if (j === savedJson || (!force && now - savedAt < 2000)) return;
        savedAt = now;
        const res = await fetch(appUrl('/data/private/state'), { method: 'PUT', headers: jsonHeaders, body: j }).catch(() => null);
        if (res?.ok) savedJson = j;
    };

    let lastJson = '', lastAt = 0, lastPhase = '';
    while (!quit) {
        const now = Date.now();
        if (now - lastCheck > 5000) {
            try { await checkSettings(now); }
            catch (e) { configError = `Player not reachable: ${e.message}`; }
        }
        app.step(now);
        const list = app.ready ? app.frames(now) : [];
        await send(list, (app.s.brightness ?? 100) / 100);
        if (app.saveState) await saveState(now);

        for (const [c, n] of notices) if (now - n.at > NOTICE_MS) notices.delete(c);
        const phase = !app.ready ? 'unconfigured' : list.length ? 'showing' : 'idle';
        const status = { ...app.status(), phase, message: app.ready ? app.message() : configError, notices: Object.fromEntries([...notices].map(([c, n]) => [c, n.text])) };
        const json = JSON.stringify(status);
        if ((json !== lastJson && (now - lastAt >= (app.statusMs ?? 0) || phase !== lastPhase)) || now - lastAt > 2000) {
            lastJson = json; lastAt = now; lastPhase = phase;
            await publishStatus(status);
        }
        await sleep(leases.size || list.length ? Math.max(5, 1000 / (app.s.fps || 20) - (Date.now() - now)) : IDLE_MS);
    }
    if (app.saveState) await saveState(Date.now(), true);
    for (const l of leases.values()) await closeLease(l);
    await publishStatus({ phase: 'idle', message: 'App stopped', notices: {} });
}
