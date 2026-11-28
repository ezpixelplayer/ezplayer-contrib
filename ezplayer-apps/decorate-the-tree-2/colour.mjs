// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Colours for real LEDs. A phone's colours (#ffc83c, the colour picker) are sRGB: the screen applies a curve (gamma)
 * so that 128 looks like "half". LEDs are linear: 128 gives half the light, which the eye sees as nearly full. EZPlayer
 * sends our bytes straight to the controller (its API only has brightness and colour temperature), so without a curve
 * every mixed colour comes out washed out (gold turns pale yellow, a dim green turns cyan: the small blue part is far
 * too strong). So every colour sent goes:
 *
 *   sRGB 0..255 -> linear light 0..1, (v / 255) ^ gamma   (gamma 2.2 by default; 1.0 = off, for a controller that corrects)
 *   -> dimming in LINEAR light (the tree's dim background, fades, effects, white mixes: k x light, so they stay the same colour)
 *   -> balance per channel (R/G/B %, LEDs often look green or blue: the owner lowers that channel)
 *   -> x 255, rounded.
 *
 *   const col = new Colour(2.2, [100, 100, 100]);
 *   const L = col.hex('ffc83c');          // [1, 0.586, 0.041]
 *   col.led(scale(L, 0.5));              // the bytes for that colour at half its light
 */

export const hexRgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const c01 = (x) => (x > 1 ? 1 : x > 0 ? x : 0);

export class Colour {
    constructor(gamma = 2.2, bal = [100, 100, 100]) {
        this.gamma = Math.min(3, Math.max(1, +gamma || 2.2));
        this.bal = [0, 1, 2].map((i) => Math.min(100, Math.max(0, Number.isFinite(+bal[i]) ? +bal[i] : 100)) / 100);
        this.lut = Float32Array.from({ length: 256 }, (_, v) => (v / 255) ** this.gamma);   // the curve, worked out once
    }
    /** sRGB [r, g, b] 0..255 -> linear light [0..1] */
    lin(rgb) { const t = this.lut; return [t[Math.round(c01(rgb[0] / 255) * 255)], t[Math.round(c01(rgb[1] / 255) * 255)], t[Math.round(c01(rgb[2] / 255) * 255)]]; }
    hex(h) { return this.lin(hexRgb(h)); }
    /** linear light -> the bytes for the LEDs, with the balance */
    led(L) { const b = this.bal; return [Math.round(c01(L[0]) * b[0] * 255), Math.round(c01(L[1]) * b[1] * 255), Math.round(c01(L[2]) * b[2] * 255)]; }
}

/** k times the light (dimming, fades, effects) */
export const scale = (L, k) => [L[0] * k, L[1] * k, L[2] * k];
/** a mix towards white by a (0..1), in light */
export const mixWhite = (L, a) => (a > 0 ? [L[0] + (1 - L[0]) * a, L[1] + (1 - L[1]) * a, L[2] + (1 - L[2]) * a] : L);
