// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Switching a machine (snow, bubbles, fog…) on and off, in one of five ways:
 *   url     a web address to switch it on and another to switch it off (a smart plug, a relay, a Shelly, Tasmota…)
 *   ezp     DMX through EZPlayer: the machine is a model in the show's layout, wired to a board with a DMX port;
 *           the app opens an overlay lease on that model and sets its channels: node 1 red = channel 1, green = 2, blue = 3,
 *           node 2 red = 4… so the model should be a plain model of RGB nodes on the machine's DMX channels (an xLights
 *           DMX model counts as a single node in EZPlayer, which only reaches its first 3 channels)
 *   ddp     DMX through a board that takes DDP and has a DMX output (WLED built with DMX output and a MAX485, FPP boards)
 *   artnet  DMX through an Art-Net node (sent to its address, port 6454)
 *   e131    DMX through an E1.31 (sACN) node (sent to its address, port 5568)
 * For the DMX ways, the values to send are built by dmxFrame(): the channels of a simple machine ("1=255"), or, for a
 * machine with several functions, the channels of the mode the visitor picked plus its lights (a colour, the machine's
 * own colour changes, the strobe). Every other channel is 0. While it runs the values are sent again every 0.4 s, so a
 * board that forgets after a few seconds (WLED) keeps them; at the end the lights go back to the waiting colour, or
 * everything to 0.
 */

import dgram from 'node:dgram';

export const MACHINE_HOWS = ['url', 'ezp', 'ddp', 'artnet', 'e131'];

/** "1=255, 2=128" -> the DMX values from channel 1 (null when nothing usable) */
export function dmxValues(spec) {
    const out = new Uint8Array(512);
    let top = 0;
    for (const part of String(spec || '').split(/[,;\n]+/)) {
        const m = part.trim().match(/^(\d{1,3})\s*[=:]\s*(\d{1,3})$/);
        if (!m) continue;
        const ch = +m[1], v = Math.min(255, +m[2]);
        if (ch < 1 || ch > 512) continue;
        out[ch - 1] = v; top = Math.max(top, ch);
    }
    return top ? out.slice(0, top) : null;
}

/** the modes of a machine with several functions, one a line: "🫧 Bubbles | 1=255, 3=200" or "🌫️ Fog | 2=200 | 5" (at most 5 s) */
export function machineModes(text) {
    const out = [];
    for (const line of String(text || '').split('\n')) {
        const [name, ch, secs] = line.split('|').map((x) => x.trim());
        if (!name || !dmxValues(ch)) continue;
        const sec = Number.isFinite(+secs) && +secs >= 1 ? Math.min(120, Math.round(+secs)) : 0;
        out.push({ name: name.slice(0, 24), channels: ch, secs: sec });
        if (out.length >= 8) break;
    }
    return out;
}

/** the colours a visitor can pick: key, name, emoji, red, green, blue, amber, white */
export const MACHINE_COLOURS = [
    ['red', 'Red', '🔴', 255, 0, 0, 0, 0], ['green', 'Green', '🟢', 0, 255, 0, 0, 0], ['blue', 'Blue', '🔵', 0, 0, 255, 0, 0],
    ['amber', 'Gold', '🟠', 255, 110, 0, 255, 0], ['white', 'White', '⚪', 255, 255, 255, 0, 255], ['purple', 'Purple', '🟣', 140, 0, 255, 0, 0],
    ['pink', 'Pink', '🩷', 255, 40, 140, 0, 0], ['cyan', 'Ice', '🩵', 0, 220, 255, 0, 0],
];
const hexCol = (h) => { const n = parseInt(String(h || '').replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 0, 0]; };

/**
 * the DMX values for a run (or for waiting, with choice.wait):
 * m: { channels (simple machine), multi, modes, fixed, lights: { dim, r, g, b, a, w, macro, macroVal, speed, speedVal, strobe,
 *      strobeVal, strobeMax }, runLight ('off' | 'colour' | 'rainbow'), runColour, idle ('off' | 'colour'), idleColour }
 * choice: { mode (index, or -1 for the lights only), colour (a MACHINE_COLOURS key, 'rainbow' or ''), strobe, wait }
 */
