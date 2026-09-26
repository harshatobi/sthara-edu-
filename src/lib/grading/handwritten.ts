/**
 * Captured (handwritten) work grading: the prompt the model reads a notebook
 * with, and the strict parser for what it sends back. Pure, so the server, the
 * teacher review panel and the tests agree on one shape.
 *
 * The AI only SUGGESTS. Marks count (TML, parents, the student's grade) once a
 * teacher confirms them in the review panel.
 */
import { marksOf, type Question } from '@/lib/teacher/questions';

export type Confidence = 'high' | 'medium' | 'low';

export interface GradedQuestion {
  /** 0-based, matches assignments.questions and submission_items.question_index. */
  index: number;
  max: number;
  /** Suggested mark: 0..max in half marks. */
  awarded: number;
  attempted: boolean;
  /** What the student wrote, as read from the page. */
  transcription: string;
  /** Page (1-based) the answer was found on; null if not found. */
  page: number | null;
  confidence: Confidence;
  /** Why this mark: the marking points met and missed. */
  reasoning: string;
  gotRight: string;
  toFix: string;
}

export interface HandwrittenGrade {
  version: 2;
  questions: GradedQuestion[];
  suggestedTotal: number;
  max: number;
  /** How readable the pages were overall. */
  legibility: Confidence;
  summary: string;
  /** Written to the student; shown only after the teacher confirms. */
  feedback: string;
  /** Things the teacher should know: a page missing, another student's name, work not matching the questions. */
  flags: string[];
  /** The name written on the pages, as read (compared with the student server-side; the model is never told who it is). */
  nameOnPage: string;
  pages: number;
  model: string;
  gradedAt: string;
  source: 'student' | 'teacher_capture';
  capturedBy: string | null;
  /** Written when the teacher confirms: how many AI marks they kept. */
  review?: { kept: number; changed: number; by: string; at: string; suggested: number; confirmed: number };
  /** Reversals: grades reopened for review, with the marks that were withdrawn. */
  history?: HistoryEntry[];
}

export interface HistoryEntry {
  action: 'reopened';
  by: string; byName?: string; at: string; reason: string;
  previous: { score: number | null; max: number | null; note: string | null; marks: number[] };
}

