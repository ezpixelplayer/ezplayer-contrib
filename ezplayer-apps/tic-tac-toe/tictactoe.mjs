// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Tic-tac-toe, as an EZPlayer app.
 *
 * A phone starts a game against the computer (easy, normal or hard) or against a friend, whose phone joins from the
 * same page. Moves arrive as app events; this program checks them, plays the computer's moves, runs the turn timer,
 * paints the board on a matrix of the show through an overlay lease while a game is on, and publishes the game as
 * the app's status for every phone to draw (players and anyone watching). Between games the lease is released so
 * the show has its lights back.
 *
 * The rules and the drawing are in game.mjs; this file only talks to the player.
 * Environment (set by the player): EZP_API_URL, EZP_APP_INSTANCE, EZP_APP_TOKEN.
 * Settings come from the instance's private data key "settings".
 */

import { Game, cleanSettings, render } from './game.mjs';
import { Ending } from './ending.mjs';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_GRID_PIXELS = 40000;
const NOTICE_MS = 5000;
const IDLE_MS = 250;

// ---- Player API: settings, targets, leases, status ----

async function findTarget(name) {
    const res = await fetch(`${base}/api/ezp/overlays/targets?model=${encodeURIComponent(name)}&detail=submodels`);
    if (!res.ok) throw new Error(`targets: HTTP ${res.status}`);
    const { targets = [] } = await res.json();
    return targets.find((t) => (t.target ?? t.model) === name) ?? null;
}

async function loadConfig() {
    const res = await fetch(appUrl('/data/private/settings'), { headers: authHeaders });
    if (res.status === 404) return { error: 'Not set up yet: open the app settings and pick a matrix.' };
    if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
    const settings = cleanSettings(await res.json().catch(() => null));
    if (!settings.target) return { error: 'Not set up yet: no matrix chosen in the app settings.' };
    const t = await findTarget(settings.target);
    if (!t) return { error: `"${settings.target}" is not in the show any more; check the app settings.` };
    let w = t.width, h = t.height;
    if (!(w >= 6 && h >= 6)) return { error: `"${settings.target}" is not a matrix (it needs at least 6 x 6 pixels).` };
    if (w * h > MAX_GRID_PIXELS) {
        const k = Math.sqrt(MAX_GRID_PIXELS / (w * h));
        w = Math.round(w * k);
        h = Math.round(h * k);
    }
    return { settings, target: { name: t.target ?? t.model, width: w, height: h } };
}

async function openLease(body) {
    // The app token puts the instance title on the lease, so a refused game names who has the matrix.
    const res = await fetch(`${base}/api/ezp/overlays`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ ...body, mode: 'exclusive', blend: 'replace', ttlMs: 10_000 }),
    });
    const opened = await res.json().catch(() => ({}));
    if (!opened.ok || !opened.lease) throw new Error(opened.error ?? `HTTP ${res.status}`);
    return { ...opened.lease, payload: new Uint8Array(opened.lease.frameBytes), seq: 1 };
}

async function closeLease(lease) {
    if (!lease) return;
    await fetch(`${base}/api/ezp/overlays/${lease.id}?token=${lease.token}`, { method: 'DELETE' }).catch(() => undefined);
}

