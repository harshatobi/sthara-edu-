import { engineById, fittingPredictions } from '../registry';
import { validateParams } from '../types';
import { rngOf } from '../noise';
import { CLASS9 } from './class9';
import { CLASS10 } from './class10';
import { PHYSICS11 } from './physics11';
import { PHYSICS12 } from './physics12';
import type { Practical, PracticalSubject, Readings, Viva } from './types';

/** The CBSE 2026-27 practicals, in the official order: Class 9-10 Science (27), Class 11-12 Physics (62). */
export const PRACTICALS: Practical[] = [...CLASS9, ...CLASS10, ...PHYSICS11, ...PHYSICS12];

export const practicalById = (id: unknown): Practical | null => (typeof id === 'string' && PRACTICALS.find(p => p.id === id)) || null;

/** The practicals' subject for a class's subject name ("Physics", "Science", "Chemistry (043)"), or null. */
export function practicalSubject(subject: string | null | undefined): PracticalSubject | null {
  const s = String(subject ?? '');
  return /physics/i.test(s) ? 'Physics' : /chemistry/i.test(s) ? 'Chemistry' : /science/i.test(s) ? 'Science' : null;
}

const gradeOf = (cls: string | number | null | undefined) => Number(/\d{1,2}/.exec(String(cls ?? ''))?.[0]);

/** A class's practicals for the subject it is taught ("Class 11-A", "Physics"). */
export function practicalsFor(cls: string | number | null | undefined, subject: string | null | undefined): Practical[] {
  const n = gradeOf(cls), sub = practicalSubject(subject);
  return sub ? PRACTICALS.filter(p => p.cls === n && p.subject === sub) : [];
}

/** Does this practical belong to that class and subject? (The server checks every save with it.) */
export const practicalFits = (p: Practical, cls: string, subject: string) => p.cls === gradeOf(cls) && p.subject === practicalSubject(subject);

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

export type { Practical, PracticalSubject, Readings, Viva, ResultSpec, Column, Cell } from './types';
export { resultOk, refOf } from './types';
