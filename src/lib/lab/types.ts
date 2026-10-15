/**
 * Live Lab: every number a class sees comes from a tested calculation here.
 * The Copilot only picks an engine, sets values inside each engine's ranges and
 * words the prediction questions; the engine works out the answers.
 */

export type ParamSpec =
  | { kind: 'number'; key: string; label: string; unit: string; min: number; max: number; step: number; default: number }
  | { kind: 'choice'; key: string; label: string; options: { value: string; label: string }[]; default: string };

export type Params = Record<string, number | string>;

/** A predict-then-reveal question. Options and the right answer always come from the engine. */
export interface Prediction {
  id: string;
  prompt: string;
  options: string[];
  correct: number;
  /** One line shown on reveal: the working, from the engine's own numbers. */
  explain: string;
}

export interface PredictionTemplate<P> {
  id: string;
  /** Short name the Copilot and the presenter's picker see. */
  label: string;
  /** Not every question fits every setup (no image when the object sits at the focus). */
  applies?: (p: P) => boolean;
  build: (p: P) => Omit<Prediction, 'id'>;
}

export interface Readout { label: string; value: string }

export interface LabEngine<P extends Params = Params> {
  id: string;
  title: string;
  blurb: string;
  subject: 'Science';
  classes: number[];
  /** Official chapter names (matched with topicKey). */
  chapters: string[];
  params: ParamSpec[];
  /** Cross-value rules beyond each value's range; null when the setup is fine. */
  check?: (p: P) => string | null;
  readouts: (p: P) => Readout[];
  predictions: PredictionTemplate<P>[];
}

export const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Trims trailing zeros: 30, 2.5, 0.25. */
export const fmt = (n: number, dp = 2) => String(round(n, dp));

export function defaults(engine: LabEngine<any>): Params {
  return Object.fromEntries(engine.params.map(s => [s.key, s.default]));
}

/**
 * Strict: values from the Copilot or the network are accepted only when every
 * one is present (or defaultable), the right type, inside its range and on a
 * known option. Out of range is rejected, never clamped, so a bad setup is
 * never shown as if it were the one asked for.
 */
export function validateParams<P extends Params>(engine: LabEngine<P>, raw: unknown): P | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: Params = {};
  for (const s of engine.params) {
    const v = src[s.key] ?? s.default;
    if (s.kind === 'number') {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < s.min || n > s.max) return null;
      out[s.key] = n;
    } else {
      if (typeof v !== 'string' || !s.options.some(o => o.value === v)) return null;
      out[s.key] = v;
    }
  }
  const p = out as P;
  return engine.check?.(p) ? null : p;
}

/** Puts the right answer among distractors, deduplicated, in a stable shuffled order. */
export function choices(correct: string, distractors: string[], seed = 0): { options: string[]; correct: number } {
  const all = [correct, ...distractors.filter((d, i, a) => d !== correct && a.indexOf(d) === i)].slice(0, 4);
  const key = (s: string) => { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const order = all.map((_, i) => i).sort((a, b) => key(all[a]) - key(all[b]) || a - b);
  return { options: order.map(i => all[i]), correct: order.indexOf(0) };
}
