/**
 * Pure shaping functions: raw Supabase rows -> the student desk view model.
 * No I/O here, so it's unit-testable and shared by the live loader and demo.
 */
import { evidenceTopicName, getTutorDepthScore, normalizeComponentType } from '@/lib/tml/engine';
import type {
  AiQuestionFeedback, ComponentScores, DeskAssignment, EvidenceItem, EvidenceKind,
  Gate, QuestionType, SubjectMastery, TopicMastery,
} from './types';

// ── Subjects ────────────────────────────────────────────────────────────────
export const subjectKey = (s: string | null | undefined) => (s || 'General').trim().toLowerCase();

/** "MATHEMATICS" / "mathematics" -> "Mathematics"; "social studies" -> "Social Studies". */
export const displaySubject = (s: string | null | undefined) =>
  (s || 'General').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Card accent per subject, from the mockup's assignment colours. */
export function subjectColor(s: string): string {
  const k = subjectKey(s);
  if (k.startsWith('math')) return '#E11D48';
  if (k.includes('science') || k.includes('physics') || k.includes('chem') || k.includes('bio')) return '#F59E0B';
  if (k.includes('social') || k.includes('history') || k.includes('geog') || k.includes('civics')) return '#7C5CFC';
  if (k.includes('english')) return '#2F6BFF';
  if (k.includes('hindi') || k.includes('sanskrit') || k.includes('language')) return '#F45E77';
  return '#4C8DFF';
}

// ── Dates ───────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "28 Jul" — the mockup's date style everywhere. */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}
const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);

// ── Assignments ─────────────────────────────────────────────────────────────
function kindOf(type: string | null | undefined): DeskAssignment['kind'] {
  // Same bucketing the engine scores with, so a row's label matches its weight.
  if (normalizeComponentType(type ?? undefined) === 'quiz') return 'Quiz';
  return (type || '').toLowerCase() === 'classwork' ? 'Classwork' : 'Homework';
}

function questionTypesOf(questions: unknown): QuestionType[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q: any) => (q?.type === 'mcq' || q?.type === 'upload' ? q.type : 'short'));
}

function parseAiQuestions(sub: any): AiQuestionFeedback[] {
  const r = sub?.ai_result ?? (typeof sub?.ai_feedback === 'object' ? sub.ai_feedback : null);
  return Array.isArray(r?.questions) ? r.questions : [];
}

function feedbackText(sub: any): string | null {
  // The teacher's note wins over the AI's summary once the work is reviewed.
  const f = sub?.teacher_note ?? sub?.feedback ?? (typeof sub?.ai_feedback === 'string' ? sub.ai_feedback : null) ?? sub?.ai_result?.overallFeedback ?? null;
  return typeof f === 'string' && f.trim() ? f.trim() : null;
}

export function shapeAssignment(a: any, sub: any | undefined): DeskAssignment {
  // Graded only once a teacher confirmed it (or it was all multiple choice, marked instantly): never on an AI suggestion alone.
  const graded = !!sub && sub.score !== null && sub.score !== undefined && sub.teacher_approved === true;
  return {
    id: a.id,
    subject: (a.subject || 'General').toUpperCase(),
    title: a.title || 'Untitled assignment',
    desc: a.description || a.instructions || '',
    dueAt: a.due_date || null,
    color: subjectColor(a.subject || ''),
    proctored: !!a.proctored,
    kind: kindOf(a.type),
    topic: evidenceTopicName(a),
    questionTypes: questionTypesOf(a.questions),
    status: !sub ? 'open' : graded ? 'graded' : 'submitted',
    submission: sub ? {
      submittedAt: sub.submitted_at || sub.created_at || null,
      score: sub.score ?? null,
      total: sub.max_score ?? a.total_marks ?? null,
      feedback: feedbackText(sub),
      aiQuestions: parseAiQuestions(sub),
      teacherApproved: sub.teacher_approved ?? null,
    } : null,
  };
}

