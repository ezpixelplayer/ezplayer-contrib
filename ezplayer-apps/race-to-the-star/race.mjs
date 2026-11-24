// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Race to the Star, as an EZPlayer app.
 *
 * One to eight phones race climbers up a track of lights: a matrix, a tree, or
 * any model or submodel of the show. Each phone measures its player's effort
 * (taps, voice, shaking, or running on the spot), turns it into a number from
 * 0 to 1 and sends it about once a second as an app event. This program climbs
 * 20 times a second with the last effort received, slides a climber that has
 * stopped, paints the track (and the star, when one is chosen) into overlay
 * leases while a race is on, and publishes the race as the app's status for
 * the phones to draw. Between races the leases are released so the show owns
 * the lights again.
 *
 * Environment (set by the player): EZP_API_URL, EZP_APP_INSTANCE, EZP_APP_TOKEN.
 * Settings come from the instance's private data key "settings".
 */

const base = (process.env.EZP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const instance = process.env.EZP_APP_INSTANCE;
const token = process.env.EZP_APP_TOKEN;
if (!instance || !token) {
    console.error('EZP_APP_INSTANCE and EZP_APP_TOKEN must be set (this program is started by the player)');
    process.exit(1);
}

const authHeaders = { 'x-ezp-app-token': token };
const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };
const appUrl = (path) => `${base}/api/ezp/apps/${encodeURIComponent(instance)}${path}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- The game's constants ----

const MODES = ['tap', 'voice', 'shake', 'run'];
const LEVELS = ['kid', 'adult', 'sport'];
const COLORS = ['ff2a2a', '2a7bff', '39d353', 'ffd23f', 'a35cff', 'ff8a1a', '2ad4ff', 'ff5cc8'];
// climbTime: how long an average effort (0.6) takes to climb the track; slide: track per second
// a stopped climber slides; slideDelay: seconds without effort before sliding starts.
const PRESETS = {
    easy: { climbTime: 25, slide: 0.02, slideDelay: 2.0 },
    normal: { climbTime: 35, slide: 0.035, slideDelay: 1.2 },
    hard: { climbTime: 45, slide: 0.06, slideDelay: 0.6 },
};
const DEFAULTS = {
    track: '',
    star: '',
    fps: 20,
    wait: 30,
    early: true,
    modes: [...MODES],
    levels: { kid: 1.5, adult: 1.0, sport: 0.8 },
    catchup: true,
    difficulty: 'normal',
    ...PRESETS.normal,
    maxTime: 90,
    maxPlayers: 4,
    colors: [...COLORS],
    bg: 'dim',
    brightness: 100,
    style: 'auto',
};
const COUNTDOWN_MS = 3000;
const PARTY_MS = 8000;
const NO_WINNER_MS = 3000;
const NOTICE_MS = 5000;
const CLIMBER_ROWS = 50; // "auto" style: a little figure from this many pixels tall, a rope below it
const MAX_GRID_PIXELS = 40000;

/** Settings as saved by the config page, with every field checked and defaulted. */
function cleanSettings(raw) {
    const s = { ...DEFAULTS, levels: { ...DEFAULTS.levels }, colors: [...DEFAULTS.colors], modes: [...DEFAULTS.modes] };
    if (!raw || typeof raw !== 'object') return s;
    const num = (v, lo, hi, dflt) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
    if (typeof raw.track === 'string') s.track = raw.track.trim();
    if (typeof raw.star === 'string') s.star = raw.star.trim();
    s.fps = Math.round(num(raw.fps, 5, 30, s.fps));
    s.wait = Math.round(num(raw.wait, 5, 300, s.wait));
    if (typeof raw.early === 'boolean') s.early = raw.early;
    if (Array.isArray(raw.modes)) {
        const modes = MODES.filter((m) => raw.modes.includes(m));
        if (modes.length) s.modes = modes;
    }
    if (raw.levels && typeof raw.levels === 'object') {
        for (const k of LEVELS) s.levels[k] = num(raw.levels[k], 0.3, 3, s.levels[k]);
    }
    if (typeof raw.catchup === 'boolean') s.catchup = raw.catchup;
    if (PRESETS[raw.difficulty]) {
        s.difficulty = raw.difficulty;
        Object.assign(s, PRESETS[raw.difficulty]);
    } else if (raw.difficulty === 'custom') {
        s.difficulty = 'custom';
        s.climbTime = num(raw.climbTime, 5, 300, s.climbTime);
        s.slide = num(raw.slide, 0, 0.5, s.slide);
        s.slideDelay = num(raw.slideDelay, 0, 10, s.slideDelay);
    }
    s.maxTime = Math.round(num(raw.maxTime, 20, 600, s.maxTime));
    if (Array.isArray(raw.colors)) {
        const colors = raw.colors
            .map((c) => String(c).replace(/^#/, '').toLowerCase())
            .filter((c) => /^[0-9a-f]{6}$/.test(c));
        if (colors.length) s.colors = [...new Set(colors)].slice(0, 8);
    }
    s.maxPlayers = Math.min(s.colors.length, Math.round(num(raw.maxPlayers, 1, 8, s.maxPlayers)));
    if (raw.bg === 'off' || raw.bg === 'dim') s.bg = raw.bg;
    s.brightness = Math.round(num(raw.brightness, 10, 100, s.brightness));
    if (['auto', 'rope', 'climber'].includes(raw.style)) s.style = raw.style;
    return s;
}

// ---- Colors ----

const hexRgb = (hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
const scale = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const WHITE = [255, 255, 255];
const SKIN = [255, 230, 190];

function hsv(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const rgb = [
        [v, t, p],
        [q, v, p],
        [p, v, t],
        [p, q, v],
        [t, p, v],
        [v, p, q],
    ][((i % 6) + 6) % 6];
    return rgb.map((x) => x * 255);
}

// ---- The race ----

class Race {
    constructor(settings) {
        this.s = settings;
        this.id = 0;
        this.reset();
    }

    reset() {
        this.id++;
        this.phase = 'idle'; // idle | waiting | countdown | running | finished
        this.players = [];
        this.winner = null;
        this.message = '';
        this.openedAt = 0;
        this.waitEndsAt = 0;
        this.startsAt = 0;
        this.endsAt = 0;
        this.partyEndsAt = 0;
        this.last = 0;
    }

    /** Opens the waiting room. */
    open(now) {
        this.reset();
        this.phase = 'waiting';
        this.openedAt = now;
        this.waitEndsAt = now + this.s.wait * 1000;
        this.message = 'Waiting for players';
    }

    /** Adds the phone `client` with its choices; returns an error message, or '' when it is in. */
    addPlayer(client, d, now) {
        const s = this.s;
        if (this.players.some((p) => p.id === client)) return '';
        if (this.players.length >= s.maxPlayers) return 'The race is full';
        const taken = this.players.map((p) => p.color);
        let color = typeof d.color === 'string' ? d.color.replace(/^#/, '').toLowerCase() : '';
        // A color already taken goes to the next free one, as the original does.
        if (!s.colors.includes(color) || taken.includes(color)) color = s.colors.find((c) => !taken.includes(c));
        if (!color) return 'No colors left';
        const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 16) : `Player ${this.players.length + 1}`;
        this.players.push({
            id: client,
            name,
            color,
            mode: s.modes.includes(d.mode) ? d.mode : s.modes[0],
            level: LEVELS.includes(d.level) ? d.level : 'adult',
            pos: 0,
            effort: 0,
            effortAt: 0,
            effortRx: 0,
            blinkUntil: now + 2500,
            done: false,
        });
        return '';
    }

    removePlayer(client) {
        // Once the race is over the lanes stay as they finished.
        if (this.phase === 'idle' || this.phase === 'finished') return;
        const before = this.players.length;
        this.players = this.players.filter((p) => p.id !== client);
        if (this.players.length < before && !this.players.length) this.finish(null, 'Everyone left');
    }

    /** The first player may start before the waiting room closes. */
    startNow(client, now) {
        if (this.phase !== 'waiting' || !this.s.early || this.players[0]?.id !== client) return;
        this.go(now);
    }

    setEffort(client, value, now) {
        const p = this.players.find((x) => x.id === client);
        if (!p || typeof value !== 'number' || !Number.isFinite(value)) return;
        if (now - p.effortRx < 300) return; // a phone sending faster than it should
        p.effort = Math.min(1, Math.max(0, value));
        p.effortAt = p.effortRx = now;
    }

    go(now) {
        this.phase = 'countdown';
        this.startsAt = now + COUNTDOWN_MS;
        this.endsAt = this.startsAt + this.s.maxTime * 1000;
        for (const p of this.players) {
            p.pos = 0;
            p.effort = 0;
            p.effortAt = 0;
        }
        this.message = 'Get ready';
        console.log(`Race starts with ${this.players.length} player(s)`);
    }

    finish(winner, message, now = Date.now()) {
        this.phase = 'finished';
        this.winner = winner;
        this.message = message;
        this.partyEndsAt = now + (winner !== null ? PARTY_MS : NO_WINNER_MS);
        if (winner !== null) this.players[winner].done = true;
        console.log(`Race over: ${message}`);
    }

    /** Timers and climbing; called every frame. */
    step(now) {
        const dt = Math.min(0.2, Math.max(0, (now - (this.last || now)) / 1000));
        this.last = now;
        if (this.phase === 'waiting' && now >= this.waitEndsAt) {
            if (this.players.length) this.go(now);
            else this.finish(null, 'Nobody joined', now);
        }
        if (this.phase === 'countdown' && now >= this.startsAt) {
            this.phase = 'running';
            this.message = 'Climb!';
        }
        if (this.phase === 'finished' && now >= this.partyEndsAt) this.reset();
        if (this.phase !== 'running') return;

        const s = this.s;
        const k = 1 / (0.6 * s.climbTime); // an effort of 0.6 climbs the track in climbTime seconds
        const lead = Math.max(0, ...this.players.map((p) => p.pos));
        for (const p of this.players) {
            // Phones send about once a second; an effort older than this is a phone that went quiet.
            const fresh = now - p.effortAt < Math.max(4, s.slideDelay + 0.4) * 1000;
            const e = fresh ? p.effort : 0;
            if (e > 0.05) {
                const help = 1 + (s.catchup ? Math.min(0.6, (lead - p.pos) * 1.5) : 0);
                p.pos = Math.min(1, p.pos + e * k * s.levels[p.level] * help * dt);
            } else if (now - p.effortAt > s.slideDelay * 1000) {
                p.pos = Math.max(0, p.pos - s.slide * dt);
            }
            if (p.pos >= 1) {
                this.finish(this.players.indexOf(p), `${p.name} reached the star!`, now);
                return;
            }
        }
        if (now >= this.endsAt) {
            let best = 0;
            for (let j = 1; j < this.players.length; j++) if (this.players[j].pos > this.players[best].pos) best = j;
            this.finish(best, `Time is up: ${this.players[best].name} was highest`, now);
        }
    }
}

// ---- Painting the track and the star ----

/**
 * Which lane and how far up each pixel of the track is. On a grid the lanes are
 * column groups and the height is the row; on a nodes target the node list is
 * cut into one segment per lane and the height runs along each segment. A grid
 * narrower than the players, or a node list too short for segments, falls back
 * to rings: every pixel shows every climber as a band at their height.
 */
class Track {
    constructor(shape, style) {
        this.shape = shape;
        this.style = style;
        this.n = 0;
    }

    layout(n) {
        if (n === this.n) return;
        this.n = n;
        const { kind, pixels } = this.shape;
        const prog = new Float32Array(pixels);
        const lane = new Int8Array(pixels);
        let rows;
        if (kind === 'grid') {
            const { width: w, height: h } = this.shape;
            rows = h;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    prog[i] = (h - 1 - y) / (h - 1);
                    lane[i] = w >= n ? Math.min(n - 1, Math.floor((x * n) / w)) : -1;
                }
            }
        } else if (Math.floor(pixels / n) >= 2) {
            rows = Math.floor(pixels / n);
            for (let i = 0; i < pixels; i++) {
                const j = Math.min(n - 1, Math.floor((i * n) / pixels));
                const s0 = Math.floor((j * pixels) / n);
                const s1 = Math.floor(((j + 1) * pixels) / n);
                lane[i] = j;
                prog[i] = (i - s0) / Math.max(1, s1 - s0 - 1);
            }
        } else {
            rows = pixels;
            lane.fill(-1);
            for (let i = 0; i < pixels; i++) prog[i] = i / Math.max(1, pixels - 1);
        }
        this.prog = prog;
        this.lane = lane;
        this.rows = Math.max(2, rows);
        this.step = 1 / (this.rows - 1);
        this.climber = this.style === 'climber' || (this.style === 'auto' && this.rows >= CLIMBER_ROWS);
    }

    /** One pixel of a lane during the race: a rope filled to the height, or a little climber on a dim rope. */
    climbPx(p, pl, col, now, t) {
        const h = pl.pos;
        const s = this.step;
        if (!this.climber) {
            // The rope, with the top three pixels a bit brighter as the head; the pixel the head is in lights gradually.
            if (p <= h - s) return h - p > 3 * s ? col : scale(col, 1.35);
            if (p < h + s) return scale(col, 1.35 * Math.max(0, Math.min(1, (h - p) / s + 1)));
            return null;
        }
        const d = (h - p) / s; // pixels below the climber's head
        if (d > -1 && d <= 0) return scale(SKIN, 1 + d);
        if (d > 0 && d <= 3) return col;
        if (d > 3 && d <= 5) {
            // Legs, which move while the player is climbing.
            const moving = now - pl.effortAt < 2000 && pl.effort > 0.05;
            const on = (Math.floor(d) + (moving ? Math.floor(t * 5) : 0)) % 2 === 0;
            return scale(col, on ? 0.8 : 0.25);
        }
        if (p <= h) return scale(col, 0.12);
        return null;
    }

    render(out, race, now, starCol, topIsStar) {
        const s = race.s;
        const players = race.players;
        this.layout(Math.max(1, players.length));
        const { prog, lane } = this;
        const nowS = now / 1000;
        const t = (now - race.openedAt) / 1000;
        const bright = s.brightness / 100;
        const dim = (col) => (s.bg === 'dim' ? scale(col, 1 / 14) : null);
        const winnerCol = race.winner !== null ? hexRgb(players[race.winner].color) : null;
        out.fill(0);
        for (let i = 0; i < prog.length; i++) {
            const p = prog[i];
            const ln = lane[i];
            let c = null;
            if (race.phase === 'finished' && winnerCol) {
                c = hsv((((p * 0.8 - t * 0.6) % 1) + 1) % 1, 1, 1); // the party: a rainbow climbing the track
            } else if (ln === -1) {
                const near = players.filter((pl) => Math.abs(p - pl.pos) < 0.05);
                if (near.length) c = hexRgb(near[Math.floor(t * 4) % near.length].color);
            } else if (ln < players.length) {
                const pl = players[ln];
                const col = hexRgb(pl.color);
                if (race.phase === 'waiting') {
                    c = pl.blinkUntil > now ? (Math.floor(nowS * 6) % 2 ? col : null) : dim(col);
                } else if (race.phase === 'countdown') {
                    c = p < nowS % 1 ? col : null;
                } else {
                    c = this.climbPx(p, pl, col, now, t) ?? dim(col);
                }
            }
            if (topIsStar && starCol && p > 0.94) c = starCol;
            if (c) {
                out[i * 3] = c[0] * bright;
                out[i * 3 + 1] = c[1] * bright;
                out[i * 3 + 2] = c[2] * bright;
            }
        }
    }
}

/** The star's color right now, or null for dark. */
function starColor(race, now) {
    const nowS = now / 1000;
    if (race.phase === 'finished' && race.winner !== null) {
        const col = hexRgb(race.players[race.winner].color);
        return Math.floor(nowS * 4) % 2 ? col : [40, 40, 40];
    }
    if (race.phase === 'running' && race.players.length) {
        let lead = race.players[0];
        for (const p of race.players) if (p.pos > lead.pos) lead = p;
        return scale(hexRgb(lead.color), 0.2);
    }
    if (race.phase === 'countdown') return nowS % 1 < 0.15 ? WHITE : null;
    return null;
}

/** The star prop: dark or dim during the race, the winner's color with a sparkle at the finish. */
function renderStar(out, race, now) {
    const bright = race.s.brightness / 100;
    const n = out.length / 3;
    const won = race.phase === 'finished' && race.winner !== null;
    const col = won ? hexRgb(race.players[race.winner].color) : starColor(race, now) ?? [8, 8, 8];
    const tick = Math.floor(now / 90);
    for (let i = 0; i < n; i++) {
        let c = col;
        if (won) {
            const twinkle = 0.55 + 0.45 * Math.sin(i * 1.7 + now / 110) ** 2;
            // A few nodes flash white each tick so the star glitters.
            c = (i * 7919 + tick * 104729) % 29 === 0 ? WHITE : scale(col, twinkle);
        }
        out[i * 3] = c[0] * bright;
        out[i * 3 + 1] = c[1] * bright;
        out[i * 3 + 2] = c[2] * bright;
    }
}

// ---- Player API: settings, targets, leases, status ----

async function findTarget(name) {
    const url = `${base}/api/ezp/overlays/targets?model=${encodeURIComponent(name)}&detail=submodels`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`targets: HTTP ${res.status}`);
    const { targets = [] } = await res.json();
    return targets.find((t) => (t.target ?? t.model) === name) ?? null;
}

/** How a target is raced: a dense grid as columns and rows, anything else along its node order. */
function trackShape(t) {
    const target = t.target ?? t.model;
    let w = t.width;
    let h = t.height;
    if (!t.subModel && w >= 2 && h >= 2) {
        if (w * h > MAX_GRID_PIXELS) {
            const k = Math.sqrt(MAX_GRID_PIXELS / (w * h));
            w = Math.max(2, Math.round(w * k));
            h = Math.max(2, Math.round(h * k));
        }
        return { target, kind: 'grid', width: w, height: h, pixels: w * h };
    }
    if (!t.nodeCount || t.nodeCount < 2) return null;
    return { target, kind: 'nodes', pixels: t.nodeCount };
}

/** Reads the settings and resolves the targets; returns { settings, track, star } or { error }. */
async function loadConfig() {
    const res = await fetch(appUrl('/data/private/settings'), { headers: authHeaders });
    if (res.status === 404) return { error: 'Not set up yet: open the app settings and pick a track.' };
    if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
    const settings = cleanSettings(await res.json().catch(() => null));
    if (!settings.track) return { error: 'Not set up yet: no track chosen in the app settings.' };
    const t = await findTarget(settings.track);
    const track = t && trackShape(t);
    if (!track) return { error: `"${settings.track}" is not an overlay target; check the app settings.` };
    let star = null;
    if (settings.star) {
        const st = await findTarget(settings.star);
        if (st?.nodeCount) star = { target: settings.star, nodeCount: st.nodeCount };
        else console.log(`Star "${settings.star}" is not an overlay target; racing without a star prop`);
    }
    return { settings, track, star };
}

async function openLease(body) {
    const res = await fetch(`${base}/api/ezp/overlays`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, blend: 'replace', ttlMs: 10_000 }),
    });
    const opened = await res.json().catch(() => ({}));
    if (!opened.ok || !opened.lease) throw new Error(opened.error ?? `HTTP ${res.status}`);
    return { ...opened.lease, payload: new Uint8Array(opened.lease.frameBytes), seq: 1 };
}

async function closeLease(lease) {
    if (!lease) return;
    await fetch(`${base}/api/ezp/overlays/${lease.id}?token=${lease.token}`, { method: 'DELETE' }).catch(() => undefined);
}

function putFrame(lease) {
    return fetch(`${base}/api/ezp/overlays/${lease.id}/frame?token=${lease.token}&seq=${lease.seq++}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: lease.payload,
    }).catch(() => undefined);
}

