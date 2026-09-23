/**
 * Teacher desk view model + pure shaping from Supabase rows. No I/O here —
 * the provider (useTeacherDesk) fetches, this turns rows into what the
 * canon teacher pages render.
 */
import { sanitizeQuestions, suggestedScores, type Question } from './questions';
import { normClass, normSubject, scopeClasses, subjectsIn, type ScopeEntry } from './scope';

export type WorkType = 'homework' | 'quiz' | 'classwork';

export interface TStudent {
  id: string;
  name: string;
  rollNo: string;
  cls: string;
  /** Latest TML per subject key (lower-case), mean of that subject's topic snapshots. */
  tml: Record<string, number | null>;
  /** Latest snapshot per topic (the chapter), by subject key then topic key (see topicKey). */
  topics: Record<string, Record<string, TopicScore>>;
}

/** One tml_scores snapshot: a student's mastery of one topic (chapter) in one subject. */
export interface TopicScore {
  name: string;
  score: number;
  /** firm / provisional / insufficient (tml_scores.confidence_band). */
  band: string | null;
  homework: number | null;
  quiz: number | null;
  tutor: number | null;
  items: number;
  at: string | null;
}

/** Topic names match loosely ("Ch 4 · Quadratic Equations" / "quadratic equations"). */
export const topicKey = (s: string | null | undefined) =>
  (s || '').toLowerCase().replace(/^ch(apter)?\s*\d+\s*[·:.-]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface TSubmission {
  id: string;
  studentId: string;
  studentName: string;
  submittedAt: string | null;
  /** pending = waiting for the teacher; graded = teacher-confirmed (or instant MCQ). */
  state: 'pending' | 'graded';
  score: number | null;
  max: number | null;
  /** What the AI (handwritten) or the answer key (MCQ) suggested before review. */
  suggested: number | null;
  /** Per-question starting marks for typed work (MCQ from the key, written = null). */
  suggestedByQuestion: (number | null)[];
  /** Per-question marks the teacher confirmed, when graded per question. */
  confirmedByQuestion: (number | null)[] | null;
  answers: Record<string, unknown>;
  imageUrls: string[];
  aiFeedback: string | null;
  aiQuestions: { questionNumber?: number; awardedScore?: number; maxScore?: number; lostMarksReason?: string; whatStudentGotRight?: string }[];
  note: string | null;
  kind: 'typed' | 'handwritten';
}

export interface TAssignment {
  id: string;
  title: string;
  type: WorkType;
  cls: string;
  subject: string;
  chapter: string | null;
  description: string;
  dueAt: string | null;
  status: 'draft' | 'published';
  mode: 'typed' | 'handwritten';
  proctored: boolean;
  questions: Question[];
  totalMarks: number | null;
  createdAt: string | null;
  /** Students this is set for (class roster, or the explicit target list). */
  roster: TStudent[];
  submissions: TSubmission[];
  pendingCount: number;
}

export interface TClass {
  cls: string;
  subjects: string[];
  students: TStudent[];
  /** Mean of the class's student TMLs in this teacher's subject(s); null with no evidence yet. */
  tml: number | null;
  evidenced: number;
  belowForty: TStudent[];
  pendingReview: number;
  proctorFlags: number;
}

export interface ProctorFlag {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string | null;
  assignmentTitle: string;
  switches: number;
  at: string;
  cls: string;
}

export interface TeacherDesk {
  mode: 'live' | 'demo';
  me: { id: string; name: string; subject: string };
  scope: ScopeEntry[];
  classes: TClass[];
  assignments: TAssignment[];
  flags: ProctorFlag[];
}

export interface DeskRows {
  students: any[];
  assignments: any[];
  submissions: any[];
  tml: any[];
  alerts: any[];
  /** Confirmed per-question marks (submission_items). */
  items: any[];
}

const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);

