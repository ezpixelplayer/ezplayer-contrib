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
import { statsReporter } from './stats.mjs';

const IDLE_MS = 100;
const NOTICE_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// no request to the player may hang the app: a stalled player would freeze the lights and the phones
const within = (ms) => AbortSignal.timeout(ms);

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
    const publishStatus = (status) => fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status), signal: within(3000) }).catch(() => undefined);

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
    const stats = statsReporter();   // what visitors did, for the host panel's statistics
    const usesSeen = {};

    // ---- settings and the show's groups
    async function checkSettings(now) {
        lastCheck = now;
        const xml = showXml();
        if (xml) {
            const g = groupsOf(xml), j = JSON.stringify(g);
            if (j !== groupsJson) {
                groupsJson = j; groups = g;
                await fetch(appUrl('/data/private/groups'), { method: 'PUT', headers: jsonHeaders, body: j, signal: within(5000) }).catch(() => undefined);
            }
        }
        const res = await fetch(appUrl('/data/private/settings'), { headers: authHeaders, signal: within(5000) });
        if (res.status === 404) { configError = 'Not set up yet: open the app settings.'; return; }
        if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
        const s = cleanSettings(await res.json().catch(() => null)), j = JSON.stringify(s);
        // read the pixels again when the settings change, and every minute while something was missing
        if (j === settingsJson && !(app.problems?.length && now - preparedAt > 60000)) { app.s = s; return; }
        settingsJson = j; preparedAt = now;
        app.s = s;
        try { await app.prepare({ base, groups }); configError = app.ready ? '' : app.notReady ?? 'Not set up yet: open the app settings.'; }
        catch (e) { configError = `Could not read the show: ${e.message}`; settingsJson = ''; app.ready = false; }   // tried again in 5 s, not only when the settings change
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
        // exclusive, with the app token: a model another app is using is refused with that app's name
        const res = await fetch(`${base}/api/ezp/overlays`, { method: 'POST', headers: jsonHeaders,
            body: JSON.stringify({ ...body, name: `${name}: ${g.model}`, mode: 'exclusive', blend: 'replace', ttlMs: 8000 }), signal: within(5000) });
        const o = await res.json().catch(() => ({}));
        if (!o.ok || !o.lease) throw new Error(o.error ?? `HTTP ${res.status}`);
        return { id: o.lease.id, token: o.lease.token, frameBytes: o.lease.frameBytes, seq: 1, fmt: g.fmt, w: g.w, h: g.h, n: g.n, fails: 0 };
    }
    const closeLease = (l) => fetch(`${base}/api/ezp/overlays/${l.id}?token=${l.token}`, { method: 'DELETE', signal: within(3000) }).catch(() => undefined);
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
            const r = await fetch(`${base}/api/ezp/overlays/${l.id}/frame?token=${l.token}&seq=${l.seq++}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: out, signal: within(3000) }).catch(() => null);
            if (r && r.ok) l.fails = 0;
            else if ((r && r.status >= 400 && r.status < 500) || ++l.fails >= 3) {   // refused, or no answer three times: the lease is opened again
                leases.delete(g.model); console.log(`Lease on ${g.model} lost (${r ? 'HTTP ' + r.status : 'no answer'}); opening it again`);
                if (r) failed.set(g.model, now); else void closeLease(l);
            }
        }));
        for (const [m, l] of leases) {   // a model nobody lights any more goes back to the show (after a moment, so a key let go fades out cleanly)
            if (seen.has(m)) continue;
            if (!l.idleSince) l.idleSince = now;
            if (now - l.idleSince > 400) { leases.delete(m); await closeLease(l); }
        }
    }

    // ---- state kept across restarts
    // Nothing is saved until the saved state has been read (or there is none yet, 404) and the app is set up (the tree
    // puts the saved decorations on its spots only then): otherwise empty decorations would be written over the saved ones.
    let savedJson = '', savedAt = 0, stateReady = false, stateTriedAt = -Infinity;
    const loadState = async (now) => {
        stateTriedAt = now;
        try {
            const res = await fetch(appUrl('/data/private/state'), { headers: authHeaders, signal: within(5000) });
            if (res.ok) { const st = await res.json(); app.restore?.(st); savedJson = JSON.stringify(st); stateReady = true; }
            else if (res.status === 404) stateReady = true;
            else console.log(`state: HTTP ${res.status}`);
        } catch (e) { console.log(`state: ${e.message}`); }
    };
    if (app.saveState) await loadState(Date.now());
    const saveState = async (now, force = false) => {
        if (!stateReady) { if (now - stateTriedAt > 10_000) await loadState(now); return; }
        if (!app.ready) return;
        const j = JSON.stringify(app.saveState());
        if (j === savedJson || (!force && now - savedAt < 2000)) return;
        savedAt = now;
        const res = await fetch(appUrl('/data/private/state'), { method: 'PUT', headers: jsonHeaders, body: j, signal: within(5000) }).catch(() => null);
        if (res?.ok) savedJson = j;
    };

    let lastJson = '', lastAt = 0, lastPhase = '', liveAt = 0;
    while (!quit) {
      try {   // an error in one frame must not stop the app (the models would stay as they were)
        const now = Date.now();
        if (now - lastCheck > 5000) {
            try { await checkSettings(now); }
            catch (e) { configError = `Player not reachable: ${e.message}`; }
        }
        if (app.live && now - liveAt > 500) {   // a document the settings page changes live (the tree's front while it is being set)
            liveAt = now;
            try { const r = await fetch(appUrl(`/data/private/${app.live}`), { headers: authHeaders, signal: within(2000) }); if (r.ok) app.onLive?.(await r.json(), now); else if (r.status === 404) app.onLive?.(null, now); }
            catch { /* tried again in a moment */ }
        }
        app.step(now);
        for (const [w, n] of Object.entries(app.usesBy ?? {})) { const add = n - (usesSeen[w] ?? 0); if (add > 0) { stats.use(add, w === '_' ? '' : w); usesSeen[w] = n; } }
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
      } catch (e) {
        console.log(`error: ${e?.stack ?? e}`);
        for (const [m, l] of leases) { leases.delete(m); await closeLease(l); }   // the models go back to the show
        settingsJson = '';   // and the app is set up again
        await sleep(1000);
      }
    }
    if (app.saveState) await saveState(Date.now(), true);
    for (const l of leases.values()) await closeLease(l);
    await app.close?.();   // anything else the app holds (the song's audio lease)
    await publishStatus({ phase: 'idle', message: 'App stopped', notices: {} });
}
