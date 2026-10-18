/**
 * Realistic lab readings. Every reading is the engine's true value with a
 * small random error, rounded to the instrument's least count, from a seeded
 * generator: the same seed always gives the same readings, so a printed sheet
 * and its key always agree, and each student can get their own set.
 */

export type Rng = () => number;

/** A short string (student id + practical id) to a 32-bit seed. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32: small, fast, and identical in every browser and on the server. */
export function rngOf(seed: number | string): Rng {
  let a = typeof seed === 'string' ? seedOf(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normal deviate (Box-Muller), mean 0, sd 1. */
export function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Rounds to a least count without float noise (0.1 → 2.3, not 2.3000000000000003). */
export function toLeastCount(x: number, lc: number): number {
  const dp = Math.max(0, Math.ceil(-Math.log10(lc) - 1e-9));
  return Number((Math.round(x / lc) * lc).toFixed(dp));
}

/**
 * One reading: the true value plus an error of about `sd` (a fraction of the
 * value, or `abs` in the value's units), clipped to ±2.5 sd so no reading is
 * wild, then read off the instrument.
 */
export function read(rng: Rng, truth: number, lc: number, err: { sd?: number; abs?: number } = {}): number {
  const spread = (err.abs ?? 0) + Math.abs(truth) * (err.sd ?? 0);
  const e = Math.max(-2.5, Math.min(2.5, gauss(rng))) * spread;
  return toLeastCount(truth + e, lc);
}

/** A whole number in [lo, hi]. */
export const intIn = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** One of a list. */
export const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/** A shuffled copy (Fisher-Yates). */
export function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Least-squares slope through the origin (V-I graphs, distance-time). */
export function slopeThroughOrigin(xs: number[], ys: number[]): number {
  const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0), sxx = xs.reduce((s, x) => s + x * x, 0);
  return sxx ? sxy / sxx : 0;
}
