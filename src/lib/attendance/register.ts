/**
 * The class register (student attendance): which days are school days for a class, each student's
 * tally and percentage, and the quick "absentees by roll number" entry. Pure, so it is unit tested;
 * the teacher register, its month sheet and the CSV export all read it.
 *
 * Percentage = (present + late) / days marked, the same figure parents see (lib/parent/family.ts).
 * CBSE expects 75% to sit the board exams, so anything under it is flagged.
 */
import { eventsOn, weekdayOf } from '@/lib/schedule/engine';
import type { AcademicEvent } from '@/lib/schedule/types';

export type Mark = 'present' | 'absent' | 'late' | 'excused';
export const MARKS: Mark[] = ['present', 'absent', 'late', 'excused'];
export const MARK_LABEL: Record<Mark, string> = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' };
export const MARK_SHORT: Record<Mark, string> = { present: 'P', absent: 'A', late: 'L', excused: 'E' };
/** How far back a register can be marked or corrected (the server enforces it; lib/feed/attendance.ts). */
export const BACKDATE_DAYS = 7;
/** The CBSE minimum for board-exam eligibility. */
export const MIN_PCT = 75;

export interface SchoolDay {
  date: string;
  /** Why there are no classes, or null on a school day. */
  off: null | { why: 'weekend' | 'holiday'; label: string };
}

const DAY_MS = 86_400_000;
export const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const monthDays = (month: string) => {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
};

/**
 * Each date and whether the class meets: a holiday that suspends classes for the school (or the class's
 * wing) is off, and so is a weekday the school doesn't teach. Sunday is always off.
 */
export function schoolDays(dates: string[], cal: { workingDays: number[]; events: AcademicEvent[]; wingId: string | null }): SchoolDay[] {
  return dates.map(date => {
    const wd = weekdayOf(date);
    const hol = eventsOn(date, cal.events, cal.wingId).find(e => e.suspends_classes);
    if (hol) return { date, off: { why: 'holiday', label: hol.title } };
    if (wd === 7 || !cal.workingDays.includes(wd)) return { date, off: { why: 'weekend', label: wd === 7 ? 'Sunday' : 'No classes' } };
    return { date, off: null };
  });
}

/** The last `n` school days up to and including `today`, newest first, looking back at most `window` days. */
export function recentSchoolDays(today: string, n: number, window: number, cal: Parameters<typeof schoolDays>[1]): SchoolDay[] {
  const dates = Array.from({ length: window + 1 }, (_, i) => addDay(today, -i));
  return schoolDays(dates, cal).filter(d => !d.off).slice(0, n);
}

export interface Tally { present: number; absent: number; late: number; excused: number; marked: number; pct: number | null }

/** One student's tally over the given days (days with no mark are left out, not counted absent). */
export function tally(marks: Record<string, Mark | undefined>, days?: string[]): Tally {
  const t: Tally = { present: 0, absent: 0, late: 0, excused: 0, marked: 0, pct: null };
  for (const d of days ?? Object.keys(marks)) {
    const m = marks[d];
    if (!m) continue;
    t[m]++;
    t.marked++;
  }
  t.pct = t.marked ? Math.round(((t.present + t.late) / t.marked) * 100) : null;
  return t;
}

export const belowMin = (t: Tally) => t.pct !== null && t.pct < MIN_PCT;

/** Consecutive absences ending on `day` (or the latest marked day before it), counting only marked school days. */
export function absentStreak(marks: Record<string, Mark | undefined>, day: string): number {
  let n = 0;
  for (const d of Object.keys(marks).filter(x => x <= day).sort().reverse()) {
    if (marks[d] === 'absent') n++;
    else break;
  }
  return n;
}

/**
 * "3, 7, 12-14" or "3 7 12 to 14" -> the students with those roll numbers. Unknown numbers are reported back
 * so a teacher sees a typo instead of a silent miss.
 */
export function parseRollList(text: string, roster: { id: string; rollNo: string }[]): { ids: string[]; unknown: string[] } {
  const byRoll = new Map(roster.filter(s => s.rollNo).map(s => [s.rollNo.trim().toLowerCase(), s.id]));
  // A roll number may carry a prefix ("9A-07"); match on the trailing number too.
  const byNum = new Map<string, string>();
  for (const s of roster) {
    const m = s.rollNo.match(/(\d+)\s*$/);
    if (m && !byNum.has(String(Number(m[1])))) byNum.set(String(Number(m[1])), s.id);
  }
  const find = (tok: string) => byRoll.get(tok.toLowerCase()) ?? (/^\d+$/.test(tok) ? byNum.get(String(Number(tok))) : undefined);
  const ids = new Set<string>();
  const unknown: string[] = [];
  const parts = text.replace(/\s+(to|till)\s+/gi, '-').split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    const range = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      if (b - a > 200) { unknown.push(p); continue; }
      for (let i = a; i <= b; i++) {
        const id = find(String(i));
        if (id) ids.add(id); else unknown.push(String(i));
      }
      continue;
    }
    const id = find(p);
    if (id) ids.add(id); else unknown.push(p);
  }
  return { ids: [...ids], unknown };
}

/** Rows for the month sheet's CSV: roll, name, one column per day, then the totals. */
export function monthCsv(month: string, days: SchoolDay[], roster: { id: string; rollNo: string; name: string }[], history: Record<string, Record<string, Mark>>): (string | number)[][] {
  const head = ['Roll', 'Name', ...days.map(d => d.date.slice(8)), 'Present', 'Late', 'Absent', 'Excused', 'Marked', '%'];
  const rows = roster.map(s => {
    const h = history[s.id] || {};
    const t = tally(h, days.filter(d => !d.off).map(d => d.date));
    return [s.rollNo, s.name, ...days.map(d => (d.off ? (d.off.why === 'holiday' ? 'H' : '') : h[d.date] ? MARK_SHORT[h[d.date]] : '')),
      t.present, t.late, t.absent, t.excused, t.marked, t.pct ?? ''];
  });
  return [[`Register ${month.slice(0, 7)}`], head, ...rows];
}

export interface TrendPoint { week: string; pct: number | null; marked: number }

/**
 * Attendance week by week (weeks start on Monday): (present + late) / marks in that week, for one student
 * or pooled over a class. Weeks with no marks are null, a gap rather than a zero.
 */
export function weeklyTrend(histories: Record<string, Mark | undefined>[], from: string, to: string): TrendPoint[] {
  const monday = (d: string) => addDay(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const out: TrendPoint[] = [];
  for (let w = monday(from); w <= to; w = addDay(w, 7)) {
    let inn = 0, marked = 0;
    for (const h of histories) {
      for (let i = 0; i < 7; i++) {
        const m = h[addDay(w, i)];
        if (!m) continue;
        marked++;
        if (m === 'present' || m === 'late') inn++;
      }
    }
    out.push({ week: w, pct: marked ? Math.round((inn / marked) * 100) : null, marked });
  }
  return out;
}

/** Recent change: the mean of the last `n` weeks with marks against the `n` before them (null without enough weeks). */
export function trendDelta(points: TrendPoint[], n = 3): number | null {
  const v = points.filter(p => p.pct !== null).map(p => p.pct!) ;
  if (v.length < n * 2) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.round(mean(v.slice(-n)) - mean(v.slice(-n * 2, -n)));
}
