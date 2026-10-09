/**
 * School-wide student attendance from the pre-aggregated rows of public.school_attendance_summary:
 * today's registers by class, each class's month and session percentage with its weekly trend, grades,
 * and the students under the CBSE 75%. Pure: the admin Attendance page and the board pack both read it.
 */
import { displayClass, normClass } from '@/lib/teacher/scope';
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
  /** Students under the minimum this session, lowest first. */
  under: (SchoolStudent & { session: Counts })[];
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
  const perStudent = new Map(of('student').map(r => [r.student_id!, counts([r])]));
  const perStudentMonth = new Map(of('student_month').map(r => [r.student_id!, counts([r])]));
  const weekRows = of('class_week'), dayRows = of('class_day');

  // Classes: every section with students on roll, plus any class that has register rows.
  const names = new Map<string, string>();
  for (const s of students) if (normClass(s.cls)) names.set(normClass(s.cls), displayClass(s.cls));
  for (const r of [...weekRows, ...dayRows]) if (r.class_name && !names.has(normClass(r.class_name))) names.set(normClass(r.class_name), displayClass(r.class_name));

  const classes: ClassAttendance[] = [...names].map(([key, cls]) => {
    const roll = students.filter(s => normClass(s.cls) === key);
    const day = dayRows.filter(r => normClass(r.class_name) === key);
    const sess = roll.map(s => perStudent.get(s.id)).filter((c): c is Counts => !!c);
    return {
      cls, grade: roll[0]?.grade ?? null, onRoll: roll.length,
      today: day.length ? counts(day) : null,
      month: counts(roll.map(s => perStudentMonth.get(s.id)).filter((c): c is Counts => !!c)),
      session: counts(sess),
      under: sess.filter(below).length,
      weeks: weekly(weekRows.filter(r => normClass(r.class_name) === key), sessionStart, today),
    };
  }).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.cls.localeCompare(b.cls, 'en', { numeric: true }));

  const grades = [...new Set(students.map(s => s.grade).filter((g): g is number => g !== null))].sort((a, b) => a - b).map(grade => {
    const roll = students.filter(s => s.grade === grade);
    return { grade, students: roll.length, session: counts(roll.map(s => perStudent.get(s.id)).filter((c): c is Counts => !!c)) };
  });

  const under = students.flatMap(s => { const c = perStudent.get(s.id); return c && below(c) ? [{ ...s, session: c }] : []; })
    .sort((a, b) => (a.session.pct ?? 0) - (b.session.pct ?? 0));

  return {
    today: counts(dayRows), month: counts(of('student_month')), session: counts(of('student')),
    classesMarked: classes.filter(c => c.today).length,
    classes, grades, under,
    weeks: weekly(weekRows, sessionStart, today),
    any: rows.length > 0,
  };
}
