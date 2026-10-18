import { engineById, fittingPredictions } from '../registry';
import { validateParams } from '../types';
import { rngOf } from '../noise';
import { CLASS9 } from './class9';
import { CLASS10 } from './class10';
import type { Practical, Readings, Viva } from './types';

/** All 27 CBSE Class 9-10 Science practicals (2026-27), in the official order. */
export const PRACTICALS: Practical[] = [...CLASS9, ...CLASS10];

export const practicalById = (id: unknown): Practical | null => (typeof id === 'string' && PRACTICALS.find(p => p.id === id)) || null;

export const practicalsForClass = (cls: string | number | null | undefined): Practical[] => {
  const n = Number(/\d{1,2}/.exec(String(cls ?? ''))?.[0]);
  return PRACTICALS.filter(p => p.cls === n);
};

/**
 * A student's own readings: seeded by the student, the practical and the
 * session, so a reprint gives the same numbers and the key always matches.
 * `seed` 'class' gives the projector set shown to the whole class.
 */
export function readingsFor(p: Practical, seed: string): Readings {
  return p.readings(rngOf(`${p.id}|${seed}`));
}

/** The authored viva, then questions the engines work out from each set-up (deduplicated). */
export function vivaFor(p: Practical): Viva[] {
  const fromEngines: Viva[] = [];
  for (const s of p.setups) {
    const e = engineById(s.engine), params = e && validateParams(e, s.params);
    if (!params) continue;
    for (const q of fittingPredictions(s.engine, params)) {
      if (fromEngines.some(v => v.q === q.prompt)) continue;
      fromEngines.push({ q: q.prompt, a: `${q.options[q.correct]}. ${q.explain}`, source: 'engine' });
    }
  }
  return [...p.viva, ...fromEngines.slice(0, 6)];
}

export type { Practical, Readings, Viva, ResultSpec, Column, Cell } from './types';
export { resultOk } from './types';
