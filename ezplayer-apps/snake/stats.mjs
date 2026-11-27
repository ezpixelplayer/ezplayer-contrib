// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Statistics: every app tells the host panel what happened (a game played, with its players and scores; a visitor
 * using an app), and the panel keeps them night by night. An app sends an event to each running host-panel instance
 * (any app with id "host-panel" or "<pack>-host-panel"), found with the player's own list of instances. Nothing here
 * can slow or stop an app: a missing panel, a refused or slow request is simply skipped.
 *
 *   import { statsReporter } from './stats.mjs';
 *   const stats = statsReporter();
 *   stats.game({ players: [{ name: 'Ana', score: 12 }], winner: 'Ana', cpuWon: false });
 *   stats.use(1, 'message');
 */

const BASE = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const APP = process.env.EZP_APP_ID ?? '', INSTANCE = process.env.EZP_APP_INSTANCE ?? '';
const isPanel = (id) => id === 'host-panel' || /^[a-z0-9]+-host-panel$/.test(String(id));
const within = (ms) => AbortSignal.timeout(ms);
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);

export function statsReporter() {
    let panels = [], foundAt = 0, finding = null;
    const find = async () => {
        if (Date.now() - foundAt < 60_000) return panels;
        if (!finding) finding = (async () => {
            try {
                const r = await fetch(`${BASE}/api/ezp/apps`, { signal: within(3000) });
                const o = r.ok ? await r.json() : null;
                panels = (o?.instances ?? []).filter((i) => isPanel(i.appId) && i.name !== INSTANCE && ['running', 'starting'].includes(i.state)).map((i) => i.name);
            } catch { panels = []; }
            foundAt = Date.now(); finding = null;
            return panels;
        })();
        return finding;
    };
    const send = (data) => {
        if (!APP || isPanel(APP)) return;
        void (async () => {
            for (const name of await find()) {
                await fetch(`${BASE}/api/ezp/apps/${encodeURIComponent(name)}/events`, {
                    method: 'POST', headers: { 'content-type': 'application/json' }, signal: within(3000),
                    body: JSON.stringify({ client: `app:${INSTANCE}`.slice(0, 64), data: { type: 'stat', app: APP, inst: INSTANCE, at: Date.now(), ...data } }),
                }).catch(() => undefined);
            }
        })();
    };
    return {
        /** a game played: players [{ name, score? }] (people only), winner (a name, or ''), cpuWon, score (the game's own best number) */
        game(r) {
            if (!r || typeof r !== 'object') return;   // a game nobody played, or that was stopped
            const players = (Array.isArray(r.players) ? r.players : []).slice(0, 12)
                .map((p) => ({ name: clip(p?.name, 24), ...(Number.isFinite(p?.score) ? { score: Math.round(p.score) } : {}) }));
            send({ kind: 'game', players, winner: clip(r.winner, 40), cpuWon: !!r.cpuWon, ...(r.what ? { what: clip(r.what, 24) } : {}) });
        },
        /** visitors used an app n times (a message, a decoration, a photo…); what: which part of it, optional */
        use(n = 1, what = '') { if (n > 0) send({ kind: 'use', n: Math.min(1000, Math.round(n)), ...(what ? { what: clip(what, 24) } : {}) }); },
    };
}
