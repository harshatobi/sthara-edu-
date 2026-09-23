/**
 * Official curriculum model (board → session → class → subject → unit →
 * chapter → topics / learning outcomes). Each data file is transcribed from
 * the board's published document for that session, and records its source
 * URL so every chapter can be traced back to the official text.
 */

export type Board = 'CBSE';

export interface CurriculumChapter {
  /** Chapter as named in the curriculum document (matches the NCERT textbook chapter). */
  name: string;
  /** NCERT textbook chapter number, when the document gives it. */
  number?: number;
  /** Instructional hours / periods the document allots, when given. */
  hours?: number;
  /** Content points the curriculum prescribes for this chapter. */
  topics: string[];
  /** What the student should be able to do (the document's competency / explanation column). */
  outcomes: string[];
  /** Portions the document explicitly excludes or restricts. */
  notes?: string[];
  /**
   * Taught, but assessed only formatively (periodic tests, portfolio), not in
   * the year-end board paper. Carries no share of the unit's theory marks.
   */
  formativeOnly?: boolean;
}

export interface CurriculumUnit {
  /** Unit label as printed (I, II, … or 1, 2, …). */
  code: string;
  name: string;
  /** Marks this unit carries in the theory paper; null when the board hasn't published the split yet. */
  marks: number | null;
  chapters: CurriculumChapter[];
  notes?: string[];
}

export interface AssessmentComponent {
  component: string;
  marks: number;
}

export interface CurriculumSubject {
  board: Board;
  /** Academic session, e.g. "2026-27". */
  session: string;
  /** "9" … "12". */
  class: string;
  subject: string;
  /** CBSE subject code(s), e.g. ["041", "241"] for Maths Standard/Basic. */
  codes: string[];
  source: { title: string; url: string; retrievedOn: string };
  assessment: {
    /** Theory paper total; null when the document doesn't state it yet. */
    theory: number | null;
    internal: number;
    internalBreakdown: AssessmentComponent[];
  };
  /** Prescribed books as listed in the document (NCERT textbooks first). */
  textbooks: string[];
  units: CurriculumUnit[];
  /** Subject-wide notes from the document (e.g. what the year-end paper excludes). */
  notes?: string[];
}
