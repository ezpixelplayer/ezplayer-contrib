// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * The body sensor: an ESP32 with an HLK-LD2450 radar (see body-sensor/) that sees up to 3 people in front of the lights.
 * It answers GET /targets with {"t":[{"x":mm,"y":mm,...}]}: x across (+ to the radar's right), y the distance in front.
 * The games read it about 20 times a second while a game played "with the body" is on, and turn each person into a
 * position: u across the play area (0 = left, 1 = right, as the players see it) and w away from the radar (0 = near).
 *
 * Settings (in every game that can use it): sensorUrl (empty = no sensor), sensorWidth (metres across the play area),
 * sensorNear / sensorFar (metres from the radar), sensorMirror (the radar faces the players, so their left is its
 * right: on by default).
 */

export const SENSOR_DEFAULTS = { sensorUrl: '', sensorWidth: 3, sensorNear: 0.5, sensorFar: 4, sensorMirror: true };

export function cleanSensor(raw, s) {
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.sensorUrl === 'string') {
        const u = raw.sensorUrl.trim();
        s.sensorUrl = u === '' ? '' : /^https?:\/\/[\w.:\-[\]]+(\/[\w./-]*)?$/i.test(u) ? u : /^[\w.:\-]+$/.test(u) ? 'http://' + u : s.sensorUrl;
    }
    const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    s.sensorWidth = n(raw.sensorWidth, 0.5, 8, s.sensorWidth);
    s.sensorNear = n(raw.sensorNear, 0, 6, s.sensorNear);
    s.sensorFar = n(raw.sensorFar, 0.5, 8, s.sensorFar);
    if (s.sensorFar <= s.sensorNear + 0.3) s.sensorFar = s.sensorNear + 0.3;
    if (typeof raw.sensorMirror === 'boolean') s.sensorMirror = raw.sensorMirror;
    return s;
}

class BodySensor {
    constructor() { this.url = ''; this.targets = []; this.at = 0; this.err = ''; this.busy = false; this.lastPoll = 0; this.wanted = 0; }

    /** follow the settings; polling happens only while someone asked for the sensor in the last few seconds */
    configure(s) {
        let u = (s.sensorUrl || '').replace(/\/+$/, '');
        if (u && !/\/targets$/.test(u)) u += '/targets';
        if (u !== this.url) { this.url = u; this.targets = []; this.at = 0; this.err = ''; }
        this.s = s;
    }

    /** reads the sensor now and then: every 50 ms while a game uses it, every second otherwise (slow), so the phones know it answers */
    tick(now = Date.now(), slow = false) {
        if (!this.url || this.busy || now - this.lastPoll < (slow ? 1000 : 50)) return;
        this.busy = true; this.lastPoll = now;
        fetch(this.url, { signal: AbortSignal.timeout(500) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('answer ' + r.status))))
            .then((j) => { this.targets = Array.isArray(j?.t) ? j.t.filter((t) => Number.isFinite(t?.x) && Number.isFinite(t?.y)).slice(0, 3) : []; this.at = Date.now(); this.err = ''; })
            .catch((e) => { this.err = e.message || String(e); })
            .finally(() => { this.busy = false; });
    }

    on() { return !!this.url; }
    ok() { return !!this.url && Date.now() - this.at < 2500; }

    /** the people inside the play area, left to right as the players see it: {u, w, x, y} */
    people() {
        const s = this.s || SENSOR_DEFAULTS, W = s.sensorWidth * 1000, near = s.sensorNear * 1000, far = s.sensorFar * 1000;
        if (!this.ok()) return [];
        return this.targets.map((t) => {
            const x = s.sensorMirror ? -t.x : t.x;
            return { u: (x + W / 2) / W, w: (t.y - near) / (far - near), x: t.x, y: t.y };
        }).filter((p) => p.u >= -0.15 && p.u <= 1.15 && p.w >= -0.15 && p.w <= 1.15)
            .map((p) => ({ ...p, u: Math.max(0, Math.min(1, p.u)), w: Math.max(0, Math.min(1, p.w)) }))
            .sort((a, b) => a.u - b.u);
    }

    /**
     * where player i of n is: the play area is split into n lanes, left to right, and the person in lane i moves that
     * player across the whole of their own lane (u and w from 0 to 1); null when nobody is in that lane. Alone, the
     * person nearest the middle plays.
     */
    player(i, n) {
        const ps = this.people();
        if (!ps.length) return null;
        if (n <= 1) { const p = ps.reduce((a, b) => (Math.abs(b.u - 0.5) < Math.abs(a.u - 0.5) ? b : a)); return { u: p.u, w: p.w }; }
        const lo = i / n, hi = (i + 1) / n, inLane = ps.filter((p) => p.u >= lo - 1e-9 && p.u <= hi + 1e-9);
        if (!inLane.length) return null;
        const p = inLane.reduce((a, b) => (Math.abs(b.u - (lo + hi) / 2) < Math.abs(a.u - (lo + hi) / 2) ? b : a));
        return { u: (p.u - lo) / (hi - lo), w: p.w };
    }

    /** what the phones are told: is a sensor set up, is it answering, how many people it sees */
    state() { return { on: this.on(), ok: this.ok(), n: this.ok() ? this.people().length : 0 }; }
}

/** one sensor for the whole app */
export const sensor = new BodySensor();

/**
 * turns a person's walk into Snake turns: a step of about 30 cm left, right, away or nearer (since the last turn)
 * gives that direction. Keep one per player.
 */
export class StepTurns {
    constructor() { this.ref = null; }
    next(pos, cur) {
        if (!pos) { this.ref = null; return null; }
        if (!this.ref) { this.ref = { ...pos }; return null; }
        const du = pos.u - this.ref.u, dw = pos.w - this.ref.w, th = 0.12;
        if (Math.max(Math.abs(du), Math.abs(dw)) < th) return null;
        this.ref = { ...pos };
        const d = Math.abs(du) >= Math.abs(dw) ? (du > 0 ? 'right' : 'left') : (dw > 0 ? 'up' : 'down');
        return d === cur ? null : d;
    }
}
