// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/** small helpers shared by the apps that light props */
export function num(v, lo, hi, d) { return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
export const cleanName = (name, d) => String(name ?? '').replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, 16) || d;