/**
 * Which assignments this student should see — same rule the homework list has
 * always used: class match (loose, "10A" ⊂ "Class 10-A"), then explicit
 * per-student targeting if the teacher set assigned_student_ids.
 */
export function isAssignedTo(a: any, studentClass: string, uid: string, customId: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/class|[\s\-_]/g, '');
  const aClass = norm(a.class || '');
  const sClass = norm(studentClass || '');
  if (aClass && sClass && !aClass.includes(sClass) && !sClass.includes(aClass)) return false;
  const ids: string[] = Array.isArray(a.assigned_student_ids) ? a.assigned_student_ids : [];
  if (ids.length === 0) return true;
  return ids.includes(uid) || (!!customId && ids.includes(customId));
}

// ── Mastery ─────────────────────────────────────────────────────────────────
const round = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v));
const mean = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v !== null);
  return xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null;
};

function evidenceFromAssignment(a: DeskAssignment): EvidenceItem {
  const s = a.submission;
  if (a.status === 'graded' && s && s.score !== null && s.total) {
    return { title: a.title, kind: a.kind, pct: Math.round((s.score / s.total) * 100), label: `${s.score}/${s.total}`, at: s.submittedAt };
  }
  if (a.status === 'submitted') return { title: a.title, kind: a.kind, pct: null, label: 'Awaiting review', at: s?.submittedAt ?? null };
  return { title: a.title, kind: a.kind, pct: null, label: 'Not started', at: a.dueAt };
}

function evidenceFromTutor(t: any): EvidenceItem {
  const hints = Number(t.hint_depth) || 0;
  const label = t.answer_revealed ? 'Answer revealed' : hints === 0 ? 'Unaided' : hints === 1 ? '1 hint' : `${hints} hints`;
  return { title: `AI Tutor · ${t.topic || 'session'}`, kind: 'Tutor', pct: getTutorDepthScore(hints, !!t.answer_revealed), label, at: t.created_at };
}

function subjectNote(topics: TopicMastery[]): string {
  const scored = topics.filter(t => t.score !== null) as (TopicMastery & { score: number })[];
  if (scored.length === 0) return 'No graded evidence yet';
  const best = scored.reduce((m, t) => (t.score > m.score ? t : m));
  const worst = scored.reduce((m, t) => (t.score < m.score ? t : m));
  if (best === worst) return `Evidence so far: ${best.name}`;
  return `Strong on ${best.name}, weak on ${worst.name}`;
}

/**
 * Builds per-subject mastery from the latest tml_scores snapshot per topic,
 * attaching the assignment + tutor evidence that fed each topic.
 *
 * Subject TML = unweighted mean of its topic TMLs. The spec's curriculum-unit
 * weight (Wt) isn't defined anywhere yet, so equal weighting is the honest
 * default until a real curriculum-weight table exists.
 */
