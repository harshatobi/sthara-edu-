import type { Practical, PracticalSubject } from './types';

/**
 * How practical work becomes a mark in Exams, per the CBSE 2026-27 schemes.
 *
 * Class 9-10 Science: the Subject Enrichment (Practical Work) mark out of 5,
 * typed by the teacher (SE1/SE2 sheets).
 * Class 11-12 Physics and Chemistry: the practical out of 30, scored by its
 * official components (PR1/PR2 sheets of the senior preset). The parts add up
 * to 30; if a school set the sheet to another maximum, the total is scaled to it.
 */

export interface MarkPart { key: string; label: string; max: number }

export interface MarkScheme {
  /** The Exams assessment codes this mark goes into. */
  sheet: RegExp;
  /** What the sheet is called in the hand-off panel. */
  name: string;
  total: number;
  /** null: one mark typed by the teacher. */
  parts: MarkPart[] | null;
}

const PHYSICS: MarkPart[] = [
  { key: 'expA', label: 'Experiment, section A', max: 7 },
  { key: 'expB', label: 'Experiment, section B', max: 7 },
  { key: 'record', label: 'Practical record', max: 5 },
  { key: 'activity', label: 'Activity', max: 3 },
  { key: 'project', label: 'Investigatory project', max: 3 },
  { key: 'viva', label: 'Viva', max: 5 },
];

const CHEMISTRY: MarkPart[] = [
  { key: 'volumetric', label: 'Volumetric analysis', max: 8 },
  { key: 'salt', label: 'Salt analysis', max: 8 },
  { key: 'content', label: 'Content-based experiment', max: 6 },
  { key: 'project', label: 'Project work', max: 4 },
  { key: 'recordViva', label: 'Class record and viva', max: 4 },
];

export function markSchemeFor(cls: number, subject: PracticalSubject): MarkScheme {
  if (cls >= 11 && subject === 'Physics') return { sheet: /^PR\d/, name: 'Practical', total: 30, parts: PHYSICS };
  if (cls >= 11 && subject === 'Chemistry') return { sheet: /^PR\d/, name: 'Practical', total: 30, parts: CHEMISTRY };
  return { sheet: /^SE\d/, name: 'Subject Enrichment (Practical Work)', total: 5, parts: null };
}

export type Parts = Record<string, number>;

/** null when every part is there, a number in half marks, and within its maximum. */
export function partsProblem(scheme: MarkScheme, parts: unknown): string | null {
  if (!scheme.parts) return 'This class has one mark, not parts.';
  if (!parts || typeof parts !== 'object') return 'Enter every part.';
  const src = parts as Record<string, unknown>;
  for (const k of Object.keys(src)) if (!scheme.parts.some(p => p.key === k)) return `Unknown part "${k}".`;
  for (const p of scheme.parts) {
    const v = src[p.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `Enter the ${p.label.toLowerCase()} mark.`;
    if (v < 0 || v > p.max) return `${p.label} is out of ${p.max}.`;
    if (Math.round(v * 2) !== v * 2) return `${p.label}: whole or half marks only.`;
  }
  return null;
}

export const partsTotal = (parts: Parts) => Object.values(parts).reduce((s, v) => s + v, 0);

/** The total on the sheet's own maximum, to the nearest half mark (30 on a 30-mark sheet stays 30). */
export function onSheet(total: number, schemeTotal: number, sheetMax: number): number {
  if (sheetMax === schemeTotal) return total;
  return Math.round((total * sheetMax / schemeTotal) * 2) / 2;
}

/**
 * CBSE's minimum for the practical record (Class 11-12 Physics): at least 8
 * experiments with 4 from each section, and 6 activities with 3 from each.
 * Returns what is still missing, or null when the record meets it.
 */
export function recordShortfall(practicals: Practical[], done: Set<string>): string | null {
  if (!practicals.some(p => p.section)) return null;
  // Either half of an official "OR" pair counts, but the pair counts once.
  const counted = practicals.filter(p => done.has(p.id) && !(p.orWith && done.has(p.orWith) && p.id > p.orWith));
  const count = (part: 'experiment' | 'activity', section?: 'A' | 'B') =>
    counted.filter(p => p.part === part && (!section || p.section === section)).length;
  const need: string[] = [];
  const e = count('experiment'), eA = count('experiment', 'A'), eB = count('experiment', 'B');
  const a = count('activity'), aA = count('activity', 'A'), aB = count('activity', 'B');
  if (e < 8 || eA < 4 || eB < 4) need.push(`experiments ${e}/8 (A ${eA}/4, B ${eB}/4)`);
  if (a < 6 || aA < 3 || aB < 3) need.push(`activities ${a}/6 (A ${aA}/3, B ${aB}/3)`);
  return need.length ? need.join('; ') : null;
}
