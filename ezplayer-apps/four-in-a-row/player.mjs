// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The part of a ShowPlay game that talks to EZPlayer, the same in every game app: it reads the settings, finds the
 * matrix, polls the phones' events, runs the game clock, paints the game into an overlay lease while a game is on
 * (released between games, so the show has its lights back) and publishes the game as the app's status.
 *
 * A game (game.mjs) gives: cleanSettings(raw) with at least { target, fps, brightness }, minSize { w, h }, and a class
 * with phase ('idle' when nothing is on), handle(client, data, now) -> '' or why not (for that phone only),
 * step(now), render(out, w, h, now), status() and message().
 *
 * Environment (set by the player): EZP_API_URL, EZP_APP_INSTANCE, EZP_APP_TOKEN.
 * Settings come from the instance's private data key "settings".
 */

import { Ending } from './ending.mjs';
import { machinesOff } from './machine.mjs';

const MAX_GRID_PIXELS = 40000;
const NOTICE_MS = 5000;
const IDLE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// no request to the player may hang the game: a stalled player would freeze the lights and the phones
const within = (ms) => AbortSignal.timeout(ms);

export async function run({ name, Game, cleanSettings, minSize }) {
    const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
    const instance = process.env.EZP_APP_INSTANCE;
    const token = process.env.EZP_APP_TOKEN;
    if (!instance || !token) {
        console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
        process.exit(1);
    }
    const authHeaders = { 'x-ezp-app-token': token };
    const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
    const appUrl = (path) => `${base}/api/ezp/apps/${encodeURIComponent(instance)}${path}`;

    async function findTarget(model) {
        const res = await fetch(`${base}/api/ezp/overlays/targets?model=${encodeURIComponent(model)}&detail=submodels`, { signal: within(5000) });
        if (!res.ok) throw new Error(`targets: HTTP ${res.status}`);
        const { targets = [] } = await res.json();
        return targets.find((t) => (t.target ?? t.model) === model) ?? null;
    }

    async function loadConfig() {
        const res = await fetch(appUrl('/data/private/settings'), { headers: authHeaders, signal: within(5000) });
        if (res.status === 404) return { error: 'Not set up yet: open the app settings and pick a matrix.' };
        if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
        const settings = cleanSettings(await res.json().catch(() => null));
        if (!settings.target) return { error: 'Not set up yet: no matrix chosen in the app settings.' };
        const t = await findTarget(settings.target);
        if (!t) return { error: `"${settings.target}" is not in the show any more; check the app settings.` };
        let w = t.width, h = t.height;
        if (!(w >= minSize.w && h >= minSize.h)) return { error: `"${settings.target}" is too small (it needs at least ${minSize.w} x ${minSize.h} pixels).` };
        if (w * h > MAX_GRID_PIXELS) {
            const k = Math.sqrt(MAX_GRID_PIXELS / (w * h));
            w = Math.max(minSize.w, Math.round(w * k));   // never below the game's own minimum (a very long, thin matrix)
            h = Math.max(minSize.h, Math.round(h * k));
        }
        return { settings, target: { name: t.target ?? t.model, width: w, height: h } };
    }

    async function openLease(body) {
        // The app token puts the instance title on the lease, so a refused game names who has the matrix.
        const res = await fetch(`${base}/api/ezp/overlays`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ ...body, mode: 'exclusive', blend: 'replace', ttlMs: 10_000 }),
            signal: within(5000),
        });
        const opened = await res.json().catch(() => ({}));
        if (!opened.ok || !opened.lease) throw new Error(opened.error ?? `HTTP ${res.status}`);
        return { ...opened.lease, payload: new Uint8Array(opened.lease.frameBytes), seq: 1 };
    }
    const closeLease = async (lease) => {
        if (lease) await fetch(`${base}/api/ezp/overlays/${lease.id}?token=${lease.token}`, { method: 'DELETE', signal: within(3000) }).catch(() => undefined);
    };
    const putFrame = (lease) =>
        fetch(`${base}/api/ezp/overlays/${lease.id}/frame?token=${lease.token}&seq=${lease.seq++}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/octet-stream' },
            body: lease.payload,
            signal: within(3000),
        }).then((r) => r.ok, () => false);
    const publishStatus = (status) =>
        fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status), signal: within(3000) }).catch(() => undefined);

    let quit = false;
    const poll = new AbortController();
    const stop = () => {
        quit = true;
        poll.abort();
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);

    let config = null;
    let configError = 'Starting up';
    let lastConfigCheck = -Infinity;
    let game = new Game(cleanSettings(null));
    const ending = new Ending();   // a sound, the words, a machine when someone wins or loses (game.outcome())
    game.ending = ending;
    let endPhase = game.phase;
    let lease = null;
    const notices = new Map();
    const note = (client, text) => { if (client && text) notices.set(client, { text, at: Date.now() }); };
    const startedAt = Date.now();

    const handleEvent = (ev) => {
        const d = ev?.data;
        if (!d || typeof d !== 'object') return;
        const client = typeof ev.client === 'string' && ev.client ? ev.client : null;
        if (!client) return;
        if ((Game.startTypes ?? ['new']).includes(d.type) && !config) return note(client, configError);
        note(client, game.handle(client, d, Date.now()));
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
                    if (ev.ts >= startedAt - 2000) handleEvent(ev);   // events queued before this process started are stale
                }
            } catch (e) {
                if (quit) return;
                console.log(`events: ${e.message}`);
                await sleep(2000);
            }
        }
    })();

    // a game that keeps something across restarts (the tree's baubles) has saveState() and restore(saved): kept in the
    // instance's private "state" document, which a reinstall of the app keeps too
    // Nothing is saved until the saved state has been read (or there is none yet, 404): a player that was not ready at
    // start must not get an empty book or tree written over the saved one.
    let savedJson = '';
    let savedAt = 0;
    let stateReady = false;
    let stateTriedAt = -Infinity;
    const loadState = async (now) => {
        stateTriedAt = now;
        try {
            const res = await fetch(appUrl('/data/private/state'), { headers: authHeaders, signal: within(5000) });
            if (res.ok) { const st = await res.json(); game.restore?.(st); savedJson = JSON.stringify(st); stateReady = true; }
            else if (res.status === 404) stateReady = true;
            else console.log(`state: HTTP ${res.status}`);
        } catch (e) { console.log(`state: ${e.message}`); }
    };
    if (game.saveState) await loadState(Date.now());
    const saveState = async (now) => {
        if (!stateReady) { if (now - stateTriedAt > 10_000) await loadState(now); return; }
        const j = JSON.stringify(game.saveState());
        if (j === savedJson || now - savedAt < 2000) return;
        savedAt = now;
        const res = await fetch(appUrl('/data/private/state'), { method: 'PUT', headers: jsonHeaders, body: j, signal: within(5000) }).catch(() => null);
        if (res?.ok) savedJson = j;
    };

    let lastJson = '';
    let lastAt = 0;
    let lastPhase = '';
    let leaseFailedAt = 0;
    let frameFails = 0;
    while (!quit) {
      try {   // one bad frame or game step must not stop the app: the game starts again
        const now = Date.now();
        if (game.phase === 'idle' && now - lastConfigCheck > 5000) {   // settings are re-read between games
            lastConfigCheck = now;
            try {
                const c = await loadConfig();
                config = c.settings ? c : null;
                configError = c.error ?? '';
                if (config) { game.s = config.settings; game.size?.(config.target.width, config.target.height); }
            } catch (e) {
                config = null;
                configError = `Player not reachable: ${e.message}`;
            }
        }

        if (game.phase !== 'idle' && !lease && config && now - leaseFailedAt > 3000) {
            try {
                const t = config.target;
                lease = await openLease({ model: t.name, format: 'grid', width: t.width, height: t.height, name });
                frameFails = 0;
                console.log(`Lease ${lease.id} on ${t.name} (${lease.width} x ${lease.height})`);
                game.size?.(lease.width, lease.height);
            } catch (e) {
                leaseFailedAt = now;
                console.log(`Could not open the lease: ${e.message}`);
                for (const p of game.players ?? []) note(p.id, `Could not start: ${e.message}`);
                game.reset();
                lastConfigCheck = -Infinity;
            }
        }

        game.step(Date.now());
        if (game.phase !== endPhase) {
            endPhase = game.phase;
            if ((endPhase === 'finished' || endPhase === 'over') && game.outcome) {
                try { const o = game.outcome(); if (o) ending.fire(game.s, o.kind, o.vars); } catch (e) { console.log('ending:', e.message); }
            }
        }
        if (game.saveState) await saveState(now);

        if (lease) {
            if (game.phase === 'idle') {
                const l = lease;
                lease = null;
                ending.banner = null;   // a banner cut short is not shown over the next game
                await closeLease(l);
            } else {
                lease.payload.fill(0);
                game.render(lease.payload, lease.width, lease.height, Date.now());
                ending.draw(lease.payload, lease.width, lease.height, Date.now());
                const k = (game.s.brightness ?? 100) / 100;
                if (k < 1) for (let i = 0; i < lease.payload.length; i++) lease.payload[i] = lease.payload[i] * k;
                if (await putFrame(lease)) frameFails = 0;
                else if (++frameFails >= 3) {   // the lease is gone (the player restarted, or it expired while the player stalled): opened again
                    console.log('Frames refused: opening the lease again');
                    const l = lease;
                    lease = null;
                    leaseFailedAt = Date.now();   // not again at once: the next try is in 3 s
                    await closeLease(l);
                }
            }
        }

        for (const [c, n] of notices) if (now - n.at > NOTICE_MS) notices.delete(c);
        const status = {
            ...game.status(),
            phase: config || game.phase !== 'idle' ? game.phase : 'unconfigured',
            message: !config && game.phase === 'idle' ? configError : game.message(),
            notices: Object.fromEntries([...notices].map(([c, n]) => [c, n.text])),
        };
        const json = JSON.stringify(status);
        // real-time games change every frame: the phones get them a few times a second (at once when the phase changes)
        if ((json !== lastJson && (now - lastAt >= (game.statusMs ?? 0) || status.phase !== lastPhase)) || now - lastAt > 2000) {
            lastJson = json;
            lastAt = now;
            lastPhase = status.phase;
            await publishStatus(status);
        }
        await sleep(lease ? Math.max(5, 1000 / (game.s.fps || 15) - (Date.now() - now)) : IDLE_MS);
      } catch (e) {
        console.log(`error: ${e?.stack ?? e}`);
        try { game.reset(); } catch { /* nothing more to do */ }
        await sleep(1000);
      }
    }

    if (game.saveState && stateReady) { savedAt = 0; await saveState(Date.now()); }
    await machinesOff();   // a machine (bubbles, fog, lights) never stays on when the app stops
    await closeLease(lease);
    await publishStatus({ phase: 'idle', players: [], message: 'App stopped', notices: {} });
}

// ---- small helpers the games share ----

export const hexRgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

export function hsv(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6].map((x) => x * 255);
}

/** a pixel setter for a w x h RGB frame */
export function painter(out, w, h) {
    return (x, y, c, k = 1) => {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const o = (y * w + x) * 3;
        out[o] = Math.min(255, c[0] * k);
        out[o + 1] = Math.min(255, c[1] * k);
        out[o + 2] = Math.min(255, c[2] * k);
    };
}

export const cleanName = (name, d) => String(name ?? '').replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, 16) || d;

export function num(v, lo, hi, d) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d;
}

export function hex(v, d) {
    const c = String(v ?? '').replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(c) ? c : d;
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
