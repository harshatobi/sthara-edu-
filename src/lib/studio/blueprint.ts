/**
 * The blueprint of a question set: how many questions of each CBSE competency at each mark value. Pure.
 * The teacher sees it as a grid (competency rows x mark columns) and taps cells to change counts.
 */
import { COMPETENCIES, type Competency, type QKind, type SetKind } from './types';

export const MARK_COLUMNS = [1, 2, 3, 5] as const;
export type MarkValue = typeof MARK_COLUMNS[number];

/** cells[competency][marks] = number of questions. */
export interface Blueprint { cells: Record<Competency, Record<MarkValue, number>> }

export interface Slot { competency: Competency; marks: MarkValue; qtype: QKind }

export const MAX_ITEMS = 30;
const MAX_CELL = 10;

const empty = (): Blueprint['cells'] =>
  Object.fromEntries(COMPETENCIES.map(c => [c, Object.fromEntries(MARK_COLUMNS.map(m => [m, 0]))])) as Blueprint['cells'];

export function makeBlueprint(rows: Partial<Record<Competency, Partial<Record<MarkValue, number>>>>): Blueprint {
  const cells = empty();
  for (const c of COMPETENCIES) for (const m of MARK_COLUMNS) cells[c][m] = clampCell(rows[c]?.[m] ?? 0);
  return { cells };
}

const clampCell = (n: unknown) => Math.max(0, Math.min(MAX_CELL, Math.round(Number(n) || 0)));

/** Accepts a blueprint from a request or a stored row; anything malformed becomes 0. Null if the result is empty or too big. */
export function parseBlueprint(raw: unknown): Blueprint | null {
  const r = (raw && typeof raw === 'object' ? (raw as any).cells ?? raw : null) as any;
  if (!r || typeof r !== 'object') return null;
  const bp = makeBlueprint(Object.fromEntries(COMPETENCIES.map(c => [c, Object.fromEntries(MARK_COLUMNS.map(m => [m, r?.[c]?.[m] ?? r?.[c]?.[String(m)]]))])));
  const n = itemCount(bp);
  return n > 0 && n <= MAX_ITEMS ? bp : null;
}

export const itemCount = (bp: Blueprint) => COMPETENCIES.reduce((n, c) => n + MARK_COLUMNS.reduce((k, m) => k + bp.cells[c][m], 0), 0);
export const markTotal = (bp: Blueprint) => COMPETENCIES.reduce((n, c) => n + MARK_COLUMNS.reduce((k, m) => k + bp.cells[c][m] * m, 0), 0);
export const rowMarks = (bp: Blueprint, c: Competency) => MARK_COLUMNS.reduce((k, m) => k + bp.cells[c][m] * m, 0);
export const columnCount = (bp: Blueprint, m: MarkValue) => COMPETENCIES.reduce((k, c) => k + bp.cells[c][m], 0);

/** Rough working time: a minute a mark, never under 5 minutes. */
export const minutesFor = (bp: Blueprint) => Math.max(5, Math.round(markTotal(bp) * 1.3));

/** The question kind each slot is written as: 1-markers are choice questions, the rest by competency and size. */
export function qtypeFor(c: Competency, m: MarkValue, opts: { numeric?: boolean; quiz?: boolean } = {}): QKind {
  if (opts.quiz || m === 1) return c === 'analyse_evaluate' && !opts.quiz ? 'assertion_reason' : 'mcq';
  if (m === 5) return c === 'analyse_evaluate' ? 'case' : 'long';
  if (opts.numeric && c === 'apply') return 'numerical';
  return 'short';
}

/** One slot per question, in paper order: by marks, then competency (easier thinking first). */
export function slotsOf(bp: Blueprint, opts: { numeric?: boolean; quiz?: boolean } = {}): Slot[] {
  const out: Slot[] = [];
  for (const m of MARK_COLUMNS) for (const c of COMPETENCIES) for (let i = 0; i < bp.cells[c][m]; i++) out.push({ competency: c, marks: m, qtype: qtypeFor(c, m, opts) });
  return out;
}

/** A sensible starting grid for each kind of set (the teacher changes it). Quizzes are all 1-mark choice questions. */
export function defaultBlueprint(kind: SetKind): Blueprint {
  switch (kind) {
    case 'quiz': return makeBlueprint({ remember_understand: { 1: 3 }, apply: { 1: 3 }, analyse_evaluate: { 1: 2 } });
    case 'exit_ticket': return makeBlueprint({ remember_understand: { 1: 1 }, apply: { 1: 1 }, analyse_evaluate: { 1: 1 } });
    case 'catchup': return makeBlueprint({ remember_understand: { 1: 3, 2: 1 }, apply: { 1: 2, 2: 2, 3: 1 }, analyse_evaluate: { 2: 1, 3: 1 } });
    case 'test': return makeBlueprint({ remember_understand: { 1: 4, 2: 2 }, apply: { 1: 3, 2: 2, 3: 2 }, analyse_evaluate: { 1: 1, 3: 1, 5: 1 } });
    default: return makeBlueprint({ remember_understand: { 1: 2, 2: 2 }, apply: { 1: 2, 2: 2, 3: 1 }, analyse_evaluate: { 2: 1, 3: 1 } });
  }
}

/** Subjects whose apply-level questions are usually worked numericals. */
export const isNumericSubject = (subject: string) => /math|physics|science|chemistry|accountancy|economics/i.test(subject);
