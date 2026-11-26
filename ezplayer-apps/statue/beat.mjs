// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The music while the light is green: a beat made by the app (a kick, a hi-hat and a little bass line, no files
 * needed) as long as the green light, ending with a short low buzz when the light turns red. It plays where the
 * ending's sounds play (the "Where it plays" and "Volume" settings), through audio.mjs.
 */

import { playSound, busFor } from './audio.mjs';

export const RATE = 22050;
const BASS = [110, 110, 147, 131, 110, 110, 165, 147];

/** the beat for secs seconds (bpm beats a minute) and the buzz at the end, as mono 16-bit samples */
export function beatClip(secs, bpm = 120) {
    const total = Math.max(0.5, Math.min(60, secs)), buzz = 0.35;
    const out = new Float32Array(Math.floor((total + buzz) * RATE));
    const beat = 60 / bpm;
    let seed = 7;
    const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    for (let b = 0; b * beat < total; b++) {
        const at = Math.floor(b * beat * RATE);
        // kick: a falling sine
        for (let i = 0, ph = 0; i < 0.14 * RATE && at + i < out.length; i++) {
            const t = i / RATE; ph += 2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) / RATE;
            out[at + i] += Math.sin(ph) * Math.exp(-t * 18) * 0.8;
        }
        // hi-hat on the off-beat
        const hh = Math.floor((b + 0.5) * beat * RATE);
        if ((b + 0.5) * beat < total) for (let i = 0; i < 0.035 * RATE && hh + i < out.length; i++) out[hh + i] += noise() * Math.exp(-i / RATE * 90) * 0.25;
        // bass: two notes a beat
        for (let half = 0; half < 2; half++) {
            const s0 = at + Math.floor(half * beat / 2 * RATE), f = BASS[(b * 2 + half) % BASS.length], n = Math.floor(beat / 2 * 0.8 * RATE);
            if (s0 / RATE >= total) break;
            for (let i = 0; i < n && s0 + i < out.length; i++) {
                const t = i / RATE, env = Math.min(1, t / 0.01) * Math.min(1, (n - i) / RATE / 0.03);
                out[s0 + i] += (Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(4 * Math.PI * f * t) * 0.2) * env * 0.35;
            }
        }
    }
    // the buzz: the light is red
    const z0 = Math.floor(total * RATE);
    for (let i = 0; z0 + i < out.length; i++) {
        const t = i / RATE, env = Math.min(1, t / 0.01) * Math.min(1, (buzz - t) / 0.05);
        out[z0 + i] += (Math.sin(2 * Math.PI * 98 * t) > 0 ? 0.35 : -0.35) * env;
    }
    const pcm = new Int16Array(out.length);
    for (let i = 0; i < out.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, out[i] * 22000));
    return pcm;
}

let busy = false;
/** plays the beat for the green light, when the setting is on (one at a time: a late one is skipped) */
export function playBeat(s, secs, bpm) {
    if (!s?.music || busy) return false;
    busy = true;
    playSound(beatClip(secs, bpm), RATE, (s.endVolume ?? 80) / 100, busFor(s.endBus, s.endPi, s.endPiKey))
        .catch((e) => console.log('music:', e.message))
        .finally(() => { busy = false; });
    return true;
}