const s = (v: unknown, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const half = (n: number) => Math.round(n * 2) / 2;
const conf = (v: unknown): Confidence => (v === 'high' || v === 'medium' || v === 'low' ? v : 'low');

export function gradingPrompt(opts: { title: string; subject: string; cls: string; questions: Question[]; pages: number; totalMarks: number | null }) {
  const qs = opts.questions.length
    ? opts.questions.map((q, i) => {
      const lines = [`Q${i + 1} (${marksOf(q)} mark${marksOf(q) === 1 ? '' : 's'}): ${q.questionText}`];
      if (q.type === 'mcq' && q.options?.length) lines.push(`   Options: ${q.options.map((o, j) => `${'ABCDEF'[j]}. ${o}`).join('  ')}${q.answer !== undefined ? `  | Key: ${'ABCDEF'[q.answer]}` : ''}`);
      if (q.why) lines.push(`   Marking points / model answer: ${q.why}`);
      return lines.join('\n');
    }).join('\n')
    : `No questions were typed in. Treat the whole page as one answer worth ${opts.totalMarks ?? 10} marks.`;
  return `You are an experienced CBSE ${opts.subject} examiner marking a ${opts.cls} student's handwritten notebook for the assignment "${opts.title}".
The work is photographed on ${opts.pages} page${opts.pages === 1 ? '' : 's'}, attached in order. Photos may be tilted, shadowed or cropped.

QUESTIONS
${qs}

HOW TO MARK
- Find each question's answer on the pages (students may number loosely, skip, or answer out of order). Record the page it is on.
- Transcribe what the student actually wrote for it, faithfully, including mistakes. Use [illegible] for words you cannot read. Never "improve" the student's work.
- Mark like a fair CBSE examiner: step marks for correct method even when the final answer is wrong; follow-through for a correct method on an earlier slip; no marks for a bare correct answer where working is clearly required and the question asks for it. Use whole or half marks only, never above the question's maximum.
- Not attempted = 0 with "attempted": false.
- confidence: "high" when the handwriting is clear and the mark is clear-cut; "medium" when you had to interpret a word or the marking is a judgement call; "low" when the answer is hard to read, partly cut off, or you are unsure it is this question's answer. Be honest: the teacher checks every "low" first.
- reasoning: one or two sentences naming the marking points met and missed. gotRight / toFix: short, specific, addressed to the student.
- nameOnPage: the student's name as written on the pages, exactly as you read it; "" if there is none.
- flags: anything the teacher must know (a page seems missing, two different names on the pages, the work doesn't match these questions, answers look copied from a key). Empty if none.
- Do not invent answers for pages you cannot see.

Reply with ONE JSON object only:
{"questions":[{"q":1,"attempted":true,"page":1,"transcription":"…","awarded":2,"confidence":"high","reasoning":"…","gotRight":"…","toFix":"…"}],"legibility":"high|medium|low","nameOnPage":"","summary":"two sentences for the teacher","feedback":"three sentences for the student: what went well, the one thing to fix, how","flags":[]}`;
}

/**
 * Model JSON -> a HandwrittenGrade the rest of the app can trust: one entry per
 * question (missing ones become "not found, low confidence"), marks clamped to
 * 0..max in half marks.
 */
export function parseGrade(raw: unknown, questions: Question[], meta: { pages: number; model: string; source: HandwrittenGrade['source']; capturedBy: string | null; totalMarks?: number | null; now?: Date }): HandwrittenGrade {
  const r = (raw ?? {}) as any;
  const got = Array.isArray(r.questions) ? r.questions : [];
  const slots = questions.length ? questions.map(q => marksOf(q)) : [Number(meta.totalMarks) > 0 ? Number(meta.totalMarks) : 10];
  const out: GradedQuestion[] = slots.map((max, i) => {
    const g = got.find((x: any) => Number(x?.q) === i + 1) ?? (questions.length ? undefined : got[0]);
    if (!g) {
      return { index: i, max, awarded: 0, attempted: false, transcription: '', page: null, confidence: 'low', reasoning: 'The AI could not find this answer on the pages. Check the photos.', gotRight: '', toFix: '' };
    }
    const attempted = g.attempted !== false;
    const n = Number(g.awarded);
    const awarded = attempted && Number.isFinite(n) ? Math.min(max, Math.max(0, half(n))) : 0;
    const page = Number.isInteger(Number(g.page)) && Number(g.page) >= 1 && Number(g.page) <= meta.pages ? Number(g.page) : null;
    return {
      index: i, max, awarded, attempted, transcription: s(g.transcription, 3000), page,
      confidence: conf(g.confidence), reasoning: s(g.reasoning, 800), gotRight: s(g.gotRight, 600), toFix: s(g.toFix, 800),
    };
  });
  return {
    version: 2,
    questions: out,
    suggestedTotal: half(out.reduce((n, q) => n + q.awarded, 0)),
    max: slots.reduce((n, m) => n + m, 0),
    legibility: conf(r.legibility),
    summary: s(r.summary, 1200),
    feedback: s(r.feedback, 1500),
    flags: (Array.isArray(r.flags) ? r.flags : []).map((f: unknown) => s(f, 300)).filter(Boolean).slice(0, 6),
    nameOnPage: s(r.nameOnPage, 120),
    pages: meta.pages,
    model: meta.model,
    gradedAt: (meta.now ?? new Date()).toISOString(),
    source: meta.source,
    capturedBy: meta.capturedBy,
  };
}

/** The v2 grade in a submission's ai_result, or null (legacy shapes are shown as text only). */
export function gradeOf(aiResult: unknown): HandwrittenGrade | null {
  const r = aiResult as any;
  return r && r.version === 2 && Array.isArray(r.questions) ? (r as HandwrittenGrade) : null;
}

/** How many of the AI's per-question marks the teacher kept (for the agreement rate). */
export function agreement(grade: HandwrittenGrade, confirmed: (number | null)[]): { kept: number; changed: number } {
  let kept = 0, changed = 0;
  grade.questions.forEach((q, i) => {
    const t = confirmed[i];
    if (t === null || t === undefined) return;
    if (Math.abs(Number(t) - q.awarded) < 0.01) kept++; else changed++;
  });
  return { kept, changed };
}

// ── Stored page references ─────────────────────────────────────────────────
/** Pages live in the private "captures" bucket; submissions.image_urls holds "captures:<path>". */
export const CAPTURE_PREFIX = 'captures:';
export const isCapturePath = (u: string) => u.startsWith(CAPTURE_PREFIX);
export const capturePath = (schoolId: string, assignmentId: string, studentId: string, n: number, stamp = Date.now()) =>
  `${schoolId}/${assignmentId}/${studentId}/${stamp}-${n}.jpg`;
/** A page path belongs to this school, assignment and student. */
export const pathBelongs = (path: string, schoolId: string, assignmentId: string, studentId: string) =>
  new RegExp(`^${schoolId}/${assignmentId}/${studentId}/\\d{10,14}-\\d{1,2}\\.jpg$`).test(path);

/** Does the name written on the page plausibly belong to this student? (Any shared name part of 3+ letters.) */
export function nameMatches(onPage: string, student: string): boolean {
  const parts = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
  const a = parts(onPage), b = new Set(parts(student));
  return !a.length || a.some(w => b.has(w));
}