export function dmxFrame(m, choice = {}) {
    const out = new Uint8Array(512);
    let top = 0;
    const put = (ch, v) => { if (ch >= 1 && ch <= 512) { out[ch - 1] = Math.max(0, Math.min(255, Math.round(v))); top = Math.max(top, ch); } };
    const add = (spec) => { const v = dmxValues(spec); if (v) v.forEach((x, i) => { if (x) put(i + 1, x); else top = Math.max(top, i + 1); }); };
    const L = m.lights;
    if (L) for (const k of ['dim', 'r', 'g', 'b', 'a', 'w', 'macro', 'speed', 'strobe']) if (L[k]) put(L[k], 0);   // the light channels are known: sent, 0 when not used
    if (m.multi) add(m.fixed);
    if (!choice.wait) {
        if (!m.multi && choice.mode !== -1) add(m.channels);   // "only the lights" never starts the machine itself
        else if (choice.mode >= 0 && m.modes[choice.mode]) add(m.modes[choice.mode].channels);
    }
    if (L) {
        let col = null, rainbow = false;
        if (choice.wait) { if (m.idle === 'colour') col = hexCol(m.idleColour); }
        else if (choice.colour === 'rainbow' && L.macro) rainbow = true;
        else if (choice.colour && MACHINE_COLOURS.some((c) => c[0] === choice.colour)) col = MACHINE_COLOURS.find((c) => c[0] === choice.colour).slice(3);
        else if (m.runLight === 'rainbow' && L.macro) rainbow = true;
        else if (m.runLight === 'colour' || choice.mode === -1) col = hexCol(m.runColour);
        const strobe = !choice.wait && choice.strobe && L.strobe;
        if (strobe && !col && !rainbow) col = [255, 255, 255, 0, 255];
        if (col || rainbow) put(L.dim, 255);
        if (col) {
            const [r, g, b, a, w] = col;
            if (L.a && a) { put(L.a, a); put(L.r, r); put(L.g, Math.max(0, g - 60)); put(L.b, b); }   // with an amber channel, gold is mostly amber
            else { put(L.r, r); put(L.g, g); put(L.b, b); }
            if (L.w && w) put(L.w, w);
        }
        if (rainbow) { put(L.macro, L.macroVal || 200); if (L.speed) put(L.speed, L.speedVal || 128); }
        if (strobe) put(L.strobe, Math.min(L.strobeVal || 100, L.strobeMax || 150));
    }
    return top ? out.slice(0, top) : null;
}

let sock = null;
const udp = () => { if (!sock) { sock = dgram.createSocket('udp4'); sock.on('error', () => undefined); sock.unref(); } return sock; };
let ddpSeq = 1, artSeq = 1, sacnSeq = 0;
const CID = Buffer.from('53686f77506c61792d6d616368696e65', 'hex');   // a fixed id for E1.31 ("ShowPlay-machine")

function ddpPacket(vals) {
    const h = Buffer.alloc(10);
    h[0] = 0x41; h[1] = (ddpSeq = (ddpSeq % 15) + 1); h[2] = 0x01; h[3] = 0x01;
    h.writeUInt32BE(0, 4); h.writeUInt16BE(vals.length, 8);
    return Buffer.concat([h, Buffer.from(vals)]);
}
function artnetPacket(vals, universe) {
    const n = Math.max(2, vals.length + (vals.length % 2)), b = Buffer.alloc(18 + n);
    b.write('Art-Net\0', 0, 'latin1'); b.writeUInt16LE(0x5000, 8); b.writeUInt16BE(14, 10);
    b[12] = (artSeq = (artSeq % 255) + 1); b[13] = 0; b.writeUInt16LE(universe & 0x7fff, 14); b.writeUInt16BE(n, 16);
    Buffer.from(vals).copy(b, 18);
    return b;
}
function e131Packet(vals, universe) {
    const n = 512, b = Buffer.alloc(126 + n);
    b.writeUInt16BE(0x0010, 0); b.writeUInt16BE(0, 2); b.write('ASC-E1.17\0\0\0', 4, 'latin1');
    b.writeUInt16BE(0x7000 | (b.length - 16), 16); b.writeUInt32BE(4, 18); CID.copy(b, 22);
    b.writeUInt16BE(0x7000 | (b.length - 38), 38); b.writeUInt32BE(2, 40); b.write('ShowPlay', 44, 'latin1');
    b[108] = 100; b.writeUInt16BE(0, 109); b[111] = (sacnSeq = (sacnSeq + 1) % 256); b[112] = 0; b.writeUInt16BE(universe, 113);
    b.writeUInt16BE(0x7000 | (b.length - 115), 115); b[117] = 0x02; b[118] = 0xa1; b.writeUInt16BE(0, 119); b.writeUInt16BE(1, 121);
    b.writeUInt16BE(n + 1, 123); b[125] = 0; Buffer.from(vals).copy(b, 126);
    return b;
}

