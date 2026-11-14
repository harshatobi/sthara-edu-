/**
 * Studio home: where the class stands, what's worth doing, and whether every period this week is ready. Pure: the
 * route loads the rows, this shapes them. Every number links to the action that moves it.
 */
import { topicKey } from '@/lib/teacher/topicKey';

export interface Standing {
  students: number;
  mastery: number | null;
  lowest: { chapter: string; score: number } | null;
  belowForty: { id: string; name: string }[];
}

/** Latest TML per student per chapter -> class mastery, the weakest chapter, and who is below 40%. */
export function standing(roster: { id: string; name: string }[], tml: { student_id: string; topic_name: string; score: number; computed_at: string }[]): Standing {
  const latest = new Map<string, { chapter: string; score: number; at: string }>();
  for (const r of tml) {
    const k = `${r.student_id}|${topicKey(r.topic_name)}`;
    const cur = latest.get(k);
    if (!cur || cur.at < r.computed_at) latest.set(k, { chapter: r.topic_name, score: Number(r.score), at: r.computed_at });
  }
  const perStudent = new Map<string, number[]>();
  const perChapter = new Map<string, { name: string; scores: number[] }>();
  for (const [k, v] of latest) {
    const sid = k.split('|')[0];
    perStudent.set(sid, [...(perStudent.get(sid) ?? []), v.score]);
    const ck = topicKey(v.chapter);
    const c = perChapter.get(ck) ?? { name: v.chapter, scores: [] };
    c.scores.push(v.score); perChapter.set(ck, c);
  }
  const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
  const studentMeans = roster.map(s => ({ s, m: perStudent.get(s.id) })).filter(x => x.m?.length).map(x => ({ ...x.s, tml: mean(x.m!) }));
  // A chapter needs evidence from a few students before it can be called the class's weakest.
  const chapters = [...perChapter.values()].filter(c => c.scores.length >= Math.min(3, roster.length)).map(c => ({ chapter: c.name, score: Math.round(mean(c.scores)) }));
  return {
    students: roster.length,
    mastery: studentMeans.length ? Math.round(mean(studentMeans.map(x => x.tml))) : null,
    lowest: chapters.sort((a, b) => a.score - b.score)[0] ?? null,
    belowForty: studentMeans.filter(x => x.tml < 40).sort((a, b) => a.tml - b.tml).map(x => ({ id: x.id, name: x.name })),
  };
}

/** Periods ahead (+) or behind (-) the course plan: topics taught against the share of the term gone. */
export function pace(input: { today: string; termStart: string; termEnd: string; periodsPerWeek: number; totalTopics: number; taught: number }): number | null {
  const { today, termStart, termEnd, periodsPerWeek, totalTopics, taught } = input;
  if (!totalTopics || today < termStart) return null;
  const days = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 86_400_000);
  const term = days(termStart, termEnd);
  if (!term) return null;
  const gone = Math.min(1, days(termStart, today) / term);
  const totalPeriods = (term / 7) * periodsPerWeek;
  const periodsPerTopic = totalPeriods / totalTopics;
  return Math.round((taught - gone * totalTopics) * periodsPerTopic);
}

export type PeriodState = 'done' | 'ready' | 'partial' | 'none' | 'test' | 'off';
export interface WeekPeriod { date: string; period: number; title: string; detail: string; state: PeriodState; lessonId: string | null }
export interface WeekDay { date: string; label: string; today: boolean; periods: WeekPeriod[] }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Mon-Sat of this week with this teacher's periods for the class, and how ready each one is:
 * done (taught), ready (a plan with materials), partial (a plan only), none (nothing yet), test, off (holiday).
 */
export function week(input: {
  today: string;
  slots: { weekday: number; period_no: number }[];
  lessons: { id: string; lesson_date: string | null; period: number | null; title: string; chapter_name: string; status: string; materials: unknown; taught_on: string | null }[];
  events: { kind: string; title: string; starts_on: string; ends_on: string; suspends_classes: boolean }[];
}): WeekDay[] {
  const dow = new Date(`${input.today}T00:00:00Z`).getUTCDay();
  const monday = addDays(input.today, -((dow + 6) % 7));
  const out: WeekDay[] = [];
  for (let d = 0; d < 6; d++) {
    const date = addDays(monday, d);
    const wd = d + 1; // timetable weekday: 1 = Monday
    const off = input.events.find(e => e.suspends_classes && e.starts_on <= date && e.ends_on >= date);
    const exam = input.events.find(e => e.kind === 'exam' && e.starts_on <= date && e.ends_on >= date);
    const periods = input.slots.filter(s => s.weekday === wd).sort((a, b) => a.period_no - b.period_no);
    const lessonsToday = input.lessons.filter(l => l.lesson_date === date);
    const shaped: WeekPeriod[] = off
      ? [{ date, period: 0, title: off.title, detail: 'No classes', state: 'off', lessonId: null }]
      : periods.map((p, i) => {
        if (exam) return { date, period: p.period_no, title: exam.title, detail: 'Exam', state: 'test' as const, lessonId: null };
        const l = lessonsToday.find(x => x.period === p.period_no) ?? lessonsToday[i];
        if (!l) return { date, period: p.period_no, title: 'Nothing planned', detail: `Period ${p.period_no}`, state: 'none' as const, lessonId: null };
        const hasMaterials = Array.isArray(l.materials) && l.materials.length > 0;
        const state: PeriodState = l.status === 'taught' || l.taught_on ? 'done' : hasMaterials ? 'ready' : 'partial';
        return { date, period: p.period_no, title: l.chapter_name || l.title, detail: state === 'done' ? 'Taught' : state === 'ready' ? 'Plan and materials' : 'Plan only', state, lessonId: l.id };
      });
    out.push({ date, label: date === input.today ? 'Today' : DOW[new Date(`${date}T00:00:00Z`).getUTCDay()], today: date === input.today, periods: shaped });
  }
  return out;
}

