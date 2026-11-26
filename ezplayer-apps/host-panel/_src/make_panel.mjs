// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Makes the host panel's settings page: config/index.html = _src/panel.html with the app's title and icon (from
 * _src/config.json), its accent colour and theme of the night (from theme.mjs), the 12 themes (from _tools/packs.json)
 * and the ids of every ShowPlay app (read from the folders now) put in. _tools/build.mjs always writes a field form into
 * config/index.html, so run this after it; it also removes the page/ folder build.mjs makes (no visitors' page here).
 *
 *   node ezplayer-apps/_tools/build.mjs ezplayer-apps/host-panel
 *   node ezplayer-apps/host-panel/_src/make_panel.mjs              this app
 *   node ezplayer-apps/_tools/make_pack.mjs host-panel
 *   node ezplayer-apps/host-panel/_src/make_panel.mjs --packs      every pack version (ezplayer-apps-<pack>/<pack>-host-panel)
 *
 * Run it again whenever a ShowPlay app is added, so the theme of the night knows its id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.join(HERE, '..');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// apps that are not part of a theme: the theme of the night never switches them off (nor their pack versions)
const INDEPENDENT = ['host-panel', 'agenda'];

function ids(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const d of fs.readdirSync(dir)) {
        const f = path.join(dir, d, 'ezapp.json');
        if (!fs.existsSync(f)) continue;
        try { out.push(JSON.parse(read(f)).id); } catch (e) { console.log(`skipped ${f}: ${e.message}`); }
    }
    return out;
}

async function makePanel(appDir, src) {
    const apps = path.join(appDir, '..', '..', 'ezplayer-apps');
    const tools = path.join(apps, '_tools');
    const packs = JSON.parse(read(path.join(tools, 'packs.json')));
    const keys = Object.keys(packs).filter((k) => k !== 'christmas');
    const short = (id) => { try { return JSON.parse(read(path.join(tools, 'packs', `${id}.json`))).short ?? id; } catch (e) { return id; } };
    const never = new Set(INDEPENDENT.flatMap((id) => [id, ...keys.map((k) => `${k}-${short(id)}`)]));
    const showplay = [...ids(apps), ...keys.flatMap((k) => ids(path.join(apps, '..', `ezplayer-apps-${k}`)))]
        .filter((id) => !never.has(id)).sort();
    const { THEME } = await import(pathToFileURL(path.join(appDir, 'theme.mjs')).href + `?t=${Date.now()}`);
    const cfg = JSON.parse(read(path.join(appDir, '_src', 'config.json')));
    const key = packs[THEME.key] ? THEME.key : 'christmas';
    const data = {
        theme: key,
        themes: Object.entries(packs).map(([k, p]) => ({ key: k, name: p.name, emoji: p.emoji })),
        prefixes: keys,
        showplay,
    };
    const accent = /^[0-9a-f]{6}$/i.test(THEME.colour ?? '') ? THEME.colour : packs[key].colour;
    const html = read(src)
        .replaceAll('@TITLE@', esc(cfg.title ?? 'Host panel'))
        .replaceAll('@ICON@', esc(cfg.icon ?? '🎛️'))
        .replaceAll('@ACCENT@', accent)
        .replace('/*@DATA@*/', () => `const DATA = ${JSON.stringify(data)};`);
    fs.mkdirSync(path.join(appDir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'config', 'index.html'), html);
    fs.rmSync(path.join(appDir, 'page'), { recursive: true, force: true });
    console.log(`made ${path.relative(path.join(apps, '..'), appDir).split(path.sep).join('/')}/config/index.html (${showplay.length} ShowPlay ids, theme ${key})`);
}

const args = process.argv.slice(2);
const src = path.join(SELF, '_src', 'panel.html');
if (args[0] === '--packs') {
    const apps = path.join(SELF, '..');
    const packs = JSON.parse(read(path.join(apps, '_tools', 'packs.json')));
    const sh = (() => { try { return JSON.parse(read(path.join(apps, '_tools', 'packs', 'host-panel.json'))).short; } catch (e) { return 'host-panel'; } })();
    for (const k of Object.keys(packs).filter((k) => k !== 'christmas')) {
        const dir = path.join(apps, '..', `ezplayer-apps-${k}`, `${k}-${sh}`);
        if (fs.existsSync(dir)) await makePanel(dir, src);
        else console.log(`no ${dir} (run make_pack.mjs host-panel first)`);
    }
} else {
    await makePanel(args[0] ? path.resolve(args[0]) : SELF, src);
}
