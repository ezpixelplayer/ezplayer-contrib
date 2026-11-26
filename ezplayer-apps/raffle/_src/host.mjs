// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Adds the host's panel to the raffle's built settings page (config/index.html): the "Draw now", "Start again" and
 * "Empty the visitors' list" buttons, what is in the draw and the winners so far. The shared settings page has no
 * field for buttons, so this runs after the page is built (and after make_pack.mjs, on each pack's copy):
 *
 *   node _tools/build.mjs ezplayer-apps/raffle && node ezplayer-apps/raffle/_src/host.mjs ezplayer-apps/raffle
 *
 * The buttons write the private document "draw" ({ what, n }); the app reads it twice a second (player.mjs, game.live)
 * and acts on each new n. Running it twice changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '// the host\'s buttons (raffle)';

const CSS = `  .hostBtns { display: flex; flex-wrap: wrap; gap: 10px; }
  .hostBtns button { margin-top: 8px; }
  .hostBtns button.ghost { color: var(--text); background: #2a2140; border: 1px solid var(--line); }
  #h_draw { font-size: 20px; padding: 14px 26px; }
  #h_info { font-weight: 600; margin-top: 10px; }
  #h_note { color: var(--accent); min-height: 20px; margin-top: 4px; }
  #h_past { max-height: 200px; overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 14px; margin-top: 6px; }
</style>`;

const CODE = `  let app;
  ${MARK}: the app reads the private "draw" document twice a second; each press has a new n
  let hostN = Date.now();
  function hostSend(what, ask) {
    if (ask && !confirm(ask)) return;
    if (!app) { el('h_note').textContent = 'Not connected to the player yet.'; return; }
    el('h_note').textContent = what === 'draw' ? 'Drawing…' : 'Sent…';
    app.put('private', 'draw', { what, n: ++hostN }).catch((e) => { el('h_note').textContent = 'Could not reach the app: ' + e.message; });
  }
  function hostStatus(s) {
    if (!el('h_info') || !s) return;
    const busy = s.phase === 'spinning' || s.phase === 'over';
    el('h_draw').disabled = busy || s.phase === 'unconfigured';
    el('h_info').textContent = (s.count ? s.count + ' in the draw' + (s.removeWinners && s.left < s.count ? ', ' + s.left + ' still to win' : '') : 'Nobody is in the draw yet')
      + (s.visitorsOn ? ' · ' + (s.joined || 0) + ' joined from their phone' + (s.open ? '' : ' (entries closed)') : '');
    el('h_note').textContent = s.message || '';
    const past = s.past || [];
    el('h_past').replaceChildren(...past.map((p) => { const d = document.createElement('div'); d.textContent = 'Draw ' + p.d + ': ' + p.name; return d; }));
    if (!past.length) el('h_past').textContent = 'No winners yet.';
  }`;

const FIELD = `      if (f.type === 'host') {
        const wrap = document.createElement('div');
        const l = document.createElement('label'); l.textContent = f.label;
        const line = document.createElement('div'); line.className = 'hostBtns';
        const mkB = (t, id, fn, ghost) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = t; if (ghost) b.className = 'ghost'; b.addEventListener('click', fn); return b; };
        line.append(mkB('🎲 Draw now', 'h_draw', () => hostSend('draw')),
          mkB('🔁 Start again', 'h_clear', () => hostSend('clear', 'Start again? The list of winners is cleared and everyone is back in the draw.'), true),
          mkB("🧹 Empty the visitors' list", 'h_clearV', () => hostSend('clearVisitors', "Empty the visitors' list? Everyone who joined from their phone must join again."), true));
        const info = document.createElement('div'); info.id = 'h_info'; info.textContent = 'Waiting for the app…';
        const note = document.createElement('div'); note.id = 'h_note';
        const pl = document.createElement('label'); pl.textContent = 'Winners so far (the latest 30, newest first)';
        const past = document.createElement('div'); past.id = 'h_past'; past.textContent = 'No winners yet.';
        const h = document.createElement('p'); h.className = 'hint'; h.textContent = 'A show button can draw too: map a show input to this app\\'s input "draw" (Apps tile, inputs). Visitors can never start a draw.';
        wrap.append(l, line, info, note, pl, past, h); box.append(wrap); row = null;
        continue;
      }
      if (f.type === 'models') {`;

export function addHost(dir) {
    const file = path.join(dir, 'config', 'index.html');
    let s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (s.includes(MARK)) return false;
    const edits = [
        ['</style>', CSS],
        ['  let app;', CODE],
        ["      if (f.type === 'models') {", FIELD],
        ["app.onStatus((s) => { el('status').textContent = JSON.stringify(s, null, 2); });", "app.onStatus((s) => { el('status').textContent = JSON.stringify(s, null, 2); hostStatus(s); });"],
    ];
    for (const [a, b] of edits) {
        if (s.split(a).length !== 2) throw new Error(`${file}: "${a.slice(0, 50)}" not found once`);
        s = s.replace(a, () => b);
    }
    // the panel has no value to load or save
    const skip = "if (f.section || f.type === 'models') continue;";
    if (s.split(skip).length !== 3) throw new Error(`${file}: fill/gather not as expected`);
    s = s.split(skip).join("if (f.section || f.type === 'models' || f.type === 'host') continue;");
    fs.writeFileSync(file, s);
    return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dirs = process.argv.slice(2);
    if (!dirs.length) { console.log('usage: node _src/host.mjs <raffle app folder>...'); process.exit(1); }
    for (const d of dirs) console.log(addHost(path.resolve(d)) ? 'host panel added:' : 'already has the host panel:', d);
}
