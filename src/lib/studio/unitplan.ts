/**
 * Calendar-aware planning for the Studio (decisions of 2026-11-10, round 5). Pure: the routes load the rows.
 *   teachingPeriods   this teacher's dated periods with a class, from the timetable, skipping holidays and exam days
 *   periodsFor        how many periods a chapter needs (its published hours, else its topic count)
 *   planUnit          a chapter laid out over those periods: teach, practise, and a check at the end
 *   repace            untaught lessons moved onto the next free periods when periods were lost
 *   revisionPlan      exam mode: chapters ranked by board marks x the class's gap, periods shared out by that rank
 */
import { addDays, daysBetween } from '@/lib/teacher/course';

export interface Slot { weekday: number; period_no: number }
export interface CalEvent { kind: string; starts_on: string; ends_on: string; suspends_classes: boolean }
export interface Period { date: string; period: number }

/** Timetable weekday (1 = Monday ... 7 = Sunday) of a date. */
export const weekdayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
export const periodKey = (p: Period) => `${p.date}|${p.period}`;

export function teachingPeriods(from: string, to: string, slots: Slot[], events: CalEvent[], taken: Set<string> = new Set(), max = 300): Period[] {
  const out: Period[] = [];
  if (!slots.length || to < from) return out;
  const days = Math.min(400, daysBetween(from, to));
  for (let i = 0; i <= days && out.length < max; i++) {
    const date = addDays(from, i);
    if (events.some(e => (e.suspends_classes || e.kind === 'exam') && e.starts_on <= date && e.ends_on >= date)) continue;
    const wd = weekdayOf(date);
    for (const s of slots.filter(x => x.weekday === wd).sort((a, b) => a.period_no - b.period_no)) {
      const p = { date, period: s.period_no };
      if (!taken.has(periodKey(p))) out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}

export function periodsFor(chapter: { hours?: number | null; topics: string[] }, periodMinutes = 40): number {
  const t = Math.max(1, chapter.topics.length);
  if (chapter.hours && chapter.hours > 0) return Math.max(Math.min(t + 1, 40), Math.min(40, Math.round((chapter.hours * 60) / periodMinutes)));
  return Math.max(3, Math.min(30, Math.ceil(t * 1.5) + 1));
}

export type UnitKind = 'teach' | 'practice' | 'check';
export interface UnitPeriod { kind: UnitKind; topics: string[] }

/**
 * n periods for a chapter: the last is a check (the chapter test or exit ticket) when there are 3 or more; a practice
 * period follows every five teaching periods when there's room; topics run in syllabus order, a long topic spanning
 * consecutive periods and short ones sharing.
 */
export function planUnit(topics: string[], n: number): UnitPeriod[] {
  if (n <= 0) return [];
  const list = topics.length ? topics : ['The chapter'];
  const check = n >= 3 ? 1 : 0;
  let practice = n - check > list.length + 1 ? Math.floor((n - check) / 6) : 0;
  const teach = n - check - practice;
  // Topics into `teach` buckets, in order.
  const buckets: string[][] = Array.from({ length: teach }, () => []);
  if (teach >= list.length) {
    // More periods than topics: each topic gets a run of periods.
    let at = 0;
    list.forEach((t, i) => {
      const len = Math.round(((i + 1) * teach) / list.length) - Math.round((i * teach) / list.length);
      for (let k = 0; k < len; k++) buckets[at++].push(t);
    });
  } else {
    list.forEach((t, i) => buckets[Math.min(teach - 1, Math.floor((i * teach) / list.length))].push(t));
  }
  const out: UnitPeriod[] = [];
  let sinceGap = 0;
  const seen: string[] = [];
  for (const b of buckets) {
    out.push({ kind: 'teach', topics: b });
    for (const t of b) if (!seen.includes(t)) seen.push(t);
    sinceGap++;
    if (practice > 0 && sinceGap >= 5) { out.push({ kind: 'practice', topics: seen.slice(-4) }); practice--; sinceGap = 0; }
  }
  while (practice-- > 0) out.splice(Math.max(0, out.length - 1), 0, { kind: 'practice', topics: seen.slice(-4) });
  if (check) out.push({ kind: 'check', topics: list });
  return out;
}

/**
 * Re-pacing: lessons not yet taught, in their planned order, onto the next free periods from `from`. Only lessons whose
 * date changes come back. Periods already holding another lesson (taken) are skipped.
 */
export function repace(lessons: { id: string; date: string | null; period: number | null; taught: boolean }[], periods: Period[]): { id: string; date: string; period: number }[] {
  const todo = lessons.filter(l => !l.taught).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.period ?? 0) - (b.period ?? 0));
  const out: { id: string; date: string; period: number }[] = [];
  todo.forEach((l, i) => {
    const p = periods[i];
    if (!p) return;
    if (l.date !== p.date || l.period !== p.period) out.push({ id: l.id, date: p.date, period: p.period });
  });
  return out;
}

/** Lessons whose date has passed without being taught: periods lost to the plan. */
export const behindBy = (lessons: { date: string | null; taught: boolean }[], today: string) => lessons.filter(l => !l.taught && !!l.date && l.date < today).length;

export interface RevisionRow { chapter: string; marks: number; score: number | null; priority: number; periods: number }

/**
 * Exam mode. Priority = the chapter's board marks x the class's gap on it (100 - mastery; an unknown chapter counts as
 * half known). The periods left are shared out by priority, highest first, each chapter with marks getting at least one
 * while periods last.
 */
export function revisionPlan(chapters: { chapter: string; marks: number; score: number | null }[], periods: number): RevisionRow[] {
  const rows = chapters.filter(c => c.marks > 0).map(c => ({ ...c, priority: Math.round(c.marks * (c.score === null ? 50 : Math.max(0, 100 - c.score)) / 10) / 10, periods: 0 }))
    .sort((a, b) => b.priority - a.priority || b.marks - a.marks);
  let left = periods;
  for (const r of rows) { if (left <= 0) break; if (r.priority > 0) { r.periods = 1; left--; } }
  const total = rows.reduce((n, r) => n + r.priority, 0);
  if (left > 0 && total > 0) {
    const extra = rows.map(r => (r.priority / total) * left);
    rows.forEach((r, i) => { r.periods += Math.floor(extra[i]); });
    let rest = periods - rows.reduce((n, r) => n + r.periods, 0);
    const byFrac = rows.map((r, i) => ({ r, f: extra[i] - Math.floor(extra[i]) })).sort((a, b) => b.f - a.f);
    for (const x of byFrac) { if (rest <= 0) break; x.r.periods++; rest--; }
  }
  return rows;
}
