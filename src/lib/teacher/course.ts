/**
 * Syllabus coverage, pacing and lesson plans for one class + subject. Pure —
 * the loader (useCourse) fetches, the API routes write, this does the math.
 *
 * Dates are ISO calendar days ("2026-10-05") handled in UTC so a plan never
 * shifts a day with the viewer's timezone.
 */
import { courseChapters, getCurriculum, CURRENT_SESSION } from '@/lib/curriculum';
import { topicKey } from './desk';

export type TopicStatus = 'not_started' | 'in_progress' | 'taught' | 'revisit';
export const STATUS_ORDER: TopicStatus[] = ['not_started', 'in_progress', 'taught', 'revisit'];
export const STATUS_LABEL: Record<TopicStatus, string> = { not_started: 'NOT YET', in_progress: 'IN PROGRESS', taught: 'TAUGHT', revisit: 'REVISIT' };
export const STATUS_TONE: Record<TopicStatus, 'n' | 'b' | 'g' | 'a'> = { not_started: 'n', in_progress: 'b', taught: 'g', revisit: 'a' };

// ── Dates ───────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
export const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const fromDay = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toDay(b) - toDay(a)) / DAY);
export const todayIso = () => { const d = new Date(); return fromDay(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
/** Monday of the week containing `iso`. */
export const weekStart = (iso: string) => { const dow = (new Date(toDay(iso)).getUTCDay() + 6) % 7; return addDays(iso, -dow); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDay = (iso: string | null | undefined) => (iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}` : '—');
export const fmtDow = (iso: string) => DOW[new Date(toDay(iso)).getUTCDay()];
export const monthLabel = (iso: string) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;

/** Indian academic year: April to February, e.g. session "2026-27" -> 2026-04-01 … 2027-02-28. */
export function defaultTerm(session = CURRENT_SESSION) {
  const y = Number(session.slice(0, 4)) || new Date().getFullYear();
  return { termStart: `${y}-04-01`, termEnd: `${y + 1}-02-28` };
}

/** Teaching days (Mon–Sat) in [start, end]. */
export function teachingDays(start: string, end: string): number {
  let n = 0;
  for (let t = toDay(start); t <= toDay(end); t += DAY) if (new Date(t).getUTCDay() !== 0) n++;
  return n;
}

// ── Model ───────────────────────────────────────────────────────────────────
export interface CoursePlan { termStart: string; termEnd: string; periodsPerWeek: number; periodMinutes: number; saved: boolean }

export interface TopicRow { topic: string; status: TopicStatus; taughtOn: string | null; note: string | null }

export interface CourseChapterView {
  key: string;
  name: string;
  seq: number;
  ncert: number | null;
  unit: string;
  hours: number | null;
  approxMarks: number | null;
  formativeOnly: boolean;
  outcomes: string[];
  notes: string[];
  topics: TopicRow[];
  plannedStart: string | null;
  plannedEnd: string | null;
  taught: number;
  inProgress: number;
  /** 0–100 share of topics taught. */
  pct: number;
}

export interface Lesson {
  id: string;
  teacherId: string;
  chapterKey: string;
  chapterName: string;
  topics: string[];
  title: string;
  date: string | null;
  period: number | null;
  durationMin: number;
  objectives: string[];
  successCriteria: string[];
  priorKnowledge: string;
  materials: { label: string; url?: string }[];
  stages: { name: string; minutes: number; teacher: string; students: string }[];
  differentiation: { support?: string; stretch?: string };
  checkForUnderstanding: string;
  homeworkAssignmentId: string | null;
  status: 'draft' | 'ready' | 'taught';
  reflection: string;
  taughtOn: string | null;
  aiDrafted: boolean;
}

export function shapeLesson(r: any): Lesson {
  return {
    id: r.id, teacherId: r.teacher_id, chapterKey: r.chapter_key, chapterName: r.chapter_name, topics: r.topics || [],
    title: r.title, date: r.lesson_date, period: r.period, durationMin: r.duration_min || 40,
    objectives: r.objectives || [], successCriteria: r.success_criteria || [], priorKnowledge: r.prior_knowledge || '',
    materials: Array.isArray(r.materials) ? r.materials : [], stages: Array.isArray(r.stages) ? r.stages : [],
    differentiation: r.differentiation && typeof r.differentiation === 'object' ? r.differentiation : {},
    checkForUnderstanding: r.check_for_understanding || '', homeworkAssignmentId: r.homework_assignment_id,
    status: r.status, reflection: r.reflection || '', taughtOn: r.taught_on, aiDrafted: !!r.ai_drafted,
  };
}

/** The standard lesson arc a new plan starts from (gradual release: I do, we do, you do). */
export function defaultStages(duration: number): Lesson['stages'] {
  const warm = Math.max(3, Math.round(duration * 0.12));
  const plen = Math.max(3, Math.round(duration * 0.12));
  const teach = Math.round((duration - warm - plen) * 0.45);
  return [
    { name: 'Starter', minutes: warm, teacher: '', students: '' },
    { name: 'Teach & model', minutes: teach, teacher: '', students: '' },
    { name: 'Guided & independent practice', minutes: duration - warm - plen - teach, teacher: '', students: '' },
    { name: 'Plenary & exit check', minutes: plen, teacher: '', students: '' },
  ];
}

/** Joins the curriculum with saved progress rows into the chapter list the syllabus renders. */
export function buildCourse(cls: string, subject: string, progress: any[]): CourseChapterView[] {
  const cur = getCurriculum(cls, subject);
  if (!cur) return [];
  const byKey = new Map<string, any>();
  for (const r of progress) byKey.set(`${r.chapter_key}::${r.topic || ''}`, r);
  return courseChapters(cur).map(c => {
    const key = topicKey(c.name);
    const head = byKey.get(`${key}::`);
    const topics: TopicRow[] = c.topics.map(t => {
      const r = byKey.get(`${key}::${t}`);
      return { topic: t, status: (r?.status as TopicStatus) || 'not_started', taughtOn: r?.taught_on ?? null, note: r?.note ?? null };
    });
    const taught = topics.filter(t => t.status === 'taught').length;
    return {
      key, name: c.name, seq: c.seq, ncert: c.number ?? null, unit: c.unitName, hours: c.hours ?? null, approxMarks: c.approxMarks,
      formativeOnly: !!c.formativeOnly, outcomes: c.outcomes || [], notes: c.notes || [], topics,
      plannedStart: head?.planned_start ?? null, plannedEnd: head?.planned_end ?? null,
      taught, inProgress: topics.filter(t => t.status === 'in_progress' || t.status === 'revisit').length,
      pct: topics.length ? Math.round((taught / topics.length) * 100) : 0,
    };
  });
}

// ── Pacing ──────────────────────────────────────────────────────────────────
/**
 * Spreads the term across chapters in teaching order, in proportion to the
 * curriculum's allotted hours (or topic count where hours aren't published).
 * Returns contiguous windows that exactly fill the term.
 */
export function autoPace(chapters: Pick<CourseChapterView, 'key' | 'hours' | 'topics'>[], termStart: string, termEnd: string) {
  const weights = chapters.map(c => (c.hours && c.hours > 0 ? c.hours : Math.max(1, c.topics.length) * 3));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = daysBetween(termStart, termEnd) + 1;
  let cursor = 0;
  let acc = 0;
  return chapters.map((c, i) => {
    acc += weights[i];
    const end = i === chapters.length - 1 ? span - 1 : Math.max(cursor, Math.round((acc / total) * span) - 1);
    const out = { key: c.key, plannedStart: addDays(termStart, cursor), plannedEnd: addDays(termStart, end) };
    cursor = end + 1;
    return out;
  });
}

export type PaceState = 'unplanned' | 'upcoming' | 'on_track' | 'behind' | 'ahead' | 'done';
export const PACE_LABEL: Record<PaceState, string> = {
  unplanned: 'NO PLAN', upcoming: 'UPCOMING', on_track: 'ON TRACK', behind: 'BEHIND', ahead: 'AHEAD', done: 'DONE',
};
export const PACE_TONE: Record<PaceState, 'n' | 'b' | 'g' | 'r' | 'p'> = {
  unplanned: 'n', upcoming: 'n', on_track: 'b', behind: 'r', ahead: 'p', done: 'g',
};

/** Where a chapter should be by `today` (0–100) given its planned window. */
export function expectedPct(c: Pick<CourseChapterView, 'plannedStart' | 'plannedEnd'>, today: string): number | null {
  if (!c.plannedStart || !c.plannedEnd) return null;
  if (today < c.plannedStart) return 0;
  if (today >= c.plannedEnd) return 100;
  const len = daysBetween(c.plannedStart, c.plannedEnd) + 1;
  return Math.round(((daysBetween(c.plannedStart, today) + 1) / len) * 100);
}

/** Pace of one chapter: more than 15 points off the planned line counts as behind / ahead. */
export function paceOf(c: CourseChapterView, today: string): PaceState {
  if (c.pct === 100) return 'done';
  const exp = expectedPct(c, today);
  if (exp === null) return 'unplanned';
  if (exp === 0) return c.pct > 0 ? 'ahead' : 'upcoming';
  if (c.pct + 15 < exp) return 'behind';
  if (c.pct > exp + 15) return 'ahead';
  return 'on_track';
}

export interface CourseSummary {
  topics: number;
  taught: number;
  /** Topics the plan says should be taught by today (null without a plan). */
  expected: number | null;
  /** Chapters with at least one posted assessment. */
  assessedChapters: number;
  /** Chapters with taught topics but no assessment yet. */
  gapChapters: number;
  /** Projected date the syllabus completes at the pace so far (null until there's a pace). */
  projectedEnd: string | null;
}

export function summarize(chapters: CourseChapterView[], assessedKeys: Set<string>, plan: CoursePlan, today: string): CourseSummary {
  const topics = chapters.reduce((n, c) => n + c.topics.length, 0);
  const taught = chapters.reduce((n, c) => n + c.taught, 0);
  const planned = chapters.some(c => c.plannedStart && c.plannedEnd);
  const expected = planned ? Math.round(chapters.reduce((n, c) => n + ((expectedPct(c, today) ?? 0) / 100) * c.topics.length, 0)) : null;
  const elapsed = Math.max(0, daysBetween(plan.termStart, today < plan.termEnd ? today : plan.termEnd));
  const rate = elapsed > 6 && taught > 0 ? taught / elapsed : 0; // topics per calendar day
  return {
    topics, taught, expected,
    assessedChapters: chapters.filter(c => assessedKeys.has(c.key)).length,
    gapChapters: chapters.filter(c => c.taught > 0 && !assessedKeys.has(c.key)).length,
    projectedEnd: rate > 0 ? addDays(plan.termStart, Math.ceil(topics / rate)) : null,
  };
}
