// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The last ten seconds said out loud: "10, 9, … 1" by the computer's own voice (the ending's speak()), made into ONE
 * sound with each number exactly a second apart, so the numbers keep time with the lights even when a sound takes a
 * moment to start. The numbers are made a couple of minutes before (a voice can take a second per word on Windows)
 * and kept for the next countdown. The digits are said in the voice language of the settings ("10" in Portuguese is
 * "dez"), so no words need translating.
 */

import { speak } from './ending.mjs';
import { playSound, busFor } from './audio.mjs';

const PREPARE_MS = 150_000;   // start making the numbers this long before zero
const LEAD_MS = 350;          // the sound is started this much early: sending it and starting it takes a moment

/** ten spoken numbers ({ rate, samples }, 10 first) -> one sound with a number at the start of each second */
export function countClip(parts) {
    const rate = parts[0].rate, out = new Int16Array(rate * 10);
    parts.forEach((p, i) => {
        const n = Math.min(p.samples.length, Math.floor(rate * 0.95));   // a long word is cut before the next second
        out.set(p.samples.subarray(0, n), i * rate);
    });
    return { rate, samples: out };
}

export class VoiceCount {
    constructor({ say = speak, play = playSound, log = (...a) => console.log('voice:', ...a) } = {}) {
        this.say = say; this.play = play; this.log = log;
        this.clip = null; this.lang = null; this.busy = false; this.played = null;
    }
    /** called every step with the time left to the moment (ms) */
    step(s, target, left) {
        if (!s.voiceCount || target == null || left == null) return;
        if (left <= PREPARE_MS && left > 10_500 && !this.busy && this.lang !== s.endVoiceLang) void this.prepare(s.endVoiceLang);
        if (left <= 10_000 + LEAD_MS && left > 9_000 && this.played !== target && this.clip && this.lang === s.endVoiceLang) {
            this.played = target;
            Promise.resolve(this.play(this.clip.samples, this.clip.rate, s.endVolume / 100, busFor(s.endBus, s.endPi, s.endPiKey)))
                .catch((e) => this.log(e.message));
        }
    }
    async prepare(lang) {
        this.busy = true;
        try {
            const parts = [];
            for (let k = 10; k >= 1; k--) {
                const v = await this.say(String(k), lang);
                if (!v) { this.log('this computer has no voice to say the numbers (on Linux install espeak-ng)'); this.clip = null; return; }
                parts.push(v);
            }
            this.clip = countClip(parts);
        } catch (e) { this.log(e.message); this.clip = null; }
        finally { this.lang = lang; this.busy = false; }   // tried once per language: no voice is not asked again and again
    }
}