const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** Latest snapshot per student, subject and topic. */
function topicIndex(rows: any[]): Map<string, Record<string, Record<string, TopicScore>>> {
  const out = new Map<string, Record<string, Record<string, TopicScore>>>();
  for (const r of rows) {
    const n = Number(r.score);
    if (!Number.isFinite(n)) continue;
    const bySubject = out.get(r.student_id) ?? {};
    out.set(r.student_id, bySubject);
    const subj = (bySubject[normSubject(r.subject)] ??= {});
    const k = topicKey(r.topic_name);
    const prev = subj[k];
    if (prev && ts(prev.at) >= ts(r.computed_at)) continue;
    const c = r.components || {};
    subj[k] = {
      name: r.topic_name, score: Math.round(n), band: r.confidence_band ?? null,
      homework: num(c.homework?.score), quiz: num(c.quiz?.score), tutor: num(c.tutor?.score),
      items: Number(r.item_count) || 0, at: r.computed_at ?? null,
    };
  }
  return out;
}

/** Per-student, per-subject TML: latest snapshot per topic, then the mean over topics (as the student desk computes it). */
function tmlIndex(rows: any[]): Map<string, Record<string, number | null>> {
  const latest = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.student_id}::${normSubject(r.subject)}::${r.topic_name}`;
    const prev = latest.get(k);
    if (!prev || ts(r.computed_at) > ts(prev.computed_at)) latest.set(k, r);
  }
  const per = new Map<string, Map<string, number[]>>();
  for (const r of latest.values()) {
    const n = Number(r.score);
    if (!Number.isFinite(n)) continue;
    if (!per.has(r.student_id)) per.set(r.student_id, new Map());
    const subj = per.get(r.student_id)!;
    const key = normSubject(r.subject);
    subj.set(key, [...(subj.get(key) || []), n]);
  }
  const out = new Map<string, Record<string, number | null>>();
  for (const [sid, subj] of per) out.set(sid, Object.fromEntries([...subj].map(([k, v]) => [k, mean(v)])));
  return out;
}

/** A student's TML across the given subjects (mean of the ones with evidence). */
export function studentTml(s: TStudent, subjects: string[]): number | null {
  const vals = (subjects.length ? subjects.map(normSubject) : Object.keys(s.tml))
    .map(k => s.tml[k]).filter((v): v is number => typeof v === 'number');
  return mean(vals);
}

function shapeSubmission(sub: any, questions: Question[], name: string, items: any[]): TSubmission {
  const approved = sub.teacher_approved === true;
  const r = sub.ai_result && typeof sub.ai_result === 'object' ? sub.ai_result : null;
  const answers = sub.answers && typeof sub.answers === 'object' ? sub.answers : {};
  return {
    id: sub.id,
    studentId: sub.student_id,
    studentName: name,
    submittedAt: sub.submitted_at || sub.created_at || null,
    state: approved && sub.score !== null && sub.score !== undefined ? 'graded' : 'pending',
    score: sub.score ?? null,
    max: sub.max_score ?? null,
    suggested: sub.ai_graded && typeof r?.score === 'number' ? r.score : sub.score ?? null,
    suggestedByQuestion: suggestedScores(questions, answers),
    confirmedByQuestion: items.length && questions.length
      ? questions.map((_, i) => { const it = items.find(x => x.question_index === i); return it ? Number(it.score) : null; })
      : null,
    answers,
    imageUrls: Array.isArray(sub.image_urls) ? sub.image_urls : [],
    aiFeedback: typeof sub.ai_feedback === 'string' ? sub.ai_feedback : r?.overallFeedback ?? null,
    aiQuestions: Array.isArray(r?.questions) ? r.questions : [],
    note: sub.teacher_note ?? null,
    kind: sub.type === 'handwritten' || (!Object.keys(answers).length && (sub.image_urls || []).length) ? 'handwritten' : 'typed',
  };
}

function rosterFor(a: any, students: TStudent[]): TStudent[] {
  const ids: string[] = Array.isArray(a.assigned_student_ids) ? a.assigned_student_ids : [];
  const inClass = students.filter(s => normClass(s.cls) === normClass(a.class));
  return ids.length ? inClass.filter(s => ids.includes(s.id) || ids.includes(s.rollNo)) : inClass;
}

export function assembleDesk(rows: DeskRows, me: TeacherDesk['me'], scope: ScopeEntry[], mode: TeacherDesk['mode']): TeacherDesk {
  const tml = tmlIndex(rows.tml);
  const topics = topicIndex(rows.tml);
  const students: TStudent[] = rows.students
    .map(u => ({ id: u.id, name: u.name || u.email || 'Student', rollNo: u.custom_student_id || '', cls: u.student_class || '', tml: tml.get(u.id) || {}, topics: topics.get(u.id) || {} }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(students.map(s => [s.id, s]));

  const itemsBy = new Map<string, any[]>();
  for (const it of rows.items) itemsBy.set(it.submission_id, [...(itemsBy.get(it.submission_id) || []), it]);
  const subsBy = new Map<string, any[]>();
  for (const s of rows.submissions) subsBy.set(s.assignment_id, [...(subsBy.get(s.assignment_id) || []), s]);

  const assignments: TAssignment[] = rows.assignments.map(a => {
    const { questions } = sanitizeQuestions(a.questions);
    const submissions = (subsBy.get(a.id) || [])
      .map(s => shapeSubmission(s, questions, byId.get(s.student_id)?.name || 'Student', itemsBy.get(s.id) || []))
      .sort((x, y) => x.studentName.localeCompare(y.studentName));
    const type: WorkType = a.type === 'quiz' || a.type === 'classwork' ? a.type : 'homework';
    return {
      id: a.id, title: a.title || 'Untitled', type, cls: a.class || '', subject: a.subject || '',
      chapter: Array.isArray(a.units) && a.units[0] && a.units[0] !== a.title ? a.units[0] : null,
      description: a.description || '', dueAt: a.due_date || null,
      status: a.status === 'draft' ? 'draft' as const : 'published' as const,
      mode: a.submission_mode === 'handwritten' ? 'handwritten' as const : 'typed' as const,
      proctored: !!a.proctored, questions, totalMarks: a.total_marks ?? null, createdAt: a.created_at || null,
      roster: rosterFor(a, students), submissions, pendingCount: submissions.filter(s => s.state === 'pending').length,
    };
  }).sort((x, y) => (x.status === y.status ? ts(y.createdAt) - ts(x.createdAt) : x.status === 'draft' ? -1 : 1));

  const flags: ProctorFlag[] = rows.alerts.map(f => ({
    id: f.id, studentId: f.student_id, studentName: f.student_name || byId.get(f.student_id)?.name || 'Student',
    assignmentId: f.assignment_id, assignmentTitle: f.assignment_title || 'Assignment', switches: f.switch_count || 0,
    at: f.flagged_at, cls: byId.get(f.student_id)?.cls || '',
  })).sort((a, b) => ts(b.at) - ts(a.at));

  const classes: TClass[] = scopeClasses(scope).map(cls => {
    const subjects = subjectsIn(scope, cls);
    const roster = students.filter(s => normClass(s.cls) === normClass(cls));
    const vals = roster.map(s => studentTml(s, subjects)).filter((v): v is number => v !== null);
    return {
      cls, subjects, students: roster, tml: mean(vals), evidenced: vals.length,
      belowForty: roster.filter(s => { const v = studentTml(s, subjects); return v !== null && v < 40; }),
      pendingReview: assignments.filter(a => normClass(a.cls) === normClass(cls)).reduce((n, a) => n + a.pendingCount, 0),
      proctorFlags: flags.filter(f => normClass(f.cls) === normClass(cls)).length,
    };
  });

  return { mode, me, scope, classes, assignments, flags };
}

// ── Formatting ──────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dmy(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export const TYPE_CHIP: Record<WorkType, string> = { homework: 'HOMEWORK', quiz: 'QUIZ', classwork: 'CLASSWORK' };
