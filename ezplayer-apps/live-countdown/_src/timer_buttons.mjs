// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Adds the Start / Stop / Reset buttons to the built settings page (config/index.html): the shared settings page has
 * no buttons, so the field { "type": "timer" } of _src/config.json is drawn here. Run it after every build of this
 * app or of its pack versions (build.mjs and make_pack.mjs write config/index.html again without the buttons):
 *
 *   node _tools/build.mjs live-countdown && node live-countdown/_src/timer_buttons.mjs
 *   node <pack folder>/_src/timer_buttons.mjs            (each pack version patches its own page)
 *
 * The buttons write the private "timer" document { cmd, mins, n }; the app reads it twice a second (game.onLive).
 * Without this step the page still works, with a plain box in place of the buttons (ignored by the app); the show
 * input "start" also starts the countdown. Running it twice changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '// live-countdown: Start / Stop / Reset';
const JS = `  ${MARK}: written to the private "timer" document, which the app reads twice a second
  const timer = { n: Date.now() };
  function timerSend(cmd) {
    if (!app) return;
    const i = el('f_relMins'), mins = Math.max(1, Math.min(720, Math.round(Number(i && i.value) || 10)));
    app.put('private', 'timer', { cmd, mins, n: ++timer.n })
      .then(() => { el('tm_note').textContent = cmd === 'start' ? 'Started (a stopped countdown goes on from where it was).' : cmd === 'stop' ? 'Stopped.' : 'Reset: back to the moment picked above.'; })
      .catch((e) => { el('tm_note').textContent = 'Could not send it: ' + e.message; });
  }
  function timerShow(s) {
    const v = el('tm_state'); if (!v || !s) return;
    const p2 = (n) => String(n).padStart(2, '0'), clock = (ms) => { const S = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(S / 3600) + ':' + p2(Math.floor(S / 60) % 60) + ':' + p2(S % 60); };
    v.textContent = s.paused != null ? 'Stopped with ' + clock(s.paused) + ' left.' : s.target != null ? 'Counting down to ' + (s.when || '?') + (s.started ? ' (started with Start).' : '.') : 'No countdown now.';
  }
`;
const BUILD = `      if (f.type === 'timer') {
        const wrap = document.createElement('div');
        const l = document.createElement('label'); l.textContent = f.label;
        const line = document.createElement('div'); line.className = 'timerRow';
        const mkB = (t, cmd) => { const b = document.createElement('button'); b.type = 'button'; b.id = 'tm_' + cmd; b.textContent = t; b.addEventListener('click', () => timerSend(cmd)); return b; };
        line.append(mkB('▶ Start', 'start'), mkB('⏸ Stop', 'stop'), mkB('↺ Reset', 'reset'));
        const st = document.createElement('p'); st.className = 'hint'; st.id = 'tm_state';
        const nt = document.createElement('p'); nt.className = 'hint'; nt.id = 'tm_note';
        wrap.append(l, line, st, nt); box.append(wrap); row = null;
        continue;
      }
`;
const EDITS = [
    ['</style>', '  .timerRow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }\n</style>', 1],
    ['  let app;\n', '  let app;\n' + JS, 1],
    ["      if (f.type === 'models') {\n", BUILD + "      if (f.type === 'models') {\n", 1],
    ["      if (f.section || f.type === 'models') continue;\n", "      if (f.section || f.type === 'models' || f.type === 'timer') continue;\n", 2],
    ["app.onStatus((s) => { el('status').textContent = JSON.stringify(s, null, 2); });", "app.onStatus((s) => { el('status').textContent = JSON.stringify(s, null, 2); timerShow(s); });", 1],
];

export function addButtons(appDir) {
    const file = path.join(appDir, 'config', 'index.html');
    let s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (s.includes(MARK)) return 'already';
    for (const [from, to, n] of EDITS) {
        const found = s.split(from).length - 1;
        if (found !== n) throw new Error(`${file}: "${from.trim().slice(0, 50)}" found ${found} times, ${n} expected (the shared settings page changed)`);
        s = s.split(from).join(to);
    }
    fs.writeFileSync(file, s);
    return 'patched';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    console.log(addButtons(dir), path.join(dir, 'config', 'index.html'));
}
