// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Finishes the built settings page of Decorate the tree 2.0 (config/index.html; build.mjs runs it as "afterBuild", also
 * on each theme pack's copy). The shared settings page has no field for these, so they are added here:
 *   - "front": the front of a round tree, turned in 15° steps while a white stripe shows it on the tree;
 *   - "ctest": the 🎨 colour test: bands of colour on the tree for 120 s; while it shows, the gamma, balance and dim
 *     inputs are tried live (the app uses them for the test only, until Save);
 *   - in a theme pack: the pack's decorations in "Decorations visitors can hang" and its tree colour as the default.
 * Both live parts write ONE private document, "calib" ({ deg, mirror, secs, test, gamma, balR, balG, balB, dim, n }),
 * which the app reads twice a second (multi.mjs, app.live) and acts on each new n. Running it twice changes nothing.
 *
 *   node ezplayer-apps/_tools/build.mjs ezplayer-apps/decorate-the-tree-2
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARK = '// the live parts (decorate-the-tree-2)';

const CSS = `  .frontRow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
  .frontRow button { margin: 0; padding: 10px 14px; }
  .frontBtn { display: block; margin-top: 8px; }
  #fr_val { min-width: 96px; text-align: center; font-weight: 700; }
  #ct_note { color: var(--accent); min-height: 18px; margin-top: 4px; }
</style>`;

const CODE = `  let app;
  ${MARK}: the front of a round tree (a white stripe) and the colour test, in the private "calib" document
  const front = { deg: 0, mirror: false, on: false }, ct = { on: false, timer: 0, end: 0 };
  let liveN = Date.now() % 1000000;
  const CT_KEYS = ['gamma', 'balR', 'balG', 'balB', 'dim'];
  function frontShow() {
    const v = el('fr_val'); if (!v) return;
    v.textContent = front.deg + '°' + (front.mirror ? ' · inverted' : '');
    el('fr_show').textContent = front.on ? '⏹ Stop showing the front' : '💡 Show the front on the tree';
  }
  function ctShow() {
    const b = el('ct_show'); if (!b) return;
    b.textContent = ct.on ? '⏹ Stop the colour test' : '🎨 Show the colour test';
  }
  function liveSend() {
    frontShow(); ctShow();
    if (!app) return;
    const o = { deg: front.deg, mirror: front.mirror, secs: front.on ? 120 : 0, test: ct.on ? 120 : 0, n: ++liveN };
    for (const k of CT_KEYS) { const i = el('f_' + k); if (i) o[k] = Number(i.value); }
    app.put('private', 'calib', o).catch((e) => { el('note').textContent = 'Could not reach the app: ' + e.message; });
  }
  function frontSend() { liveSend(); }
  function ctToggle() {
    ct.on = !ct.on; clearTimeout(ct.end);
    if (ct.on) ct.end = setTimeout(() => { ct.on = false; ctShow(); }, 120000);   // the app stops it by itself after 2 minutes
    el('ct_note').textContent = ct.on ? 'Showing for 2 minutes. Change the values below: the tree follows at once. Save keeps them.' : '';
    liveSend();
  }
  // while the test shows, every change of gamma, balance or dim goes to the tree at once
  document.addEventListener('input', (e) => {
    if (!ct.on || !e.target || !CT_KEYS.includes(e.target.dataset.f)) return;
    clearTimeout(ct.timer); ct.timer = setTimeout(liveSend, 250);
  });`;

