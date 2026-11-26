// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * When someone wins or loses a game: a sound (built in, or the show's own WAV files), the words said out loud by the
 * computer's own voice, the words written across the lights, and a machine (bubbles, fog, lights…) for a few seconds.
 * Every part is switched on in the game's settings (all off by default), and each one for a win, a loss or both.
 *
 * The game says what happened through outcome(): { kind: 'win' | 'lose' | 'record', vars: { winner, colour, score } }.
 * The words can use {winner} (a name, "Player 1", or the colour), {colour} (the winner's colour, as a word) and {score}.
 * Shared by all the ShowPlay game apps; needs machine.mjs, audio.mjs and lights.mjs next to it.
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { dmxValues, runMachine, MachineLink, MACHINE_HOWS } from './machine.mjs';
import { playSound, readWav, tempWav, busFor } from './audio.mjs';
import { Text, plain } from './lights.mjs';

export const END_DEFAULTS = {
    endWin: true, endLose: true,
    endSound: 'off', endWinWav: '', endLoseWav: '', endVolume: 80, endBus: 'immediate', endPi: '', endPiKey: '',
    endVoice: false, endVoiceLang: 'en', endBanner: false,
    endWinText: '{winner} wins!', endLoseText: 'Game over!', endRecordText: 'New record: {score}!',
    endMachine: false, endHow: 'url', endOnUrl: '', endOffUrl: '', endHost: '', endUniverse: 1, endModel: '',
    endWinCh: '1=255', endWinSecs: 5, endLoseCh: '', endLoseSecs: 3, endLoseUrl: false, endGap: 20,
};

/** the ending settings, checked, added to a game's settings (texts: the game's own default words) */
export function cleanEnd(raw, s, texts = {}) {
    Object.assign(s, END_DEFAULTS, texts);
    if (!raw || typeof raw !== 'object') return s;
    for (const k of ['endWin', 'endLose', 'endVoice', 'endBanner', 'endMachine', 'endLoseUrl']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (['off', 'built', 'files'].includes(raw.endSound)) s.endSound = raw.endSound;
    if (['immediate', 'main', 'local', 'pi'].includes(raw.endBus)) s.endBus = raw.endBus;
    if (typeof raw.endPi === 'string' && (raw.endPi.trim() === '' || /^[\w.-]{1,253}(:\d{1,5})?$/.test(raw.endPi.trim()))) s.endPi = raw.endPi.trim();
    if (typeof raw.endPiKey === 'string') s.endPiKey = raw.endPiKey.trim().slice(0, 64);
    if (MACHINE_HOWS.includes(raw.endHow)) s.endHow = raw.endHow;
    const num = (k, lo, hi) => { if (raw[k] !== '' && raw[k] !== null && Number.isFinite(+raw[k])) s[k] = Math.max(lo, Math.min(hi, Math.round(+raw[k]))); };
    num('endVolume', 5, 100); num('endUniverse', 0, 63999); num('endWinSecs', 1, 60); num('endLoseSecs', 1, 60); num('endGap', 0, 600);
    for (const k of ['endWinWav', 'endLoseWav', 'endModel']) if (typeof raw[k] === 'string') s[k] = raw[k].trim().slice(0, 300);
    for (const k of ['endWinText', 'endLoseText', 'endRecordText']) if (typeof raw[k] === 'string') s[k] = raw[k].trim().slice(0, 60);
    if (typeof raw.endVoiceLang === 'string' && /^[a-zA-Z-]{0,10}$/.test(raw.endVoiceLang.trim())) s.endVoiceLang = raw.endVoiceLang.trim();
    for (const k of ['endOnUrl', 'endOffUrl']) if (typeof raw[k] === 'string' && (raw[k].trim() === '' || /^https?:\/\/\S+$/.test(raw[k].trim()))) s[k] = raw[k].trim();
    if (typeof raw.endHost === 'string' && (raw.endHost.trim() === '' || /^[\w.-]{1,253}$/.test(raw.endHost.trim()))) s.endHost = raw.endHost.trim();
    for (const k of ['endWinCh', 'endLoseCh']) if (typeof raw[k] === 'string' && (raw[k].trim() === '' || dmxValues(raw[k]))) s[k] = raw[k].trim().slice(0, 300);
    return s;
}

const NAMED = [['Red', 255, 40, 40], ['Orange', 255, 130, 20], ['Yellow', 255, 220, 50], ['Green', 50, 210, 80], ['Cyan', 40, 200, 230],
    ['Blue', 40, 110, 255], ['Purple', 150, 80, 255], ['Pink', 255, 80, 200], ['White', 255, 255, 255]];
/** a colour (rrggbb) as a word: Red, Blue… */
export function colourName(hex) {
    const n = parseInt(String(hex || '').replace('#', ''), 16);
    if (!Number.isFinite(n)) return '';
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    let best = '', d = Infinity;
    for (const [name, R, G, B] of NAMED) { const e = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (e < d) { d = e; best = name; } }
    return best;
}

export function endWords(s, kind, vars = {}) {
    const t = kind === 'record' ? s.endRecordText : kind === 'win' ? s.endWinText : s.endLoseText;
    return String(t || '').replace(/\{(winner|colour|color|score)\}/g, (_, k) => String(vars[k === 'color' ? 'colour' : k] ?? '')).replace(/\s+/g, ' ').trim();
}

// ---- the built-in sounds: a short fanfare and a sad "wah wah wah waaah" ----
const RATE = 22050;
function tone(out, at, f0, f1, secs, vol, vib = 0) {
    const n = Math.floor(secs * RATE), s0 = Math.floor(at * RATE);
    let ph = 0;
    for (let i = 0; i < n && s0 + i < out.length; i++) {
        const t = i / RATE, f = f0 + (f1 - f0) * (i / n) + (vib ? Math.sin(t * 2 * Math.PI * 6) * vib : 0);
        ph += 2 * Math.PI * f / RATE;
        const env = Math.min(1, t / 0.01) * Math.min(1, (secs - t) / 0.06);
        const v = (Math.sin(ph) * 0.6 + Math.sin(2 * ph) * 0.25 + Math.sin(3 * ph) * 0.15) * env * vol;   // brassy
        out[s0 + i] = Math.max(-32767, Math.min(32767, out[s0 + i] + v * 26000));
    }
}
export function builtInSound(kind) {
    if (kind === 'lose') {
        const out = new Int16Array(Math.floor(2.4 * RATE));
        tone(out, 0.0, 392, 392, 0.42, 0.8); tone(out, 0.48, 370, 370, 0.42, 0.8); tone(out, 0.96, 349, 349, 0.42, 0.8);
        tone(out, 1.44, 330, 318, 0.95, 0.85, 7);
        return out;
    }
    const out = new Int16Array(Math.floor(1.7 * RATE));
    tone(out, 0.0, 523, 523, 0.14, 0.7); tone(out, 0.16, 659, 659, 0.14, 0.7); tone(out, 0.32, 784, 784, 0.14, 0.7);
    tone(out, 0.5, 1047, 1047, 0.55, 0.8); tone(out, 0.5, 784, 784, 0.55, 0.4); tone(out, 1.1, 1047, 1047, 0.55, 0.6, 4);
    return out;
}

// ---- the computer's own voice: Windows (System.Speech), macOS (say), Linux (espeak-ng, espeak or pico2wave) ----
function run(cmd, args) {
    return new Promise((ok) => {
        let p; try { p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true }); } catch (e) { ok(false); return; }
        const t = setTimeout(() => p.kill(), 20000);
        p.on('error', () => { clearTimeout(t); ok(false); });
        p.on('exit', (c) => { clearTimeout(t); ok(c === 0); });
    });
}
const voiceCache = new Map();
/** the words said by the computer, as { rate, samples }, or null when this computer has no voice */
export async function speak(words, lang = 'en') {
    const key = lang + '|' + words;
    if (voiceCache.has(key)) return voiceCache.get(key);
    const file = tempWav('voice'), say = plain(words).replace(/["'`$\\]/g, ' ').slice(0, 120);
    let ok = false;
    if (process.platform === 'win32') {
        const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
            `$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like '${lang || 'en'}*' } | Select-Object -First 1; ` +
            `if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate = 0; $s.SetOutputToWaveFile('${file.replace(/'/g, "''")}'); $s.Speak('${say}'); $s.Dispose()`;
        ok = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else if (process.platform === 'darwin') ok = await run('say', ['--data-format=LEI16@22050', '-o', file, say]);
    else {
        ok = await run('espeak-ng', ['-v', lang || 'en', '-w', file, say]) || await run('espeak', ['-v', lang || 'en', '-w', file, say])
            || await run('pico2wave', ['-l', lang === 'en' ? 'en-US' : lang, '-w', file, say]);
    }
    let out = null;
    try { if (ok) { const w = readWav(file); out = { rate: w.rate, samples: w.mono(0, w.seconds) }; } } catch (e) { out = null; }
    fs.rm(file, () => undefined);
    if (voiceCache.size > 30) voiceCache.clear();
    voiceCache.set(key, out);
    return out;
}

/** one per app: plays the ending of each game and draws its words across the lights */
export class Ending {
    constructor(log = (...a) => console.log('ending:', ...a)) {
        this.log = log; this.link = new MachineLink(log); this.machineBusy = false; this.machineNext = 0; this.soundBusy = false;
        this.banner = null; this.warnedVoice = false;
    }
    /** what happened: kind 'win', 'lose' or 'record' (a win alone: a new best score) */
    fire(s, kind, vars = {}) {
        if (!s || !['win', 'lose', 'record'].includes(kind)) return;
        const lose = kind === 'lose';
        if (lose ? !s.endLose : !s.endWin) return;
        const words = endWords(s, kind, vars);
        this.log(`${kind}: ${words || '(no words)'}`);
        if (s.endBanner && words) this.banner = { words, col: lose ? [255, 60, 60] : [255, 200, 40], t0: Date.now(), anim: null };
        void this.sound(s, kind, words);
        void this.machine(s, lose);
    }
    async sound(s, kind, words) {
        if (this.soundBusy) return;
        this.soundBusy = true;
        try {
            const vol = s.endVolume / 100, lose = kind === 'lose', bus = busFor(s.endBus, s.endPi, s.endPiKey);
            if (s.endSound === 'built') await playSound(builtInSound(lose ? 'lose' : 'win'), RATE, vol, bus);
            else if (s.endSound === 'files') {
                const f = lose ? s.endLoseWav : s.endWinWav;
                if (f) { try { const w = readWav(f); await playSound(w.mono(0, Math.min(15, w.seconds)), w.rate, vol, bus); } catch (e) { this.log(`the sound ${f} could not be played: ${e.message}`); } }
            }
            if (s.endVoice && words) {
                const v = await speak(words, s.endVoiceLang);
                if (v) await playSound(v.samples, v.rate, vol, bus);
                else if (!this.warnedVoice) { this.warnedVoice = true; this.log('this computer has no voice to say the words (on Linux install espeak-ng)'); }
            }
        } catch (e) { this.log('sound:', e.message); }
        finally { this.soundBusy = false; }
    }
    async machine(s, lose) {
        if (!s.endMachine || this.machineBusy || Date.now() < this.machineNext) return;
        const url = s.endHow === 'url';
        if (url ? (!s.endOnUrl || (lose && !s.endLoseUrl)) : !(lose ? dmxValues(s.endLoseCh) : dmxValues(s.endWinCh))) return;
        if (!url && (s.endHow === 'ezp' ? !s.endModel : !s.endHost)) return;
        const secs = lose ? s.endLoseSecs : s.endWinSecs;
        this.machineBusy = true; this.machineNext = Date.now() + (secs + s.endGap) * 1000;
        try {
            await runMachine({ how: s.endHow, on: s.endOnUrl, off: s.endOffUrl, host: s.endHost, universe: s.endUniverse, model: s.endModel,
                channels: lose ? s.endLoseCh : s.endWinCh }, secs, this.log, this.link);
        } catch (e) { this.log('the machine could not be switched on:', e.message); }
        finally { this.machineBusy = false; }
    }
    /** writes the words across the lights (over what the game draws), once, with a dark band behind them */
    draw(out, w, h, now) {
        const b = this.banner;
        if (!b) return;
        if (!b.anim || b.anim.w !== w || b.anim.h !== h) { b.anim = new Text(w, h, b.words.toUpperCase(), b.col); b.top = 0; }
        const t = (now - b.t0) / 1000;
        if (t > b.anim.seconds()) { this.banner = null; return; }
        const f = b.anim.frame(t), bw = b.anim.w, bh = b.anim.h;
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
            const i = (y * bw + x) * 3, o = ((y + b.top) * w + x) * 3;
            if (f[i] || f[i + 1] || f[i + 2]) { out[o] = f[i]; out[o + 1] = f[i + 1]; out[o + 2] = f[i + 2]; }
            else { out[o] >>= 2; out[o + 1] >>= 2; out[o + 2] >>= 2; }
        }
    }
    busy() { return !!this.banner; }
}

/** the settings fields for the game's settings page (build.py), with the game's own words and what it can tell */
export function endFields(texts = {}, record = false) {
    const d = { ...END_DEFAULTS, ...texts };
    return [
        { section: '🎉 When someone wins or loses' },
        { id: 'endWin', type: 'check', text: '🏆 When someone wins', default: true },
        { id: 'endLose', type: 'check', text: '😢 When someone loses (or the computer wins)', default: true },
        { id: 'endSound', type: 'select', label: '🔊 Sound', options: [['off', 'Off'], ['built', 'Built in: a fanfare for a win, a "wah wah" for a loss'], ['files', 'My own WAV files']], default: 'off' },
        { id: 'endVolume', type: 'number', label: 'Volume (5 to 100)', min: 5, max: 100, default: 80 },
        { id: 'endBus', type: 'select', label: 'Where it plays', options: [['immediate', "The show's speakers (EZPlayer)"], ['main', "Mixed with the show's music (EZPlayer)"], ['local', "This computer's speaker"], ['pi', 'A Raspberry Pi on the network (ShowPlay speaker)']], default: 'immediate', end: true },
        { id: 'endPi', type: 'text', label: 'Raspberry Pi: its IP address (add :port if not 8765)', default: '', placeholder: '192.168.1.70' },
        { id: 'endPiKey', type: 'text', label: 'Raspberry Pi: its key (only if you set one)', default: '', end: true },
        { id: 'endWinWav', type: 'text', label: 'My own sound for a win (a WAV file on this computer)', default: '', placeholder: 'C:\\Sounds\\win.wav' },
        { id: 'endLoseWav', type: 'text', label: 'My own sound for a loss', default: '', placeholder: 'C:\\Sounds\\lose.wav', end: true },
        { id: 'endVoice', type: 'check', text: "🗣️ Say the words out loud (the computer's own voice, after the sound)", default: false },
        { id: 'endVoiceLang', type: 'text', label: 'Voice language (en, pt, es…; the computer must have that voice)', default: 'en', placeholder: 'en' },
        { id: 'endBanner', type: 'check', text: '🔤 Write the words across the lights', default: false },
        { id: 'endWinText', type: 'text', label: 'Words for a win: {winner}, {colour}, {score}', default: d.endWinText },
        ...(record ? [{ id: 'endRecordText', type: 'text', label: 'Words for a new best score of the day', default: d.endRecordText }] : []),
        { id: 'endLoseText', type: 'text', label: 'Words for a loss', default: d.endLoseText, end: true },
        { id: 'endMachine', type: 'check', text: '🫧 A machine for a few seconds (bubbles, fog, snow, lights…)', default: false },
        { id: 'endHow', type: 'select', label: 'How the app reaches the machine', options: [['url', 'Web address (smart plug, relay, Shelly, Tasmota)'], ['ezp', 'DMX through EZPlayer (a model in the layout)'], ['ddp', 'DMX by DDP (WLED or a board with a DMX output)'], ['artnet', 'DMX by Art-Net (a DMX node)'], ['e131', 'DMX by E1.31 / sACN (a DMX node)']], default: 'url', end: true },
        { id: 'endOnUrl', type: 'text', label: 'Web address: for on', default: '', placeholder: 'http://192.168.1.50/relay/0?turn=on' },
        { id: 'endOffUrl', type: 'text', label: 'Web address: for off', default: '', placeholder: 'http://192.168.1.50/relay/0?turn=off' },
        { id: 'endLoseUrl', type: 'check', text: 'Web address: also when someone loses', default: false, end: true },
        { id: 'endHost', type: 'text', label: "DMX by DDP / Art-Net / E1.31: the board's IP address", default: '', placeholder: '192.168.1.60' },
        { id: 'endUniverse', type: 'number', label: 'Art-Net / E1.31: universe', min: 0, max: 63999, default: 1, end: true },
        { id: 'endPicker', type: 'models', for: 'endModel', single: true, label: "DMX through EZPlayer: the show's models (tap the machine's model)" },
        { id: 'endModel', type: 'text', label: 'DMX through EZPlayer: the model', default: '', placeholder: 'BubbleMachine', end: true },
        { id: 'endWinCh', type: 'text', label: 'DMX for a win: channel=value (e.g. 1=255, 2=180, 3=220, 5=255, 9=255)', default: '1=255' },
        { id: 'endWinSecs', type: 'number', label: 'Seconds for a win', min: 1, max: 60, default: 5 },
        { id: 'endLoseCh', type: 'text', label: 'DMX for a loss (empty: the machine stays off; e.g. only a red light 5=255, 6=255)', default: '' },
        { id: 'endLoseSecs', type: 'number', label: 'Seconds for a loss', min: 1, max: 60, default: 3 },
        { id: 'endGap', type: 'number', label: 'The machine rests between two (seconds)', min: 0, max: 600, default: 20, end: true,
            hint: 'Every other DMX channel is 0, and all go back to 0 at the end. The fun README explains each way of reaching a machine, and DMX channels.' },
    ];
}
