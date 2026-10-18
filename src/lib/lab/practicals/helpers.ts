import type { Column, Readings, ResultSpec } from './types';

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Rounds for a printed key (no float tails like 4.999999). */
export const r = (x: number, dp = 2) => Number(x.toFixed(dp));

/** An observation table: nothing to calculate, the student records what they see (the key holds it). */
export function observation(given: string[], columns: Column[], rows: Record<string, string | number>[], blanks: string[]): Readings {
  return { given, columns, rows, blanks, results: [] };
}

export function numeric(given: string[], columns: Column[], rows: Record<string, string | number>[], blanks: string[], results: ResultSpec[]): Readings {
  return { given, columns, rows, blanks, results };
}

/** Tolerance for a result: a share of the value, but never less than `floor`. */
export const tol = (value: number, share: number, floor: number) => Math.max(floor, Math.abs(value) * share);
