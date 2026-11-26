// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Makes the theme-pack versions of a Christmas app: one folder per pack next to ezplayer-apps
 * (ezplayer-apps-<pack>/<pack>-<short>), each with its own id so it installs next to the Christmas app.
 *
 *   node _tools/make_pack.mjs <app id>
 *
 * The app keeps everything that changes with the season in theme.mjs (export const THEME = {...}; empty or the
 * Christmas words for the Christmas app) and _tools/packs/<app id>.json says, for each pack:
 *   { "short": "rhythm",                          the folder and id after "<pack>-"
 *     "packs": { "<pack>": { "name": "...", "description": "...", "icon": "🎃", "theme": { ... }, "intro": "..." } } }
 * "intro" (optional) replaces the settings page's introduction; every other file is the Christmas app's, so the rules,
 * settings and fixes stay the same. _tools/packs.json has each pack's name, emoji, colours and greeting.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..'), ROOT = path.join(APPS, '..');
const read = (f) => fs.readFileSync(f, 'utf8');

export function makePacks(appId) {
    const src = path.join(APPS, appId);
    const spec = JSON.parse(read(path.join(HERE, 'packs', `${appId}.json`)));
    const packs = JSON.parse(read(path.join(HERE, 'packs.json')));
    const base = JSON.parse(read(path.join(src, 'ezapp.json')));
    const made = [];
    for (const [pack, p] of Object.entries(spec.packs)) {
        if (!packs[pack] || pack === 'christmas') throw new Error(`unknown pack ${pack}`);
        const dir = path.join(ROOT, `ezplayer-apps-${pack}`, `${pack}-${spec.short}`);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(f) });
        const man = { ...base, id: `${pack}-${spec.short}`, name: p.name, description: p.description ?? base.description, icon: p.icon ?? base.icon, version: '1' };
        fs.writeFileSync(path.join(dir, 'ezapp.json'), JSON.stringify(man, null, 4) + '\n');
        fs.writeFileSync(path.join(dir, 'theme.mjs'),
            `// The theme of this app in the ${packs[pack].name} pack (made by _tools/make_pack.mjs from the Christmas app ${appId} ${base.version}).\n` +
            `export const THEME = ${JSON.stringify({ ...p.theme, pack: packs[pack].name })};\n`);
        const cfgFile = path.join(dir, '_src', 'config.json'), cfg = JSON.parse(read(cfgFile));
        cfg.title = p.name; cfg.icon = man.icon;
        if (p.intro) cfg.intro = p.intro;
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1) + '\n');
        // the README: the pack's title, and where it comes from
        const rp = path.join(dir, 'README.md');
        let md = read(rp).replace(/^# .*$/m, `# ${man.icon} ${p.name}`);
        md = md.replace(/^(# .*\n)/m, `$1\n*${packs[pack].emoji} ${packs[pack].name} pack: the Christmas app \`${appId}\` with this pack's words, colours and pictures; ` +
            `everything else (rules, settings, ways to play) is the same, see below.*\n`);
        fs.writeFileSync(rp, md);
        buildApp(dir);
        made.push(path.relative(ROOT, dir).replace(/\\/g, '/'));
    }
    return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const id = process.argv[2];
    if (!id) { console.log('usage: node _tools/make_pack.mjs <app id>'); process.exit(1); }
    for (const d of makePacks(id)) console.log('made', d);
}
