// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/** Sound: WAV files read and written, and played through EZPlayer's audio injection (EZPlayer 0.7+: a lease on a bus,
 *  so the sound comes out of the show's speakers), or, when that is not there, on the player computer itself
 *  (PowerShell on Windows, afplay on macOS, aplay, paplay or pw-play on Linux). No dependencies. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function run(cmd, args) {
    return new Promise((resolve) => {
        let p;
        try { p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true }); } catch (e) { resolve(false); return; }
        const t = setTimeout(() => p.kill(), 60000);
        p.on('error', () => { clearTimeout(t); resolve(false); });
        p.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
    });
}

/** plays a WAV file and resolves when it ends (true if something played it) */
export async function playWav(file) {
    if (process.platform === 'win32')
        return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`]);
    if (process.platform === 'darwin') return run('afplay', [file]);
    for (const [c, a] of [['aplay', ['-q', file]], ['paplay', [file]], ['pw-play', [file]]]) if (await run(c, a)) return true;
    return false;
}

/** mono 16-bit samples (Int16Array) -> a WAV file; volume 0..1 */
export function writeWav(file, rate, samples, volume = 1) { fs.writeFileSync(file, wavBuffer(rate, samples, volume)); }

/** mono 16-bit samples -> the bytes of a WAV file */
export function wavBuffer(rate, samples, volume = 1) {
    const n = samples.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * volume))), 44 + i * 2);
    return buf;
}

/** a WAV file (PCM, 8 or 16 bits, mono or stereo) -> { rate, seconds, mono(start, secs) -> Int16Array } */
export function readWav(file) {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
    let p = 12, fmt = null, data = null;
    while (p + 8 <= b.length) {
        const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
        if (id === 'fmt ') fmt = { format: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
        else if (id === 'data') data = b.subarray(p + 8, Math.min(b.length, p + 8 + size));
        p += 8 + size + (size & 1);
    }
    if (!fmt || !data || fmt.format !== 1 || ![8, 16].includes(fmt.bits) || ![1, 2].includes(fmt.ch)) throw new Error('only plain 8- or 16-bit WAV files');
    const bytes = fmt.bits / 8, frame = bytes * fmt.ch, frames = Math.floor(data.length / frame);
    const at = (i, c) => (bytes === 2 ? data.readInt16LE(i * frame + c * 2) : (data[i * frame + c] - 128) << 8);
    return {
        rate: fmt.rate, seconds: frames / fmt.rate,
        mono(start, secs) {
            const s0 = Math.max(0, Math.floor(start * fmt.rate)), n = Math.max(0, Math.min(frames - s0, Math.floor(secs * fmt.rate)));
            const out = new Int16Array(n);
            for (let i = 0; i < n; i++) out[i] = fmt.ch === 2 ? (at(s0 + i, 0) + at(s0 + i, 1)) >> 1 : at(s0 + i, 0);
            return out;
        },
    };
}

/** a WAV file's bytes (as the phones send them) -> the same reader as readWav */
export function readWavBytes(bytes) {
    const file = tempWav('in');
    fs.writeFileSync(file, bytes);
    try { return readWav(file); } finally { fs.rm(file, () => undefined); }
}

// ------------------------------------------------------------------------------- EZPlayer's audio buses ----
const leases = new Map();          // bus -> { id, token }
let clipNo = 0;

async function audioApi(method, p, body, type) {
    const base = process.env.EZP_API_URL;
    if (!base) throw new Error('no player');
    const res = await fetch(base + p, { method, body, headers: body ? { 'content-type': type ?? 'application/json' } : {}, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.json();
}

async function lease(bus) {
    let l = leases.get(bus);
    if (l) return l;
    const r = await audioApi('POST', '/api/ezp/audio/leases', JSON.stringify({ bus, name: 'ShowPlay ' + (process.env.EZP_APP_INSTANCE ?? 'app'), sampleRate: 48000, channels: 1, ttlMs: 600000 }));
    l = { id: r.lease.id, token: r.lease.token };
    leases.set(bus, l);
    return l;
}

/** plays mono samples through EZPlayer on the given bus ('immediate': the show's speakers at once; 'main': mixed with
 *  the song, also heard by listeners), or on this computer when EZPlayer has no audio API. Resolves when the sound has
 *  ended, with 'ezplayer', 'local' or false (nothing could play it). onStart(ms) is called once it is on its way, with the
 *  time until it is heard (so lights can follow it). */
export async function playSound(samples, rate, volume = 1, bus = 'immediate', onStart = null) {
    const secs = samples.length / rate;
    if (typeof bus === 'string' && bus.startsWith('pi:')) {   // a Raspberry Pi running the ShowPlay speaker (pi-speaker/)
        const [host, key = ''] = bus.slice(3).split('|');
        try { await piPlay(host, key, wavBuffer(rate, samples, volume), secs, onStart); return 'pi'; }
        catch (e) { console.log(`sound: the Raspberry Pi ${host || '(no address)'} could not play it (${e.message}); playing it on this computer`); bus = 'local'; }
    }
    if (bus !== 'local') {
        for (let tries = 0; tries < 2; tries++) {
            try {
                const l = await lease(bus), name = `c${++clipNo}`, q = `?token=${l.token}`;
                await audioApi('PUT', `/api/ezp/audio/leases/${l.id}/clips/${name}${q}`, wavBuffer(rate, samples, volume), 'audio/wav');
                const r = await audioApi('POST', `/api/ezp/audio/leases/${l.id}/play${q}`, JSON.stringify({ clip: name }));
                const lead = Math.max(0, (r.play?.startsAt ?? r.now) - r.now);
                onStart?.(lead);
                const wait = lead + secs * 1000 + 200;
                await new Promise((res) => setTimeout(res, wait));
                audioApi('DELETE', `/api/ezp/audio/leases/${l.id}/clips/${name}${q}`).catch(() => undefined);
                return 'ezplayer';
            } catch (e) {
                leases.delete(bus);
                if (e.status !== 404) break;     // a lease that expired is opened again once; anything else: play here
            }
        }
    }
    const file = tempWav('play');
    try { writeWav(file, rate, samples, volume); onStart?.(150); return (await playWav(file)) ? 'local' : false; }
    finally { fs.rm(file, () => undefined); }
}

/** where a sound goes: the setting ('immediate', 'main', 'local' or 'pi') and, for 'pi', the Raspberry Pi's address and key */
export function busFor(bus, host = '', key = '') {
    return bus === 'pi' ? `pi:${String(host || '').trim()}|${String(key || '').trim()}` : bus;
}

/** sends a WAV to the ShowPlay speaker on a Raspberry Pi (port 8765 unless the address has one); resolves once it played */
async function piPlay(host, key, wav, secs, onStart) {
    if (!host) throw new Error('no address set');
    const url = `http://${/:\d+$/.test(host) ? host : host + ':8765'}/play`;
    onStart?.(300);
    const res = await fetch(url, { method: 'POST', body: wav, headers: { 'content-type': 'audio/wav', ...(key ? { 'x-showplay-key': key } : {}) },
        signal: AbortSignal.timeout(secs * 1000 + 30000) });   // a Pi that does not answer does not hold the queue for long
    const o = await res.json().catch(() => ({}));
    if (!res.ok || !o.ok) throw new Error(o.error ?? 'HTTP ' + res.status);
}

/** closes the leases (when the app stops) */
export async function closeAudio() {
    for (const [bus, l] of leases) { leases.delete(bus); await audioApi('DELETE', `/api/ezp/audio/leases/${l.id}?token=${l.token}`).catch(() => undefined); }
}

export const tempWav = (name) => path.join(os.tmpdir(), `showplay-${name}-${process.pid}-${Date.now()}.wav`);
