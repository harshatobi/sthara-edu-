/**
 * Competitive / entrance exam syllabi (NEET-UG, JEE Main, JEE Advanced,
 * AP & TS EAPCET, Olympiads), each unit linked to the CBSE chapters it draws
 * from. Transcribed from the conducting body's official syllabus document
 * (URL recorded per file) and checked by ../validate.ts: every link must name
 * a chapter that exists in the ingested CBSE curriculum.
 */

export interface ChapterRef {
  class: string;
  subject: string;
  /** Exact CBSE chapter name, as in the curriculum JSON. */
  chapter: string;
}

export interface ExamUnit {
  /** Unit label as printed by the exam body. */
  code: string;
  name: string;
  /** Content points exactly as the exam syllabus lists them (condensed wording). */
  topics: string[];
  /** CBSE chapters that teach this unit. Empty when the board has no matching chapter. */
  mapsTo: ChapterRef[];
  /**
   * Parts of this unit a CBSE student will NOT meet in the board theory paper
   * (not in the syllabus, formative-only, or practical-only). Only listed where
   * the board documents show the gap; absence does not prove full coverage.
   */
  beyondBoard?: string[];
  notes?: string[];
}

export interface ExamSubject {
  subject: string;
  units: ExamUnit[];
}

export type ExamTrack = 'Engineering' | 'Medical' | 'Olympiad';

export interface ExamSyllabus {
  /** Stable id, e.g. "jee-main". */
  id: string;
  exam: string;
  conductingBody: string;
  /** Exam cycle the document is for, e.g. "2026". */
  cycle: string;
  track: ExamTrack;
  /** Classes whose content the exam draws on. */
  classes: string[];
  source: { title: string; url: string; retrievedOn: string };
  subjects: ExamSubject[];
  notes?: string[];
}