const FIELD = `      if (f.type === 'front') {
        const wrap = document.createElement('div');
        const l = document.createElement('label'); l.textContent = f.label;
        const line = document.createElement('div'); line.className = 'frontRow';
        const mkB = (t, id, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = t; b.addEventListener('click', fn); return b; };
        const val = document.createElement('span'); val.id = 'fr_val';
        const showB = mkB('', 'fr_show', () => { front.on = !front.on; frontSend(); }), invB = mkB('⇄ Invert left and right', 'fr_inv', () => { front.mirror = !front.mirror; front.on = true; frontSend(); });
        showB.className = invB.className = 'frontBtn';
        line.append(mkB('◀ 15°', 'fr_left', () => { front.deg = (front.deg + 345) % 360; front.on = true; frontSend(); }), val,
          mkB('15° ▶', 'fr_right', () => { front.deg = (front.deg + 15) % 360; front.on = true; frontSend(); }));
        const h = document.createElement('p'); h.className = 'hint';
        h.textContent = 'Only for a round (360°) mega tree. Press Show: a white stripe lights the tree from top to bottom where the app takes the front to be. Turn it with ◀ ▶ until it faces the visitors (the street, the door). If ▶ moves it to the left as you look at the tree, press Invert. Then Save: on the phones, the middle of the tree is that stripe.';
        wrap.append(l, showB, line, invB, h); box.append(wrap); row = null; frontShow();
        continue;
      }
      if (f.type === 'ctest') {
        const wrap = document.createElement('div');
        const l = document.createElement('label'); l.textContent = f.label;
        const b = document.createElement('button'); b.type = 'button'; b.id = 'ct_show'; b.className = 'frontBtn'; b.addEventListener('click', ctToggle);
        const n = document.createElement('div'); n.id = 'ct_note';
        const h = document.createElement('p'); h.className = 'hint';
        h.textContent = 'The tree lights in bands, from the top: pure red, pure green, pure blue (sent as they are), the 8 decoration colours, white, a 50 % grey and the tree\\'s dim colour; the star goes red, green, blue, 2 s each. If the red band is not red, the model\\'s colour order (RGB/GRB/BRG…) is wrong in xLights or the controller — fix it there, not here (the same for the star). Then, standing where the visitors stand: raise the gamma if the colours look pale or washed out (gold looks yellow-white, the dim tree looks cyan), lower it if they look too dark and harsh; lower Green or Blue if white looks green or blue; set the dim level so the tree is just visible. LEDs are linear and the phones are not: without gamma, mixed colours wash out.';
        wrap.append(l, b, n, h); box.append(wrap); row = null; ctShow();
        continue;
      }
      if (f.type === 'models') {`;

export async function finish(dir) {
    const file = path.join(dir, 'config', 'index.html');
    let s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (s.includes(MARK)) return false;
    const edits = [
        ['</style>', CSS],
        ['  let app;', CODE],
        ["      if (f.type === 'models') {", FIELD],
        ["      if (f.section || f.type === 'models') continue;\n      const v = s[f.id]",
            "      if (f.section || f.type === 'models' || f.type === 'ctest') continue;\n      if (f.type === 'front') { front.deg = Number.isFinite(s.frontDeg) ? s.frontDeg : 0; front.mirror = !!s.mirror; frontShow(); continue; }\n      const v = s[f.id]"],
        ["      if (f.section || f.type === 'models') continue;\n      if (f.type === 'checks') out[f.id]",
            "      if (f.section || f.type === 'models' || f.type === 'ctest') continue;\n      if (f.type === 'front') { out.frontDeg = front.deg; out.mirror = front.mirror; continue; }\n      if (f.type === 'checks') out[f.id]"],
    ];
    for (const [a, b] of edits) {
        if (s.split(a).length !== 2) throw new Error(`${file}: "${a.slice(0, 60)}" not found once`);
        s = s.replace(a, () => b);
    }
    // a theme pack: its decorations and its tree colour (theme.mjs is the pack's)
    const { THEME = {} } = await import(pathToFileURL(path.join(dir, 'theme.mjs')).href);
    if (THEME.kinds || THEME.treeColor) {
        s = s.replace(/^(\s*const FIELDS = )(.*);$/m, (_, a, j) => {
            const fields = JSON.parse(j);
            for (const f of fields) {
                if (f.id === 'kinds' && THEME.kinds) { f.options = THEME.kinds.map(([k, n]) => [k, n]); f.default = THEME.kinds.map(([k]) => k); }
                if (f.id === 'treeColor' && THEME.treeColor) f.default = THEME.treeColor;
            }
            return a + JSON.stringify(fields) + ';';
        });
    }
    fs.writeFileSync(file, s);
    return true;
}

if (process.argv[2]) await finish(path.resolve(process.argv[2]));
