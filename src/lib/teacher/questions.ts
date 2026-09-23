/**
 * The question model assignments and quizzes are stored with
 * (assignments.questions), shared by the teacher composer, the server routes
 * that save and grade, and the student workspace that renders them.
 * Pure — no I/O — so the browser and the server validate identically.
 */

export type QType = 'short' | 'mcq' | 'upload';
export type Level = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
  type: QType;
  /** Rendered by the student workspace (it also accepts `question` / `prompt`). */
  questionText: string;
  /** MCQ only: four options. */
  options?: string[];
  /** MCQ only: index of the correct option. */
  answer?: number;
  marks: number;
  /** Quiz only: difficulty tag and the explanation shown after grading. */
  level?: Level;
  why?: string;
}

export const MAX_QUESTIONS = 50;
const MAX_TEXT = 2000;

const clip = (v: unknown, n = MAX_TEXT) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Marks a question is worth (MCQ and unmarked questions default to 1). */
export const marksOf = (q: Pick<Question, 'marks'> | null | undefined) => {
  const m = Number(q?.marks);
  return Number.isFinite(m) && m > 0 ? m : 1;
};

export const totalMarks = (qs: Question[]) => qs.reduce((n, q) => n + marksOf(q), 0);

/** Blank question of a type, as the composer's "+ Short answer / + Multiple choice / + Upload" add it. */
export function blankQuestion(type: QType): Question {
  return type === 'mcq'
    ? { type, questionText: '', options: ['', '', '', ''], answer: 0, marks: 1 }
    : { type, questionText: '', marks: type === 'upload' ? 5 : 2 };
}

/**
 * Normalises questions from any source (the composer, an AI generator, an
 * old row) and reports the first problem a teacher must fix before posting.
 */
export function sanitizeQuestions(raw: unknown): { questions: Question[]; error: string | null } {
  if (!Array.isArray(raw)) return { questions: [], error: 'Questions are missing.' };
  if (raw.length > MAX_QUESTIONS) return { questions: [], error: `At most ${MAX_QUESTIONS} questions.` };
  const questions: Question[] = [];
  for (const [i, r] of raw.entries()) {
    const q = (r ?? {}) as Record<string, unknown>;
    const type: QType = q.type === 'mcq' || q.type === 'upload' ? q.type : Array.isArray(q.options) && q.options.length ? 'mcq' : 'short';
    const text = clip(q.questionText ?? q.question ?? q.prompt);
    if (!text) return { questions: [], error: `Question ${i + 1} has no text.` };
    const marks = Math.min(100, marksOf({ marks: q.marks as number }));
    const out: Question = { type, questionText: text, marks: type === 'mcq' ? 1 : marks };
    if (type === 'mcq') {
      const options = (Array.isArray(q.options) ? q.options : []).slice(0, 6).map(o => clip(o, 500));
      if (options.length < 2 || options.some(o => !o)) return { questions: [], error: `Question ${i + 1}: fill in every option.` };
      const answer = Number(q.answer ?? q.correctAnswerIndex);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return { questions: [], error: `Question ${i + 1}: mark the correct option.` };
      out.options = options;
      out.answer = answer;
    }
    const level = String(q.level ?? q.difficulty ?? '').toUpperCase();
    if (level === 'EASY' || level === 'MEDIUM' || level === 'HARD') out.level = level;
    const why = clip(q.why ?? q.explanation, 1000);
    if (why) out.why = why;
    questions.push(out);
  }
  return { questions, error: null };
}

/**
 * Maps an AI generator's output (quiz-gen: correctAnswerIndex; homework-gen:
 * "A. …" options + correctOption letter, "long" type) onto the question model.
 * Items that can't be made valid are dropped rather than posted broken.
 */
export function fromGenerated(raw: unknown): Question[] {
  const list = Array.isArray((raw as any)?.questions) ? (raw as any).questions : Array.isArray(raw) ? raw : [];
  const out: Question[] = [];
  for (const g of list.slice(0, MAX_QUESTIONS)) {
    const text = clip(g?.questionText ?? g?.question ?? g?.prompt);
    if (!text) continue;
    const opts: string[] = Array.isArray(g?.options) ? g.options.map((o: unknown) => clip(o, 500).replace(/^[A-D][.)]\s*/i, '')) : [];
    if (opts.length >= 2) {
      let answer = Number(g?.correctAnswerIndex);
      if (!Number.isInteger(answer) && typeof g?.correctOption === 'string') answer = 'ABCDEF'.indexOf(g.correctOption.trim().charAt(0).toUpperCase());
      if (!Number.isInteger(answer) && Number.isInteger(g?.answer)) answer = g.answer;
      if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length || opts.some(o => !o)) continue;
      const level = String(g?.level ?? g?.difficulty ?? '').toUpperCase();
      out.push({
        type: 'mcq', questionText: text, options: opts.slice(0, 6), answer, marks: 1,
        ...(level === 'EASY' || level === 'MEDIUM' || level === 'HARD' ? { level } : {}),
        ...(clip(g?.explanation ?? g?.why, 1000) ? { why: clip(g?.explanation ?? g?.why, 1000) } : {}),
      });
    } else {
      out.push({ type: 'short', questionText: text, marks: Math.min(20, marksOf({ marks: g?.marks })) });
    }
  }
  return out;
}

/** Is a student's stored answer to an MCQ the keyed option? */
export const mcqCorrect = (q: Question, answer: unknown) =>
  q.type === 'mcq' && answer !== undefined && answer !== null && answer !== '' && String(answer) === String(q.answer);

/**
 * Starting marks for a review: MCQs scored against the key, written answers
 * left for the teacher (null).
 */
export function suggestedScores(questions: Question[], answers: Record<string, unknown> | null | undefined): (number | null)[] {
  return questions.map((q, i) => (q.type === 'mcq' ? (mcqCorrect(q, answers?.[i]) ? marksOf(q) : 0) : null));
}

export const TYPE_LABEL: Record<QType, string> = { short: 'SHORT ANSWER', mcq: 'MULTIPLE CHOICE', upload: 'UPLOAD' };

/** "2 MCQ · 1 written" — the mockup's qTypeSummary(). */
export function typeSummary(qs: Question[]): string {
  const n = { mcq: 0, short: 0, upload: 0 } as Record<QType, number>;
  for (const q of qs) n[q.type]++;
  return [n.mcq && `${n.mcq} MCQ`, n.short && `${n.short} written`, n.upload && `${n.upload} upload`].filter(Boolean).join(' · ') || 'no questions';
}
