// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The song of Rhythm on the lights: a chart of notes (when, which lane) made from the beat, and the music made from
 * the same plan, so the tune plays exactly where the notes are. Everything comes from a seed, so the same seed, speed,
 * length and difficulty always give the same song (the server and the tests can make it again).
 *
 * The beat is on a grid of half-beats ("steps"). The first two bars are a count-in (drums and bass only, no notes),
 * so the phones have the chart and the first notes have time to fall. A note's lane is also its pitch: lane 0 the
 * lowest note of the bar's chord, lane 3 the highest.
 */

const INTRO_STEPS = 16;   // two bars of 4 beats, 2 steps a beat
// on: chance of a note on a beat; off: between two beats; two: chance of two lanes at once (on the first beat of a bar)
const DENSITY = {
    easy: { on: 0.5, off: 0, two: 0, gap: 450 },
    normal: { on: 0.75, off: 0.22, two: 0, gap: 320 },
    hard: { on: 0.9, off: 0.5, two: 0.15, gap: 300 },
};
// I - V - vi - IV in C: each bar's chord as MIDI notes (root in the bass, the tune an octave and more up)
const CHORDS = [[48, 4, 7], [43, 4, 7], [45, 3, 7], [41, 4, 7]];

/** a small seeded random generator (mulberry32): the same seed gives the same numbers */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * the plan of a song: { bpm, beatMs, stepMs, startMs, lengthMs, notes: [[ms, lane], ...] sorted by time then lane,
 * pitch: the MIDI note of each note, drums: [[step, 'k'|'s'|'h'], ...], bass: [[step, midi], ...] }
 * startMs: where the first beat is (0 for the app's own music; an owner's WAV may start later).
 */
export function makeSong({ seed = 1, bpm = 110, secs = 60, level = 'normal', startMs = 0 } = {}) {
    const D = DENSITY[level] ?? DENSITY.normal, rand = rng(seed);
    const beatMs = 60000 / bpm, stepMs = beatMs / 2, lengthMs = Math.round(secs * 1000);
    const steps = Math.floor((lengthMs - startMs) / stepMs);
    const lastNote = steps - 4;            // the last two beats: no notes, the song rounds off
    const drums = [], bass = [], notes = [], pitch = [];
    const lastAt = [-Infinity, -Infinity, -Infinity, -Infinity];
    let lane = Math.floor(rand() * 4);
    for (let s = 0; s < steps; s++) {
        const inBar = s % 8, bar = Math.floor(s / 8), fill = bar % 4 === 3;
        const kick = inBar === 0 || inBar === 4 || (bar % 2 === 1 && inBar === 5);
        const snare = inBar === 2 || inBar === 6 || (fill && inBar === 7);
        if (kick) drums.push([s, 'k']);
        if (snare) drums.push([s, 's']);
        drums.push([s, 'h']);
        const [root] = CHORDS[bar % 4];
        if (s % 2 === 0) bass.push([s, root]);
        else if (level === 'hard' && inBar % 4 === 3) bass.push([s, root + 12]);
        if (s < INTRO_STEPS || s > lastNote) continue;
        const onBeat = s % 2 === 0;
        let p = onBeat ? D.on : D.off;
        if (p && (kick || snare)) p = Math.min(1, p + 0.15);   // the notes like the drums
        if (rand() >= p) continue;
        const t = Math.round(startMs + s * stepMs);
        // the tune walks: mostly a step up or down, sometimes a jump; never the same lane too soon
        const r = rand();
        let next = r < 0.35 ? lane - 1 : r < 0.7 ? lane + 1 : r < 0.85 ? lane : Math.floor(rand() * 4);
        next = Math.max(0, Math.min(3, next));
        if (t - lastAt[next] < D.gap) {
            const free = [0, 1, 2, 3].filter((l) => t - lastAt[l] >= D.gap);
            if (!free.length) continue;
            next = free.reduce((a, b) => (Math.abs(b - lane) < Math.abs(a - lane) ? b : a));
        }
        lane = next;
        const lanes = [lane];
        if (D.two && inBar === 0 && rand() < D.two) {
            const other = lane < 2 ? lane + 2 : lane - 2;
            if (t - lastAt[other] >= D.gap) lanes.push(other);
        }
        for (const l of lanes.sort((a, b) => a - b)) { notes.push([t, l]); lastAt[l] = t; }
    }
    // the tune: lane -> a note of the bar's chord (root, third, fifth, octave), an octave and a fifth up from the bass
    for (const [t, l] of notes) {
        const bar = Math.floor(Math.round((t - startMs) / stepMs) / 8), [root, third, fifth] = CHORDS[bar % 4];
        pitch.push(root + 24 + [0, third, fifth, 12][l]);
    }
    return { seed, bpm, level, beatMs, stepMs, startMs, lengthMs, notes, pitch, drums, bass };
}

