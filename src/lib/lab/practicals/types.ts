import type { Params } from '../types';
import type { Rng } from '../noise';

/**
 * A CBSE practical (2026-27 lists: Class 9-10 Science, Class 11-12 Physics). The official wording is
 * kept word for word; everything a class sees or records comes from a Live Lab
 * engine set-up, and readings come from the engine with realistic error.
 */

/** A simulation set-up this practical is shown with (validated against its engine in tests). */
export interface PracticalSetup { engine: string; params: Params; label: string }

export interface Column { key: string; label: string; unit?: string }
export type Cell = number | string;

/**
 * What a student records. Numeric practicals have a `result` the student
 * works out from their own readings; observation practicals have an
 * `expected` answer per row (what they should see or identify).
 */
export interface Readings {
  /** One line on the conditions this student's set got (e.g. "Resistor R = 5 Ω"). */
  given: string[];
  columns: Column[];
  rows: Record<string, Cell>[];
  /** Columns the student fills in themselves; the key holds the answers. */
  blanks: string[];
  /** What the student works out from their own readings (none for observation practicals). */
  results: ResultSpec[];
}

export interface ResultSpec {
  label: string;
  unit: string;
  /** What the student's own readings give, worked from them (not the textbook value). */
  value: number;
  /** How far off still counts as right (in the result's unit). */
  tolerance: number;
  /** The working, from this student's readings. */
  working: string;
  /** The accepted value, for the conclusion ("close to the 10 cm marked on the lens"). */
  accepted?: string;
}

export interface Viva {
  q: string;
  a: string;
  /** engine: the answer is worked by a Live Lab engine; authored: written by Sthara from the NCERT lab manual. */
  source: 'engine' | 'authored';
}

export type PracticalSubject = 'Science' | 'Physics' | 'Chemistry';

export interface Practical {
  /**
   * In the official list's order: c9-01 … c10-14 (Science); p11-ae01 … p12-ba07 (Physics: section a/b,
   * e = experiment, a = activity, then the official number).
   */
  id: string;
  cls: 9 | 10 | 11 | 12;
  subject: PracticalSubject;
  /** The official number (within its section and part, where the list has them). */
  no: number;
  /** Class 11-12 Physics lists experiments and activities separately, in sections A and B. */
  part?: 'experiment' | 'activity';
  section?: 'A' | 'B';
  /** The other half of an official "OR" pair (either one counts). */
  orWith?: string;
  /** The official list item, word for word. */
  official: string;
  /** Short name for lists and cards. */
  title: string;
  chapter: string;
  topic: string;
  kind: 'numeric' | 'observation';
  aim: string;
  apparatus: string[];
  procedure: string[];
  precautions: string[];
  setups: PracticalSetup[];
  /** A student's own set of readings (seeded), and the teacher's key. */
  readings: (rng: Rng) => Readings;
  viva: Viva[];
  /** Photo ids from photos.ts shown beside the diagram (real specimens and apparatus). */
  photos?: string[];
  /** The conclusion students write, with blanks filled from their result. */
  conclusion: string;
}

/** How a practical is referred to in lists and the tracker: "7", "A-7", "A activity 3". */
export function refOf(p: Pick<Practical, 'no' | 'part' | 'section'>): string {
  if (!p.section) return String(p.no);
  return p.part === 'activity' ? `${p.section} activity ${p.no}` : `${p.section}-${p.no}`;
}

/** Is a student's result close enough to what their own readings give? */
export const resultOk = (spec: ResultSpec, value: number) => Number.isFinite(value) && Math.abs(value - spec.value) <= spec.tolerance + 1e-9;