/** where DMX values go: UDP to a board or node, or an overlay lease on an EZPlayer model (opened when needed, kept while used) */
export class MachineLink {
    constructor(log = console.log) { this.log = log; this.lease = null; this.key = ''; this.warned = ''; }
    async send(cfg, vals) {
        const how = cfg.how;
        if (how === 'ezp') {
            const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
            if (this.lease && this.key !== cfg.model) await this.close();
            if (!this.lease) {
                // exclusive, with the app token, like the app's own leases (PR #21)
                const headers = { 'content-type': 'application/json', ...(process.env.EZP_APP_TOKEN ? { 'x-ezp-app-token': process.env.EZP_APP_TOKEN } : {}) };
                const res = await fetch(`${base}/api/ezp/overlays`, { method: 'POST', headers,
                    body: JSON.stringify({ model: cfg.model, format: 'nodes', mode: 'exclusive', blend: 'replace', ttlMs: 5000, name: 'machine' }), signal: AbortSignal.timeout(4000) });
                const o = await res.json().catch(() => ({}));
                if (!o.ok || !o.lease) throw new Error('EZPlayer: ' + (o.error ?? 'HTTP ' + res.status));
                this.lease = { ...o.lease, base, seq: 1, payload: new Uint8Array(o.lease.frameBytes) }; this.key = cfg.model;
            }
            const L = this.lease;
            if (vals.length > L.payload.length && this.warned !== cfg.model + vals.length) {
                this.warned = cfg.model + vals.length;
                this.log(`the model "${cfg.model}" takes ${L.payload.length} channels, so channels after ${L.payload.length} are not sent; make it a model with more nodes (3 channels a node)`);
            }
            L.payload.fill(0); L.payload.set(vals.slice(0, L.payload.length));
            const r = await fetch(`${base}/api/ezp/overlays/${L.id}/frame?token=${L.token}&seq=${L.seq++}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: L.payload, signal: AbortSignal.timeout(3000) }).catch(() => null);
            if (!r || !r.ok) this.lease = null;   // opened again next time
            return;
        }
        const port = how === 'ddp' ? 4048 : how === 'artnet' ? 6454 : 5568;
        const uni = how === 'e131' ? Math.max(1, Math.min(63999, +cfg.universe || 1)) : Math.max(0, Math.min(32767, +cfg.universe || 0));
        await new Promise((ok) => udp().send(how === 'ddp' ? ddpPacket(vals) : how === 'artnet' ? artnetPacket(vals, uni) : e131Packet(vals, uni), port, cfg.host, () => ok()));
    }
    async close() {
        const L = this.lease; this.lease = null; this.key = '';
        if (L) await fetch(`${L.base}/api/ezp/overlays/${L.id}?token=${L.token}`, { method: 'DELETE' }).catch(() => undefined);
    }
}

async function call(url) {
    if (!url) return;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'ShowPlay' } });
    if (!r.ok) throw new Error('answer ' + r.status);
}
/** switching off must not give up after one lost request (Wi-Fi): tried again after 1, 2, 4 and 8 s */
async function callOff(url, log, tries = 5) {
    for (let i = 0; ; i++) {
        try { await call(url); return; } catch (e) {
            if (i >= tries - 1) { log('could not be switched off:', e.message); return; }
            await sleep(1000 * 2 ** i);
        }
    }
}

// the runs going on now, so that the app can switch everything off when it stops or fails (machinesOff)
const ACTIVE = new Set();
/** switches off every machine that is on now; called when the app stops or fails */
export async function machinesOff(log = console.log) {
    const runs = [...ACTIVE]; ACTIVE.clear();
    await Promise.all(runs.map(async ({ cfg, how, link, size }) => {
        if (how === 'url') return callOff(cfg.off, log, 3);
        const end = new Uint8Array(size);
        for (let i = 0; i < 3; i++) { await link.send(cfg, end).catch(() => undefined); await sleep(100); }
        await link.close().catch(() => undefined);
    }));
}

/**
 * a run: switches the machine on, waits, and always switches it off.
 * cfg: { how, on, off (urls), host, universe, model, channels, values (the DMX values; else from channels), after (DMX values
 * to leave when it ends: the waiting colour; else zeros and the lease is given back) }
 */
export async function runMachine(cfg, secs, log = console.log, link = new MachineLink(log)) {
    const how = MACHINE_HOWS.includes(cfg.how) ? cfg.how : 'url';
    if (how === 'url') {
        const run = { cfg, how };
        ACTIVE.add(run);
        try { await call(cfg.on); log(`on for ${secs} s`); await sleep(secs * 1000); }
        finally { if (ACTIVE.delete(run)) await callOff(cfg.off, log); }
        return;
    }
    const vals = cfg.values ?? dmxValues(cfg.channels);
    if (!vals) throw new Error('no DMX channels set (for example 1=255)');
    const t0 = Date.now();
    const run = { cfg, how, link, size: vals.length };
    ACTIVE.add(run);
    try { await link.send(cfg, vals); }   // throws when it cannot start
    catch (e) { ACTIVE.delete(run); throw e; }
    log(`on for ${secs} s (DMX by ${how})`);
    try {
        while (Date.now() - t0 < secs * 1000 && ACTIVE.has(run)) { await sleep(400); if (ACTIVE.has(run)) await link.send(cfg, vals).catch(() => undefined); }
    } finally {
        if (!ACTIVE.delete(run)) return;   // machinesOff() has already switched it off
        const after = cfg.after, end = new Uint8Array(Math.max(vals.length, after?.length ?? 0));
        if (after) end.set(after);
        for (let i = 0; i < 3; i++) { await link.send(cfg, end).catch(() => undefined); await sleep(150); }   // a few times in case one is lost
        if (!after) await link.close();
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