function putFrame(lease) {
    return fetch(`${base}/api/ezp/overlays/${lease.id}/frame?token=${lease.token}&seq=${lease.seq++}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: lease.payload,
    }).catch(() => undefined);
}

async function publishStatus(status) {
    await fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status) }).catch(() => undefined);
}

// ---- Main ----

async function main() {
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
    let lease = null;
    let pending = null;              // { client, data } of a phone asking for a new game; the main loop opens it
    const notices = new Map();       // client -> { text, at }: why a request was refused, for that phone only
    const startedAt = Date.now();
    const note = (client, text) => { if (client && text) notices.set(client, { text, at: Date.now() }); };

    const handleEvent = (ev) => {
        const d = ev?.data;
        if (!d || typeof d !== 'object') return;
        const client = typeof ev.client === 'string' && ev.client ? ev.client : null;
        if (!client) return;
        const now = Date.now();
        if (d.type === 'new') {
            if (game.phase === 'waiting' || game.phase === 'playing') note(client, 'A game is already on. Wait for it to end.');
            else if (!pending) pending = { client, data: d };
        } else if (d.type === 'join') note(client, game.join(client, d, now));
        else if (d.type === 'move') note(client, game.move(client, d.cell, d.game, now, d.n));
        else if (d.type === 'quit') game.quit(client, now);
    };

    const pollEvents = async () => {
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
    };
    void pollEvents();

    let lastJson = '';
    let lastAt = 0;
    const ending = new Ending();   // a sound, the words, a machine when someone wins or loses
    let endPhase = game.phase;
    while (!quit) {
        const now = Date.now();
        if (game.phase === 'idle' && now - lastConfigCheck > 5000) {   // settings are re-read between games
            lastConfigCheck = now;
            try {
                const c = await loadConfig();
                config = c.settings ? c : null;
                configError = c.error ?? '';
                if (config) game.s = config.settings;
            } catch (e) {
                config = null;
                configError = `Player not reachable: ${e.message}`;
            }
        }

        if (pending) {
            const { client, data } = pending;
            pending = null;
            if (!config) note(client, configError);
            else {
                const why = game.open(client, data, now);
                if (why) note(client, why);
                else if (!lease) {
                    try {
                        const t = config.target;
                        lease = await openLease({ model: t.name, format: 'grid', width: t.width, height: t.height, name: 'tic-tac-toe' });
                        console.log(`Lease ${lease.id} on ${t.name} (${lease.width} x ${lease.height})`);
                    } catch (e) {
                        game.reset();
                        note(client, `Could not start: ${e.message}`);
                        console.log(`Could not open the lease: ${e.message}`);
                        lastConfigCheck = -Infinity;
                    }
                }
            }
        }

        game.step(now);
        if (game.phase !== endPhase) {
            endPhase = game.phase;
            if (endPhase === 'finished') { try { const o = game.outcome(); if (o) ending.fire(game.s, o.kind, o.vars); } catch (e) { console.log('ending:', e.message); } }
        }

        if (lease) {
            if (game.phase === 'idle') {
                const l = lease;
                lease = null;
                await closeLease(l);
            } else {
                render(lease.payload, lease.width, lease.height, game, game.s, now);
                ending.draw(lease.payload, lease.width, lease.height, now);
                await putFrame(lease);
            }
        }

        for (const [c, n] of notices) if (now - n.at > NOTICE_MS) notices.delete(c);
        const s = game.s;
        const status = {
            phase: config || game.phase !== 'idle' ? game.phase : 'unconfigured',
            game: game.id,
            mode: game.mode,
            level: game.level,
            board: game.board,
            turn: game.turn,
            players: game.players.map((p) => ({ id: p.id, name: p.name, mark: p.mark })),
            turnEndsAt: game.turnEndsAt,
            waitEndsAt: game.waitEndsAt,
            winner: game.winner,
            line: game.line,
            message: !config && game.phase === 'idle' ? configError : game.message(),
            notices: Object.fromEntries([...notices].map(([c, n]) => [c, n.text])),
            colors: { X: s.colorX, O: s.colorO },
            cpu: s.cpu,
            friend: s.friend,
            levels: s.levels,
            turnSecs: s.turnSecs,
        };
        const json = JSON.stringify(status);
        if (json !== lastJson || now - lastAt > 2000) {
            lastJson = json;
            lastAt = now;
            await publishStatus(status);
        }
        await sleep(lease ? 1000 / s.fps : IDLE_MS);
    }

    await closeLease(lease);
    await publishStatus({ phase: 'idle', game: 0, board: '.........', players: [], message: 'App stopped', notices: {} });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
