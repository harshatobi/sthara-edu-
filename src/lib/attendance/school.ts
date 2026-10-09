/**
 * School-wide student attendance from the pre-aggregated rows of public.school_attendance_summary:
 * today's registers by class, each class's month and session percentage with its weekly trend, grades,
 * and the students under the CBSE 75%. Pure: the admin Attendance page and the board pack both read it.
 */
import { displayClass, normClass } from '@/lib/teacher/scope';
import { gradeOf } from '@/lib/admin/format';
import { MIN_PCT, addDay, type TrendPoint } from './register';

export interface SummaryRow {
  bucket: 'student' | 'student_month' | 'class_week' | 'class_day';
  student_id: string | null; class_name: string | null; key: string | null;
  present: number; late: number; absent: number; excused: number;
}
export interface Counts { present: number; late: number; absent: number; excused: number; marked: number; pct: number | null }
export interface SchoolStudent { id: string; name: string; cls: string; grade: number | null; rollNo: string }

export interface ClassAttendance {
  cls: string;
  grade: number | null;
  onRoll: number;
  /** Today's register; null when it hasn't been marked. */
  today: Counts | null;
  month: Counts;
  session: Counts;
  under: number;
  weeks: TrendPoint[];
}
export interface SchoolAttendance {
  today: Counts;
  month: Counts;
  session: Counts;
  classesMarked: number;
  classes: ClassAttendance[];
  grades: { grade: number; session: Counts; students: number }[];
  weeks: TrendPoint[];
  /** Students under the minimum this session, lowest first (named only for those who may see attendance). */
  under: (SchoolStudent & { session: Counts })[];
  /** How many students are under the minimum: counted for every reader, named or not. */
  underCount: number;
  /** Has the school marked any register at all yet. */
  any: boolean;
}

const n = (v: unknown) => Number(v) || 0;
export function counts(rows: Pick<SummaryRow, 'present' | 'late' | 'absent' | 'excused'>[]): Counts {
  const c = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of rows) { c.present += n(r.present); c.late += n(r.late); c.absent += n(r.absent); c.excused += n(r.excused); }
  const marked = c.present + c.late + c.absent + c.excused;
  return { ...c, marked, pct: marked ? Math.round(((c.present + c.late) / marked) * 100) : null };
}
const below = (c: Counts) => c.pct !== null && c.pct < MIN_PCT;

/** Mondays from the week of `from` to the week of `to`, each with its pooled percentage (null when nothing was marked). */
function weekly(rows: SummaryRow[], from: string, to: string): TrendPoint[] {
  const monday = (d: string) => addDay(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const byWeek = new Map<string, SummaryRow[]>();
  for (const r of rows) if (r.key) byWeek.set(r.key, [...(byWeek.get(r.key) || []), r]);
  const out: TrendPoint[] = [];
  for (let w = monday(from); w <= to; w = addDay(w, 7)) {
    const c = counts(byWeek.get(w) || []);
    out.push({ week: w, pct: c.pct, marked: c.marked });
  }
  return out;
}

export function shapeSchoolAttendance(rows: SummaryRow[], students: SchoolStudent[], sessionStart: string, today: string): SchoolAttendance {
  const of = (b: SummaryRow['bucket']) => rows.filter(r => r.bucket === b);
  const byId = new Map(students.map(s => [s.id, s]));
  // Each student's tally in the class they are in now; a row without an id (a board-pack reader) or for a
  // student no longer on roll falls back to the class it was marked in.
  const place = (r: SummaryRow) => {
    const s = r.student_id ? byId.get(r.student_id) : undefined;
    return { key: normClass(s?.cls ?? r.class_name), grade: s ? s.grade : gradeOf(r.class_name), counts: counts([r]), student: s };
  };
  const sess = of('student').map(place), mon = of('student_month').map(place);
  const weekRows = of('class_week'), dayRows = of('class_day');

  // Classes: every section with students on roll, plus any class that has register rows.
  const names = new Map<string, string>();
  for (const s of students) if (normClass(s.cls)) names.set(normClass(s.cls), displayClass(s.cls));
  for (const r of [...weekRows, ...dayRows, ...of('student')]) if (r.class_name && !names.has(normClass(r.class_name))) names.set(normClass(r.class_name), displayClass(r.class_name));

  const pool = (xs: { counts: Counts }[]) => counts(xs.map(x => x.counts));
  const classes: ClassAttendance[] = [...names].map(([key, cls]) => {
    const roll = students.filter(s => normClass(s.cls) === key);
    const day = dayRows.filter(r => normClass(r.class_name) === key);
    const mine = sess.filter(x => x.key === key);
    return {
      cls, grade: roll[0]?.grade ?? gradeOf(cls), onRoll: roll.length,
      today: day.length ? counts(day) : null,
      month: pool(mon.filter(x => x.key === key)),
      session: pool(mine),
      under: mine.filter(x => below(x.counts)).length,
      weeks: weekly(weekRows.filter(r => normClass(r.class_name) === key), sessionStart, today),
    };
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.cls.localeCompare(b.cls, 'en', { numeric: true }));

  const gradeList = [...new Set([...students.map(s => s.grade), ...sess.map(x => x.grade)].filter((g): g is number => g !== null))].sort((a, b) => a - b);
  const grades = gradeList.map(grade => ({
    grade, students: students.filter(s => s.grade === grade).length,
    session: pool(sess.filter(x => x.grade === grade)),
  }));

  const under = sess.flatMap(x => (x.student && below(x.counts) ? [{ ...x.student, session: x.counts }] : []))
    .sort((a, b) => (a.session.pct ?? 0) - (b.session.pct ?? 0));

  return {
    today: counts(dayRows), month: pool(mon), session: pool(sess),
    classesMarked: classes.filter(c => c.today).length,
    classes, grades, under,
    underCount: sess.filter(x => below(x.counts)).length,
    weeks: weekly(weekRows, sessionStart, today),
    any: rows.length > 0,
  };
}