export function buildSubjects(assignments: DeskAssignment[], tmlRows: any[], tutorRows: any[]): SubjectMastery[] {
  // Latest snapshot per (subject, topic) — tml_scores is append-only.
  const latest = new Map<string, any>();
  for (const r of tmlRows) {
    const k = `${subjectKey(r.subject)}::${r.topic_name}`;
    const prev = latest.get(k);
    if (!prev || ts(r.computed_at) > ts(prev.computed_at)) latest.set(k, r);
  }

  const subjects = new Map<string, { name: string; topics: Map<string, TopicMastery>; computedAt: string | null }>();
  const subjectFor = (raw: string) => {
    const k = subjectKey(raw);
    if (!subjects.has(k)) subjects.set(k, { name: displaySubject(raw), topics: new Map(), computedAt: null });
    return subjects.get(k)!;
  };
  const topicFor = (raw: string, name: string) => {
    const s = subjectFor(raw);
    if (!s.topics.has(name)) {
      s.topics.set(name, { name, score: null, gate: 'insufficient', components: { homework: null, quiz: null, tutor: null }, items: [] });
    }
    return s.topics.get(name)!;
  };

  for (const r of latest.values()) {
    const t = topicFor(r.subject, r.topic_name);
    const c = r.components || {};
    t.score = round(Number(r.score));
    t.gate = (['firm', 'provisional', 'insufficient'] as Gate[]).includes(r.confidence_band) ? r.confidence_band : 'provisional';
    t.components = { homework: round(c.homework?.score), quiz: round(c.quiz?.score), tutor: round(c.tutor?.score) };
    const s = subjectFor(r.subject);
    if (!s.computedAt || ts(r.computed_at) > ts(s.computedAt)) s.computedAt = r.computed_at;
  }

  for (const a of assignments) topicFor(a.subject, a.topic).items.push(evidenceFromAssignment(a));
  for (const t of tutorRows) topicFor(t.subject || 'General', t.topic?.trim() || 'Core Concepts').items.push(evidenceFromTutor(t));

  return [...subjects.values()]
    .map(s => {
      const topics = [...s.topics.values()]
        .map(t => ({ ...t, items: [...t.items].sort((x, y) => ts(x.at) - ts(y.at)) }))
        // Topics with no score and nothing graded or pending are noise.
        .filter(t => t.score !== null || t.items.length > 0);
      const scored = topics.filter(t => t.score !== null);
      const weakest = scored.length ? scored.reduce((m, t) => (t.score! < m.score! ? t : m)) : null;
      const components: ComponentScores = {
        homework: mean(scored.map(t => t.components.homework)),
        quiz: mean(scored.map(t => t.components.quiz)),
        tutor: mean(scored.map(t => t.components.tutor)),
      };
      return { subject: s.name, tml: mean(scored.map(t => t.score)), note: subjectNote(topics), components, topics, weakest, computedAt: s.computedAt };
    })
    .filter(s => s.topics.length > 0)
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export function overallTml(subjects: SubjectMastery[]): number | null {
  return mean(subjects.map(s => s.tml));
}

// ── Dashboard aggregates (mockup overallTML / weakestTopicOverall / …) ──────
export function weakestTopicOverall(subjects: SubjectMastery[]) {
  let best: { subject: string; name: string; score: number } | null = null;
  for (const s of subjects) for (const t of s.topics) {
    if (t.score === null) continue;
    if (!best || t.score < best.score) best = { subject: s.subject, name: t.name, score: t.score };
  }
  return best;
}

export function weakestSubject(subjects: SubjectMastery[]): string | null {
  const scored = subjects.filter(s => s.tml !== null);
  return scored.length ? scored.reduce((m, s) => (s.tml! < m.tml! ? s : m)).subject : null;
}

export const openAssignments = (as: DeskAssignment[]) =>
  as.filter(a => a.status === 'open').sort((a, b) => (ts(a.dueAt) || Infinity) - (ts(b.dueAt) || Infinity));

export function mostRecentGraded(as: DeskAssignment[]): DeskAssignment | null {
  const graded = as.filter(a => a.status === 'graded');
  return graded.length ? graded.reduce((m, a) => (ts(a.submission?.submittedAt) > ts(m.submission?.submittedAt) ? a : m)) : null;
}

export function evidenceKindCount(items: EvidenceItem[], kind: EvidenceKind) {
  return items.filter(i => i.kind === kind).length;
}

/** "Due today" / "Due tomorrow" / "Due in 6 days" / "Overdue by 2 days" — relative, for scanning. */
export function dueIn(iso: string | null | undefined): { text: string; tone: 'r' | 'a' | 'n' } {
  if (!iso) return { text: 'No due date', tone: 'n' };
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date(iso)) - startOf(new Date())) / 86_400_000);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, tone: 'r' };
  if (days === 0) return { text: 'Due today', tone: 'r' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'a' };
  return { text: `Due in ${days} days`, tone: days <= 3 ? 'a' : 'n' };
}
