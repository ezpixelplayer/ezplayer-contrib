// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Agenda's settings page is its own page, not the generic one: run this AFTER _tools/build.mjs (which writes the
 * generic config/index.html) to replace it with _src/agenda.html, filled in with
 *   - the app's name and icon (from ezapp.json, so a theme pack's own name shows),
 *   - the colours of theme.mjs (const THEME),
 *   - the rules of plan.mjs (the "//@include plan.mjs" line, its "export " words removed).
 *
 *   node _src/config.mjs [app folder]        (default: the folder above this file)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const man = JSON.parse(read('ezapp.json'));
const { THEME } = await import(pathToFileURL(path.join(dir, 'theme.mjs')).href);
const theme = { accent: THEME.accent, cols: THEME.cols };
const plan = read('plan.mjs').replace(/^\/\/ This code is.*\n/gm, '').replace(/^export /gm, '');
let html = read('_src/agenda.html')
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(man.name)} settings</title>`)
    .replace(/<h1>[^<]*<\/h1>/, `<h1>${esc(man.icon ?? '')} ${esc(man.name)} settings</h1>`)
    .replace(/const THEME = \{\};/, () => `const THEME = ${JSON.stringify(theme)};`)
    .replace(/^[ \t]*\/\/@include plan\.mjs[ \t]*$/m, () => plan);
fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
fs.writeFileSync(path.join(dir, 'config/index.html'), html);
console.log('settings page written', path.join(dir, 'config/index.html'));