/** the chart only, as the phones get it: [[ms, lane], ...] */
export const chartOf = (song) => song.notes.map(([t, l]) => [t, l]);

// ---------------------------------------------------------------------------------------- the music ----
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** the song as mono 16-bit samples: drums, a bass and the tune on the notes. Made in a moment (a 2-minute song
 *  is about 2.6 million samples at 22050 a second). */
export function synth(song, rate = 22050) {
    const n = Math.ceil((song.lengthMs / 1000 + 0.6) * rate), buf = new Float32Array(n);
    const at = (ms) => Math.floor(ms * rate / 1000);
    let noise = (song.seed * 2654435761) >>> 0 || 1;   // its own noise, so the same song sounds the same
    const rnd = () => { noise ^= noise << 13; noise >>>= 0; noise ^= noise >>> 17; noise ^= noise << 5; noise >>>= 0; return noise / 2147483648 - 1; };
    const voice = (i0, secs, f) => { const m = Math.min(n - i0, Math.floor(secs * rate)); for (let i = 0; i < m; i++) buf[i0 + i] += f(i / rate); };
    const kick = (i0) => { let ph = 0; voice(i0, 0.32, (t) => { ph += 2 * Math.PI * (45 + 80 * Math.exp(-t * 30)) / rate; return Math.sin(ph) * Math.exp(-t * 9) * 0.85; }); };
    const snare = (i0) => voice(i0, 0.2, (t) => rnd() * Math.exp(-t * 22) * 0.38 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 28) * 0.25);
    const hat = (i0) => { let prev = 0; voice(i0, 0.05, (t) => { const x = rnd(), v = (x - prev) * Math.exp(-t * 90) * 0.09; prev = x; return v; }); };
    const bassNote = (i0, midi, secs) => {
        const f = midiHz(midi);
        voice(i0, secs, (t) => { const x = (t * f) % 1; return (4 * Math.abs(x - 0.5) - 1) * Math.min(1, t / 0.005) * Math.exp(-t * 3.5) * Math.min(1, (secs - t) / 0.02) * 0.32; });
    };
    const lead = (i0, midi, secs) => {
        const w = 2 * Math.PI * midiHz(midi);
        // sin 3x and sin 5x from sin x (one Math.sin a sample: a 2-minute song is made in well under a second)
        voice(i0, secs, (t) => { const x = Math.sin(w * t), x3 = x * x * x; return (x + (3 * x - 4 * x3) / 3 + (5 * x - 20 * x3 + 16 * x3 * x * x) / 6) * Math.min(1, t / 0.004) * Math.exp(-t * 5) * Math.min(1, (secs - t) / 0.03) * 0.2; });
    };
    const stepAt = (s) => at(song.startMs + s * song.stepMs);
    for (const [s, d] of song.drums) (d === 'k' ? kick : d === 's' ? snare : hat)(stepAt(s));
    for (const [s, m] of song.bass) bassNote(stepAt(s), m, song.stepMs / 1000 * 0.95);
    song.notes.forEach(([t], k) => lead(at(t), song.pitch[k], Math.min(0.45, song.beatMs / 1000)));
    // a gentle limiter: loud parts are rounded, never clipped hard
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(Math.tanh(buf[i] * 1.3) * 30000);
    return out;
}
