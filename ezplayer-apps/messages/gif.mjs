// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * A small GIF reader (GIF87a / GIF89a, animated, with transparency and the three ways of clearing a frame), no
 * dependencies. readGif(bytes) -> { w, h, frames: [{ rgb: Uint8Array(w*h*3), ms }] }: every frame already put together
 * on the full picture, black where nothing was ever drawn.
 */

function lzw(data, minSize, count) {
    const out = new Uint8Array(count);
    const clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1, prev = -1, pos = 0, bits = 0, acc = 0;
    const pre = new Int32Array(4096), suf = new Uint8Array(4096), len = new Uint16Array(4096);
    for (let i = 0; i < clear; i++) { pre[i] = -1; suf[i] = i; len[i] = 1; }
    const first = (c) => { while (pre[c] >= 0) c = pre[c]; return suf[c]; };
    const emit = (c) => { const l = len[c]; let p = pos + l - 1; for (let x = c; x >= 0 && p >= pos; x = pre[x]) { if (p < count) out[p] = suf[x]; p--; } pos += l; };
    for (let i = 0; i < data.length && pos < count; i++) {
        acc |= data[i] << bits; bits += 8;
        while (bits >= size && pos < count) {
            const code = acc & ((1 << size) - 1);
            acc >>= size; bits -= size;
            if (code === clear) { size = minSize + 1; next = eoi + 1; prev = -1; continue; }
            if (code === eoi) return out;
            if (prev < 0) { emit(code); prev = code; continue; }
            let k;
            if (code < next) { emit(code); k = first(code); }
            else { k = first(prev); pre[next] = prev; suf[next] = k; len[next] = len[prev] + 1; emit(next); prev = code; next++; if (next === 1 << size && size < 12) size++; continue; }
            if (next < 4096) { pre[next] = prev; suf[next] = k; len[next] = len[prev] + 1; next++; if (next === 1 << size && size < 12) size++; }
            prev = code;
        }
    }
    return out;
}

export function readGif(b) {
    b = b instanceof Uint8Array ? b : new Uint8Array(b);
    const sig = String.fromCharCode(...b.subarray(0, 6));
    if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('not a GIF');
    const u16 = (p) => b[p] | (b[p + 1] << 8);
    const w = u16(6), h = u16(8), flags = b[10];
    if (!w || !h || w * h > 512 * 512) throw new Error('GIF too big');
    let p = 13, gct = null;
    const table = (p0, n) => { const t = []; for (let i = 0; i < n; i++) t.push([b[p0 + i * 3], b[p0 + i * 3 + 1], b[p0 + i * 3 + 2]]); return t; };
    if (flags & 0x80) { const n = 2 << (flags & 7); gct = table(p, n); p += n * 3; }
    const canvas = new Uint8Array(w * h * 3), frames = [];
    let delay = 100, trans = -1, disposal = 0;
    while (p < b.length) {
        const c = b[p++];
        if (c === 0x3b) break;
        if (c === 0x21) {                                       // extension
            const label = b[p++];
            if (label === 0xf9 && b[p] >= 4) { const pf = b[p + 1]; disposal = (pf >> 2) & 7; delay = u16(p + 2) * 10; trans = pf & 1 ? b[p + 4] : -1; }
            while (p < b.length && b[p]) p += b[p] + 1;
            p++;
            continue;
        }
        if (c !== 0x2c) break;                                  // anything else: stop
        const fx = u16(p), fy = u16(p + 2), fw = u16(p + 4), fh = u16(p + 6), ff = b[p + 8];
        p += 9;
        let ct = gct;
        if (ff & 0x80) { const n = 2 << (ff & 7); ct = table(p, n); p += n * 3; }
        const minSize = b[p++], parts = [];
        while (p < b.length && b[p]) { parts.push(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; }
        p++;
        const data = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
        let o = 0; for (const x of parts) { data.set(x, o); o += x.length; }
        const idx = lzw(data, minSize, fw * fh);
        const rows = [];                                        // interlaced: rows 0, 8, 16… then 4, 12… then 2, 6… then 1, 3…
        if (ff & 0x40) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < fh; y += st) rows.push(y); }
        else for (let y = 0; y < fh; y++) rows.push(y);
        const before = disposal === 3 ? canvas.slice() : null;
        if (ct) rows.forEach((y, r) => {
            for (let x = 0; x < fw; x++) {
                const v = idx[r * fw + x], X = fx + x, Y = fy + y;
                if (v === trans || X >= w || Y >= h || !ct[v]) continue;
                canvas.set(ct[v], (Y * w + X) * 3);
            }
        });
        frames.push({ rgb: canvas.slice(), ms: delay >= 20 ? delay : 100 });
        if (disposal === 2) for (let y = fy; y < Math.min(h, fy + fh); y++) canvas.fill(0, (y * w + fx) * 3, (y * w + Math.min(w, fx + fw)) * 3);
        else if (disposal === 3 && before) canvas.set(before);
        delay = 100; trans = -1; disposal = 0;
    }
    if (!frames.length) throw new Error('no picture in the GIF');
    return { w, h, frames };
}
