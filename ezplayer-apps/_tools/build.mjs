// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Builds an app's two pages from its _src folder, the way every ShowPlay app's pages are made:
 *   page/index.html   = the shared visitors' page (look, name box, connection, render loop) + _src/page.css,
 *                       _src/page.html and _src/page.js
 *   config/index.html = the shared settings page + the fields of _src/config.json
 * The shared parts are taken from a reference app (guestbook), so every page keeps the same look and SDK code.
 *
 *   node _tools/build.mjs <app folder> [more app folders...]
 *
 * _src/config.json: { title, icon, min: [w, h], fps, target: 'required' | 'optional' | 'none', targetLabel, intro, fields,
 *                     afterBuild: 'raffle/_src/host.mjs' (optional: a script, relative to ezplayer-apps, run with the app folder
 *                     after the pages are built, for settings pages that need more than the shared fields) }
 * A line "//@include file.mjs" in page.js is replaced by that file of the app with its "export " words removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = path.join(HERE, '..', 'guestbook');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// JSON written like the other settings pages: ", " and ": " between the parts
const fmt = (v) => (Array.isArray(v) ? '[' + v.map(fmt).join(', ') + ']'
    : v && typeof v === 'object' ? '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + fmt(x)).join(', ') + '}' : JSON.stringify(v));

// ---- the shared visitors' page, cut out of the reference app's built page
function pageParts() {
    const built = read(path.join(REF, 'page/index.html'));
    const css = read(path.join(REF, '_src/page.css')).trim(), html = read(path.join(REF, '_src/page.html')).trim(), js = read(path.join(REF, '_src/page.js')).trimEnd();
    const cut = (s, part, name) => { const i = s.indexOf(part); if (i < 0) throw new Error(`reference page: ${name} not found`); return [s.slice(0, i), s.slice(i + part.length)]; };
    let [head, rest] = cut(built, css, 'page.css');
    let [mid, rest2] = cut(rest, html, 'page.html');
    let [mid2, tail] = cut(rest2, js, 'page.js');
    return { head, mid, mid2, tail };
}

// ---- the shared settings page, from the reference app's built settings page
function configParts() {
    const built = read(path.join(REF, 'config/index.html'));
    const m = built.match(/^(\s*const FIELDS = ).*;$/m);
    if (!m) throw new Error('reference settings page: FIELDS not found');
    return built;
}

function includes(js, dir) {
    return js.replace(/^[ \t]*\/\/@include ([\w.-]+)\s*$/gm, (_, f) => read(path.join(dir, f)).replace(/^export /gm, '').replace(/^import .*$/gm, ''));
}

export function buildApp(dir) {
    const src = (f) => path.join(dir, '_src', f);
    const cfg = JSON.parse(read(src('config.json')));
    const P = pageParts();
    const title = cfg.title, icon = cfg.icon ?? '';
    let head = P.head.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    let mid = P.mid.replace(/<h1>[^<]*<\/h1>/, `<h1>${esc(icon)} ${esc(title)}</h1>`);
    const css = fs.existsSync(src('page.css')) ? read(src('page.css')).trim() : '';
    const html = read(src('page.html')).trim();
    const js = includes(read(src('page.js')).trimEnd(), dir);
    fs.mkdirSync(path.join(dir, 'page'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'page/index.html'), head + css + mid + html + P.mid2 + js + P.tail);

    let c = configParts();
    const min = cfg.min ?? [4, 4], target = cfg.target ?? 'required';
    c = c.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} settings</title>`)
        .replace(/<h1>[^<]*<\/h1>/, `<h1>${esc(icon)} ${esc(title)} settings</h1>`)
        .replace(/(<h1>[^<]*<\/h1>\n<p class="hint">)[^\n]*(<\/p>)/, (_, a, b) => a + esc(cfg.intro ?? '') + b)
        .replace(/(<label for="target">)[^<]*(<\/label>)/, (_, a, b) => a + esc(cfg.targetLabel ?? 'The matrix') + b)
        .replace(/const MIN = \{[^}]*\};/, `const MIN = { w: ${min[0]}, h: ${min[1]} };`)
        .replace(/^(\s*const FIELDS = ).*;$/m, (_, a) => a + fmt(cfg.fields ?? []) + ';')
        .replace(/const TARGET = "[a-z]+";/, `const TARGET = "${target}";`)
        .replace(/(id="fps" type="number" min="5" max="30" step="1" value=")\d+(")/, (_, a, b) => a + (cfg.fps ?? 20) + b);
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config/index.html'), c);
    // an app whose settings page needs more than the shared fields (buttons for the host, a whole panel) names a script,
    // relative to ezplayer-apps, that finishes the built pages; it gets the app folder (a pack's copy too)
    if (cfg.afterBuild) execFileSync(process.execPath, [path.join(HERE, '..', cfg.afterBuild), dir], { stdio: 'inherit' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dirs = process.argv.slice(2);
    if (!dirs.length) { console.log('usage: node _tools/build.mjs <app folder>...'); process.exit(1); }
    for (const d of dirs) { buildApp(path.resolve(d)); console.log('built', d); }
}
