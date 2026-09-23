/**
 * View model for the student "Honest Desk" — the shape every canon student
 * page renders from, whether the rows came from Supabase (live) or from the
 * dev-only demo dataset (src/lib/demo/student.ts). Keeping one shape means the
 * pages never branch on where data came from.
 */

export type QuestionType = 'short' | 'mcq' | 'upload';
export type EvidenceKind = 'Homework' | 'Quiz' | 'Classwork' | 'Tutor';
/** tml_scores.confidence_band — mockup GATE: firm=Confirmed, provisional=Still building, insufficient=Not enough yet. */
export type Gate = 'firm' | 'provisional' | 'insufficient';

export interface AiQuestionFeedback {
  questionNumber?: number;
  questionText?: string;
  awardedScore?: number;
  maxScore?: number;
  isFinalAnswerCorrect?: boolean;
  whatStudentGotRight?: string;
  lostMarksReason?: string;
  howToFix?: string;
}

export interface DeskSubmission {
  submittedAt: string | null;
  score: number | null;
  total: number | null;
  /** Free-text feedback (teacher or AI summary). */
  feedback: string | null;
  /** Per-question AI breakdown, when the grader produced one. */
  aiQuestions: AiQuestionFeedback[];
  teacherApproved: boolean | null;
}

export interface DeskAssignment {
  id: string;
  /** Upper-case, as the mockup's chips render it (MATHEMATICS). */
  subject: string;
  title: string;
  desc: string;
  dueAt: string | null;
  color: string;
  proctored: boolean;
  kind: Exclude<EvidenceKind, 'Tutor'>;
  /** Topic key — same rule the TML engine uses to bucket evidence (first unit, else title). */
  topic: string;
  questionTypes: QuestionType[];
  status: 'open' | 'submitted' | 'graded';
  submission: DeskSubmission | null;
}

export interface EvidenceItem {
  title: string;
  kind: EvidenceKind;
  /** 0–100, or null when not graded yet. */
  pct: number | null;
  /** What the row shows: "13/15", "Awaiting review", "Not started", "Unaided". */
  label: string;
  at: string | null;
}

export interface ComponentScores {
  homework: number | null;
  quiz: number | null;
  tutor: number | null;
}

export interface TopicMastery {
  name: string;
  score: number | null;
  gate: Gate;
  components: ComponentScores;
  items: EvidenceItem[];
}

export interface SubjectMastery {
  /** Display name (Mathematics). */
  subject: string;
  tml: number | null;
  note: string;
  components: ComponentScores;
  topics: TopicMastery[];
  weakest: TopicMastery | null;
  computedAt: string | null;
}

export interface StudentDesk {
  mode: 'live' | 'demo';
  me: { name: string; id: string; cls: string; school: string };
  assignments: DeskAssignment[];
  subjects: SubjectMastery[];
  overallTml: number | null;
}
