/**
 * Copilot Studio, shared shapes (PR A, plan ~/.claude/plans/copilot-studio-pr-a.md). Pure.
 *
 * A StudioItem is one question as the Studio works with it: where it came from (the bank, the AI, the teacher),
 * how it's classified (CBSE competency, marks, topic), what it says, and what the checks found. It is stored in
 * `bank_items.body` (bank) and in `studio_materials.content.items` (a material), and is turned into the
 * assignment `Question` shape only when it's handed out.
 */

/** CBSE's competency categories, as its 2026-27 sample-paper designs group them. */
export const COMPETENCIES = ['remember_understand', 'apply', 'analyse_evaluate'] as const;
export type Competency = typeof COMPETENCIES[number];
export const COMPETENCY_LABEL: Record<Competency, string> = {
  remember_understand: 'Remember, understand',
  apply: 'Apply',
  analyse_evaluate: 'Analyse, evaluate',
};
/** Short form for a chip on a question. */
export const COMPETENCY_SHORT: Record<Competency, string> = { remember_understand: 'Understand', apply: 'Apply', analyse_evaluate: 'Analyse' };

export const QTYPES = ['mcq', 'assertion_reason', 'short', 'long', 'case', 'numerical', 'diagram'] as const;
export type QKind = typeof QTYPES[number];
export const QTYPE_LABEL: Record<QKind, string> = {
  mcq: 'Multiple choice', assertion_reason: 'Assertion-reason', short: 'Short answer', long: 'Long answer',
  case: 'Case study', numerical: 'Numerical', diagram: 'Diagram',
};
/** Question kinds that are answered by picking an option (marked the moment they're submitted). */
export const isChoice = (q: QKind) => q === 'mcq' || q === 'assertion_reason';

export type ItemSource = 'bank' | 'ai' | 'teacher';
export type CheckStatus = 'unchecked' | 'passed' | 'rewritten' | 'flagged';

export interface ItemCheck {
  status: CheckStatus;
  /** Plain sentences a teacher reads: what was checked, what failed and why. */
  notes: string[];
  /** The numerical answer was worked out in code and matched the key. */
  computed?: boolean;
}

/** How a bank item has done with real students (this school's results in PR A; pooled across schools in PR B). */
export interface ItemStats { attempts: number; correct: number; schools: number }

export interface StudioItem {
  /** Stable within a material (a uuid). */
  id: string;
  /** The bank row this came from or was saved as. */
  bankId: string | null;
  source: ItemSource;
  qtype: QKind;
  competency: Competency;
  marks: number;
  chapterKey: string;
  topic: string;
  outcomeCode?: string | null;
  text: string;
  /** Choice questions: the options and the index of the right one. */
  options?: string[];
  answer?: number;
  /** Numerical questions: the value and unit of the answer (the check computes it independently). */
  value?: number | null;
  unit?: string | null;
  /** Value points / model answer for written questions; the explanation for choice questions. */
  scheme: string;
  /** A figure the question relies on, with a text version for students who can't use it. */
  figure?: { svg?: string | null; alt: string } | null;
  /** Pictures from the bank (CBSE's diagrams and maps), shown with the question. */
  figures?: import('./figures').BankFigure[];
  /** Pictures that belong to the answer (labelled map, worked figure): the teacher's side only. */
  schemeFigures?: import('./figures').BankFigure[];
  /** CBSE's own text-only version, given to students who need text instead of figures. */
  textVersion?: import('./figures').TextVersion | null;
  /** Where an official question came from ("CBSE Sample Question Paper 2026-27, Class X Science, Q2"). */
  sourceRef?: string | null;
  check: ItemCheck;
  stats?: ItemStats | null;
  /** Measured share correct (0-1) when known, else the writer's estimate. */
  difficulty?: number | null;
}

export type SetKind = 'worksheet' | 'quiz' | 'catchup' | 'exit_ticket' | 'test';
export const SET_KIND_LABEL: Record<SetKind, string> = { worksheet: 'Worksheet', quiz: 'Quiz', catchup: 'Catch-up', exit_ticket: 'Exit ticket', test: 'Unit test' };

export type Audience = 'class' | 'per_student' | 'abc';

/** One student's own version of a question set. */
export interface StudentVersion { studentId: string; itemIds: string[]; reason: string; access: AccessNeed[] }

/** The content of a question-set material (studio_materials.content). */
export interface QuestionSetContent {
  type: 'questions';
  setKind: SetKind;
  topics: string[];
  blueprint: import('./blueprint').Blueprint;
  audience: Audience;
  /** Every item in the material: the class set, or the union of all versions and sets. */
  items: StudioItem[];
  /** The order of the whole-class set (audience 'class'). */
  order: string[];
  versions: StudentVersion[];
  sets: { label: string; itemIds: string[] }[];
  handout: 'online' | 'paper' | 'both';
  /** Built from (shown to the teacher): the evidence the set was set up from. */
  basis: string;
}

export const ACCESS_NEEDS = ['large_print', 'read_aloud', 'extra_time', 'no_figures', 'simplified_language'] as const;
export type AccessNeed = typeof ACCESS_NEEDS[number];
export const ACCESS_LABEL: Record<AccessNeed, string> = {
  large_print: 'Large print', read_aloud: 'Read aloud', extra_time: 'Extra time', no_figures: 'Text instead of figures',
  simplified_language: 'Simpler wording',
};

export const newItemId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