async function publishStatus(status) {
    await fetch(appUrl('/status'), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(status) }).catch(
        () => undefined,
    );
}

// ---- Main ----

async function main() {
    let quit = false;
    const poll = new AbortController();
    const stop = () => {
        quit = true;
        poll.abort();
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);

    let config = null; // { settings, track, star } once valid
    let configError = 'Starting up';
    let lastConfigCheck = -Infinity;
    let race = new Race(cleanSettings(null));
    let track = null;
    let trackLease = null;
    let starLease = null;
    let pendingOpen = null; // { client, data } of whoever asked for a new race; the main loop opens it
    let notice = ''; // why the last request was refused, shown to everyone for a few seconds
    let noticeAt = 0;
    const startedAt = Date.now();

    const releaseLeases = async () => {
        const t = trackLease;
        const s = starLease;
        trackLease = null;
        starLease = null;
        await closeLease(t);
        await closeLease(s);
    };

    const openLeases = async () => {
        await releaseLeases();
        const { settings, track: shape, star } = config;
        const body =
            shape.kind === 'grid'
                ? { model: shape.target, format: 'grid', width: shape.width, height: shape.height }
                : { model: shape.target, format: 'nodes' };
        trackLease = await openLease({ ...body, name: 'race-to-the-star' });
        // The lease says how many pixels it really takes; the track is laid out on that.
        track = new Track(
            { kind: shape.kind, width: trackLease.width, height: trackLease.height, pixels: trackLease.frameBytes / 3 },
            settings.style,
        );
        console.log(`Track lease ${trackLease.id} on ${shape.target} (${shape.kind}, ${track.shape.pixels} pixels)`);
        if (star) {
            try {
                starLease = await openLease({ model: star.target, format: 'nodes', name: 'race-to-the-star star' });
                console.log(`Star lease ${starLease.id} on ${star.target}`);
            } catch (e) {
                console.log(`No star: ${e.message}`);
            }
        }
    };

    const handleEvent = (ev) => {
        const d = ev?.data;
        if (!d || typeof d !== 'object') return;
        const type = d.type === 'input' ? d.input : d.type;
        const client = typeof ev.client === 'string' && ev.client ? ev.client : null;
        const now = Date.now();
        const joinable = race.phase === 'waiting';
        if (type === 'start' || (type === 'join' && !joinable && race.phase !== 'countdown' && race.phase !== 'running')) {
            // A new race: from a phone (which also joins) or from a show button (nobody yet).
            if (race.phase === 'idle' || race.phase === 'finished') {
                if (!pendingOpen) pendingOpen = { client, data: client ? d : null };
            } else if (client && joinable) {
                notice = race.addPlayer(client, d, now);
                noticeAt = now;
            }
            return;
        }
        if (!client) return;
        if (type === 'join') {
            notice = joinable ? race.addPlayer(client, d, now) : 'The race has started; join the next one';
            noticeAt = now;
        } else if (type === 'leave') {
            race.removePlayer(client);
        } else if (type === 'startNow') {
            race.startNow(client, now);
        } else if (type === 'effort') {
            if (race.phase === 'countdown' || race.phase === 'running') race.setEffort(client, d.value, now);
        }
    };

    const pollEvents = async () => {
        let since = 0;
        while (!quit) {
            try {
                const res = await fetch(appUrl(`/events?since=${since}&wait=30`), {
                    headers: authHeaders,
                    signal: poll.signal,
                });
                if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
                const { events = [] } = await res.json();
                for (const ev of events) {
                    since = Math.max(since, ev.id);
                    // Events queued before this process started are stale.
                    if (ev.ts >= startedAt - 2000) handleEvent(ev);
                }
            } catch (e) {
                if (quit) return;
                console.log(`events: ${e.message}`);
                await sleep(2000);
            }
        }
    };
    void pollEvents();

    let lastStatusJson = '';
    let lastStatusAt = 0;
    let lastStatusPhase = '';
    let lastPhase = '';

    while (!quit) {
        const now = Date.now();
        const frameMs = 1000 / (config?.settings.fps ?? 4);

        // Settings are re-read between races so the owner can change the track without a restart.
        if (race.phase === 'idle' && now - lastConfigCheck > 5000) {
            lastConfigCheck = now;
            try {
                const c = await loadConfig();
                config = c.settings ? c : null;
                configError = c.error ?? '';
                if (config && race.phase === 'idle') race = new Race(config.settings);
            } catch (e) {
                config = null;
                configError = `Player not reachable: ${e.message}`;
            }
        }

        if (pendingOpen) {
            const { client, data } = pendingOpen;
            pendingOpen = null;
            noticeAt = now;
            if (!config) {
                notice = configError;
            } else {
                try {
                    race = new Race(config.settings);
                    await openLeases();
                    race.open(now);
                    notice = data ? race.addPlayer(client, data, now) : '';
                } catch (e) {
                    race.reset();
                    notice = `Could not start: ${e.message}`;
                    console.log(notice);
                    lastConfigCheck = -Infinity;
                }
            }
        }

        race.step(now);

        if (trackLease) {
            if (race.phase === 'idle') {
                await releaseLeases();
            } else {
                const sc = starColor(race, now);
                track.render(trackLease.payload, race, now, sc, !starLease);
                const puts = [putFrame(trackLease)];
                if (starLease) {
                    renderStar(starLease.payload, race, now);
                    puts.push(putFrame(starLease));
                }
                await Promise.all(puts);
            }
        }

        if (race.phase !== lastPhase || now - noticeAt > NOTICE_MS) {
            lastPhase = race.phase;
            notice = '';
        }
        const s = race.s;
        const status = {
            phase: config || race.phase !== 'idle' ? race.phase : 'unconfigured',
            raceId: race.id,
            players: race.players.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
                mode: p.mode,
                level: p.level,
                pos: Math.round(p.pos * 1000) / 1000,
                done: p.done,
            })),
            waitEndsAt: race.phase === 'waiting' ? race.waitEndsAt : null,
            startsAt: race.phase === 'countdown' || race.phase === 'running' ? race.startsAt : null,
            endsAt: race.phase === 'running' ? race.endsAt : null,
            winner: race.winner,
            message: !config && race.phase === 'idle' ? configError : notice || race.message || 'Tap New race to play',
            lanes: race.players.length,
            star: !!starLease,
            modes: s.modes,
            colors: s.colors,
            maxPlayers: s.maxPlayers,
            early: s.early,
            wait: s.wait,
        };
        const json = JSON.stringify(status);
        const phaseChanged = status.phase !== lastStatusPhase;
        // Positions change every frame; the phones need them a few times a second, not twenty.
        if (
            (json !== lastStatusJson && (phaseChanged || now - lastStatusAt > 250)) ||
            now - lastStatusAt > 2000
        ) {
            lastStatusJson = json;
            lastStatusPhase = status.phase;
            lastStatusAt = now;
            await publishStatus(status);
        }
        await sleep(frameMs);
    }

    await releaseLeases();
    await publishStatus({
        phase: 'idle',
        raceId: 0,
        players: [],
        waitEndsAt: null,
        startsAt: null,
        endsAt: null,
        winner: null,
        message: 'App stopped',
        lanes: 0,
        star: false,
        modes: [],
        colors: [],
        maxPlayers: 0,
        early: false,
        wait: 0,
    });
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
