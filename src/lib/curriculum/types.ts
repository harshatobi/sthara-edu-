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
  /**
   * Codes of the units this one is an either/or alternative to (e.g. Class 12
   * Accountancy: Computerised Accounting instead of Financial Statement
   * Analysis). Excluded from the theory-total check; schools pick one track.
   */
  alternativeTo?: string[];
  /**
   * Assessed in the practical / internal component, not the theory paper
   * (e.g. Geography's practical book). Its marks count toward `internal`.
   */
  practical?: boolean;
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
  /**
   * Other names schools use for this subject in this class, e.g. "English" for
   * English Core in Class 11-12. Lookup matches these after the exact name.
   */
  aliases?: string[];
  /** Grouping for pickers. */
  stream?: 'Language' | 'Science' | 'Mathematics' | 'Commerce' | 'Humanities' | 'Computer' | 'Arts' | 'Skill' | 'Wellbeing';
  source: { title: string; url: string; retrievedOn: string };
  assessment: {
    /** Theory paper total; null when the document doesn't state it yet. */
    theory: number | null;
    internal: number;
    /**
     * Paper total when it isn't 100 (e.g. practical-heavy subjects that print
     * their own totals). Omitted means theory + internal = 100.
     */
    total?: number;
    internalBreakdown: AssessmentComponent[];
  };
  /** Prescribed books as listed in the document (NCERT textbooks first). */
  textbooks: string[];
  units: CurriculumUnit[];
  /** Subject-wide notes from the document (e.g. what the year-end paper excludes). */
  notes?: string[];
}
