// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

// Host panel, as an EZPlayer app. All the work is in the settings page (config/index.html, made from _src/panel.html),
// which the player serves even while this process is stopped. The process only says it is there: no lease, no events.
import { THEME } from './theme.mjs';

const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const instance = process.env.EZP_APP_INSTANCE;
const token = process.env.EZP_APP_TOKEN;
if (!instance || !token) {
    console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
    process.exit(1);
}

const status = { phase: 'idle', message: 'Host panel ready', players: [], theme: THEME.key ?? 'christmas' };

// every request has a time limit, so a busy player never freezes the loop
function publish() {
    fetch(`${base}/api/ezp/apps/${encodeURIComponent(instance)}/status`, {
        method: 'PUT',
        headers: { 'x-ezp-app-token': token, 'content-type': 'application/json' },
        body: JSON.stringify(status),
        signal: AbortSignal.timeout(3000),
    }).then((r) => { if (!r.ok) console.log(`status: HTTP ${r.status}`); }, (e) => console.log(`status: ${e.message}`));
}

publish();
const timer = setInterval(publish, 30000);
const stop = () => { clearInterval(timer); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
console.log(`host panel ${instance} ready`);