export type ReadyKind = 'catchup' | 'lesson' | 'parent_note' | 'draft' | 'test' | 'marked' | 'retention' | 'plan';
export interface ReadyItem {
  id: string; kind: ReadyKind; title: string; detail: string;
  /** What opening it sets up (the Studio opens with these values; nothing is generated until the teacher says so). */
  preset: { tool: 'questions' | 'lesson' | 'parent_note' | 'open' | 'analysis' | 'retention' | 'plan'; setKind?: string; chapter?: string; audience?: string; students?: string[]; materialId?: string; lessonId?: string; studentId?: string; assignmentId?: string; followupId?: string };
}

/** The handful of things most worth doing for this class this week, most useful first. */
export function readyFor(input: {
  standing: Standing; className: string;
  nextLesson: { id: string; lesson_date: string; title: string; chapter_name: string; hasMaterials: boolean } | null;
  missing: { id: string; name: string; count: number }[];
  drafts: { id: string; title: string; updated_at: string }[];
  nextExam: { title: string; starts_on: string } | null;
  today: string;
  /** Recently due Studio work with marks in: worth a look at how it went. */
  marked?: { assignmentId: string; title: string; handedIn: number } | null;
  /** Retention checks coming up in the next few days, or ones the bank couldn't supply. */
  retention?: { id: string; chapter: string; due_on: string; status: string }[];
  /** Unit plans with lessons past their date, not taught. */
  behind?: { title: string; behind: number }[];
}): ReadyItem[] {
  const out: ReadyItem[] = [];
  const s = input.standing;
  for (const u of (input.behind ?? []).slice(0, 1)) {
    out.push({ id: `behind-${u.title}`, kind: 'plan', title: `${u.title} has slipped`, detail: `${u.behind} lesson${u.behind === 1 ? '' : 's'} went past ${u.behind === 1 ? 'its' : 'their'} date without being taught. Re-pace it onto your next free periods.`, preset: { tool: 'plan' } });
  }
  if (input.marked) {
    out.push({ id: `marked-${input.marked.assignmentId}`, kind: 'marked', title: `How ${input.marked.title} went`, detail: `${input.marked.handedIn} handed in. Question by question, the wrong answers that were popular, and who needs the retest.`, preset: { tool: 'analysis', assignmentId: input.marked.assignmentId } });
  }
  for (const r of (input.retention ?? []).slice(0, 1)) {
    out.push(r.status === 'failed'
      ? { id: `ret-${r.id}`, kind: 'retention', title: `Retention check on ${r.chapter}`, detail: 'Due now, but the bank has too few quick questions on these topics. Make a short quiz instead.', preset: { tool: 'questions', setKind: 'quiz', chapter: r.chapter, audience: 'class' } }
      : { id: `ret-${r.id}`, kind: 'retention', title: `Retention check: ${r.chapter}`, detail: `Goes out ${r.due_on === input.today ? 'today' : r.due_on === addDays(input.today, 1) ? 'tomorrow' : `on ${r.due_on}`} on its own: a few quick questions, marked instantly. Skip or move it if the timing is wrong.`, preset: { tool: 'retention', followupId: r.id } });
  }
  if (s.lowest && s.lowest.score < 60) {
    const who = s.belowForty.length;
    out.push({
      id: 'catchup', kind: 'catchup', title: `Catch-up on ${s.lowest.chapter}`,
      detail: who ? `${input.className} is at ${s.lowest.score}% here, and ${who} student${who === 1 ? ' is' : 's are'} below 40%. One version each, on their own weak spots.` : `${input.className} is at ${s.lowest.score}% here, its weakest chapter.`,
      preset: { tool: 'questions', setKind: 'catchup', chapter: s.lowest.chapter, audience: who ? 'per_student' : 'class', students: s.belowForty.map(x => x.id) },
    });
  }
  if (input.nextLesson && !input.nextLesson.hasMaterials) {
    out.push({
      id: `lesson-${input.nextLesson.id}`, kind: 'lesson', title: `${input.nextLesson.lesson_date === addDays(input.today, 1) ? 'Tomorrow' : input.nextLesson.lesson_date}: ${input.nextLesson.chapter_name}`,
      detail: 'Planned, with nothing to hand out yet. Add an exit ticket so you know who followed it.',
      preset: { tool: 'questions', setKind: 'exit_ticket', chapter: input.nextLesson.chapter_name, audience: 'class', lessonId: input.nextLesson.id },
    });
  }
  if (input.nextExam) {
    out.push({ id: 'test', kind: 'test', title: `${input.nextExam.title} on ${input.nextExam.starts_on}`, detail: 'Exam mode: chapters ranked by board marks against where the class stands, revision fitted to the periods left, and a mock paper.', preset: { tool: 'plan' } });
  }
  for (const m of input.missing.slice(0, 1)) {
    out.push({ id: `parent-${m.id}`, kind: 'parent_note', title: `Note to ${m.name.split(' ')[0]}'s family`, detail: `${m.count} pieces of work not handed in. A short, warm note with one thing to do at home.`, preset: { tool: 'parent_note', studentId: m.id } });
  }
  for (const d of input.drafts.slice(0, 1)) {
    out.push({ id: `draft-${d.id}`, kind: 'draft', title: `Finish: ${d.title}`, detail: 'A draft you started. Check it and hand it out.', preset: { tool: 'open', materialId: d.id } });
  }
  return out.slice(0, 5);
}
