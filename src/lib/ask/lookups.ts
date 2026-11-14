import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedCaller } from '@/lib/feed/access';
import type { TeacherDesk } from '@/lib/teacher/desk';
import type { AdminDesk } from '@/lib/admin/desk';
import type { FamilyView } from '@/lib/parent/family';
import { displayClass } from '@/lib/teacher/scope';
import { DAY_MS, istDay } from '@/lib/feed/rules';
import { byIds, pageAll } from '@/lib/ops/page';
import { inr } from '@/lib/admin/format';
import { personToken, type Book } from '@/lib/staff/ask';
import { TOOLS, isDay, normCls, type PlannedLookup, type Sources, type Viewer } from './protocol';

/**
 * The live lookups behind Ask the School OS. Each one checks the person's
 * permissions itself (the planner can only name lookups the person may use,
 * but a lookup never trusts that), reads what it needs, and returns text for
 * the model with every person as a token and every block tagged with its
 * source number.
 */

export interface StaffCtx {
  db: SupabaseClient;
  me: FeedCaller;
  viewer: Extract<Viewer, { kind: 'staff' }>;
  book: Book;
  sources: Sources;
  teacher?: TeacherDesk;
  admin?: AdminDesk;
}

export interface ParentCtx {
  db: SupabaseClient;
  viewer: Extract<Viewer, { kind: 'parent' }>;
  view: FamilyView;
  /** C1 -> child id (from the parent name book). */
  childOf: (token: string) => string | null;
  tokenOfChild: (id: string) => string;
  sources: Sources;
}

const MAX_DAYS = 120;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const round = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${Math.round(n)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const daysAgo = (n: number) => istDay(new Date(Date.now() - n * DAY_MS));
const has = (c: StaffCtx, p: string) => c.viewer.perms.includes(p);
const isTeacher = (c: StaffCtx) => c.viewer.role === 'teacher';
const tokOnly = (v: string | undefined) => (v || '').replace(/^\[\[|\]\]$/g, '').trim();
const weekOf = (day: string) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A date range from the planner's arguments, clamped to MAX_DAYS and never in the future. */
function range(args: Record<string, string>, defaultDays: number): { from: string; to: string } {
  const today = istDay();
  let to = isDay(args.to) && args.to <= today ? args.to : today;
  let from = isDay(args.from) && args.from <= to ? args.from : istDay(new Date(Date.parse(`${to}T00:00:00Z`) - defaultDays * DAY_MS));
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS > MAX_DAYS) from = istDay(new Date(Date.parse(`${to}T00:00:00Z`) - MAX_DAYS * DAY_MS));
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

// ── Who and which classes this person can see ────────────────────────────────
interface Kid { id: string; name: string; cls: string }

/** Every student this person can look up (teachers: their classes; office: the school). */
function roster(c: StaffCtx): Kid[] {
  if (c.teacher) return c.teacher.classes.flatMap(k => k.students.map(s => ({ id: s.id, name: s.name, cls: s.cls || k.cls })));
  if (c.admin) return c.admin.students.map(s => ({ id: s.id, name: s.name, cls: s.cls }));
  return [];
}
function mayReadClass(c: StaffCtx, cls: string, perm: string) {
  return isTeacher(c) ? c.viewer.classes.includes(normCls(cls)) : has(c, perm);
}
function classesSeen(c: StaffCtx, perm: string): string[] {
  const all = [...new Set(roster(c).map(k => k.cls).filter(Boolean))];
  return all.filter(cls => mayReadClass(c, cls, perm)).sort();
}
function resolveStudent(c: StaffCtx, arg: string | undefined): Kid | null {
  const t = tokOnly(arg);
  const p = c.book.people.get(t);
  const kids = roster(c);
  if (p) return kids.find(k => k.id === p.id) ?? null;
  // The planner may pass a plain name the tokenizer couldn't place (a typo or a shared first name).
  const q = (arg || '').toLowerCase().trim();
  const hits = q.length >= 3 ? kids.filter(k => k.name.toLowerCase().includes(q)) : [];
  return hits.length === 1 ? hits[0] : null;
}
function resolveClass(c: StaffCtx, arg: string | undefined): string | null {
  const n = normCls(arg);
  if (!n) return null;
  return [...new Set(roster(c).map(k => k.cls))].find(cls => normCls(cls) === n) ?? null;
}
const S = (c: StaffCtx, k: { id: string; name: string }) => personToken(c.book, 'S', k.id, k.name);

// ── Shared readers ───────────────────────────────────────────────────────────
/** Weekly mastery per subject: mean over students of each student's mean over topics. */
export async function masteryWeeks(db: SupabaseClient, schoolId: string, ids: string[], from: string, subject?: string) {
  const { data } = await byIds<any>(ids, (chunk, f, t) => {
    let q = db.from('tml_history').select('student_id, subject, topic_key, topic_name, week, score').eq('school_id', schoolId).in('student_id', chunk).gte('week', from);
    if (subject) q = q.ilike('subject', subject);
    return q.order('week').order('student_id').order('topic_key').range(f, t);
  });
  const bySubWeek = new Map<string, Map<string, Map<string, number[]>>>(); // subject -> week -> student -> scores
  const topics = new Map<string, { name: string; subject: string; scores: Map<string, number> }>(); // latest week only, filled below
  let lastWeek = '';
  for (const r of data) {
    const sc = Number(r.score);
    if (!Number.isFinite(sc)) continue;
    const sub = String(r.subject);
    const w = String(r.week).slice(0, 10);
    if (w > lastWeek) lastWeek = w;
    const weeks = bySubWeek.get(sub) ?? new Map(); bySubWeek.set(sub, weeks);
    const studs = weeks.get(w) ?? new Map(); weeks.set(w, studs);
    studs.set(r.student_id, [...(studs.get(r.student_id) || []), sc]);
  }
  for (const r of data) {
    if (String(r.week).slice(0, 10) !== lastWeek) continue;
    const key = `${r.subject}|${r.topic_key}`;
    const t = topics.get(key) ?? { name: r.topic_name || r.topic_key, subject: r.subject, scores: new Map() };
    t.scores.set(r.student_id, Number(r.score));
    topics.set(key, t);
  }
  const series = [...bySubWeek].map(([subject, weeks]) => ({
    subject,
    points: [...weeks].sort((a, b) => a[0].localeCompare(b[0])).map(([week, studs]) => ({ week, score: mean([...studs.values()].map(xs => mean(xs)!)) })),
  }));
  const perStudent = new Map<string, number>();
  for (const [, weeks] of bySubWeek) {
    const w = weeks.get(lastWeek);
    if (!w) continue;
    for (const [sid, xs] of w) perStudent.set(sid, mean([...(perStudent.has(sid) ? [perStudent.get(sid)!] : []), mean(xs)!])!);
  }
  const weakest = [...topics.values()].map(t => ({ name: t.name, subject: t.subject, score: mean([...t.scores.values()]), n: t.scores.size }))
    .filter(t => t.score !== null).sort((a, b) => a.score! - b.score!);
  return { series, weakest, perStudent, lastWeek };
}

function seriesText(series: { subject: string; points: { week: string; score: number | null }[] }[]) {
  return series.map(s => `- ${s.subject}: ${s.points.slice(-8).map(p => `${short(p.week)} ${round(p.score)}`).join(', ')}`).join('\n') || '- no mastery evidence in this period';
}

/** Published work for these classes due in the window, with who handed in. */
async function workFor(db: SupabaseClient, schoolId: string, classes: string[], from: string, to: string, opts: { teacherId?: string; subject?: string } = {}) {
  const wanted = new Set(classes.map(normCls));
  // bounded: paged below with pageAll (at most 5,000 rows)
  let q = db.from('assignments').select('id, title, type, subject, class, due_date, assigned_student_ids, teacher_id, created_at')
    .eq('school_id', schoolId).eq('status', 'published').gte('due_date', from).lte('due_date', to);
  if (opts.teacherId) q = q.eq('teacher_id', opts.teacherId);
  if (opts.subject) q = q.ilike('subject', opts.subject);
  // bounded: one school's published work over at most 120 days, then filtered to the classes asked about
  const { data: rows } = await pageAll<any>((f, t) => q.order('due_date').order('id').range(f, t), 5000);
  const work = rows.filter(a => wanted.has(normCls(a.class)));
  const { data: subs } = await byIds<any>(work.map(a => a.id), (chunk, f, t) => db.from('submissions')
    .select('id, assignment_id, student_id, score, max_score, teacher_approved, submitted_at').in('assignment_id', chunk).order('id').range(f, t));
  const byA = new Map<string, any[]>();
  for (const sRow of subs) byA.set(sRow.assignment_id, [...(byA.get(sRow.assignment_id) || []), sRow]);
  return work.map(a => ({ ...a, subs: byA.get(a.id) || [] }));
}

async function attendanceFor(db: SupabaseClient, schoolId: string, from: string, to: string, filter: { studentId?: string; classes?: string[] }) {
  // bounded: paged below with pageAll (at most 120,000 rows)
  let q = db.from('attendance').select('id, student_id, class_name, day, status').eq('school_id', schoolId).gte('day', from).lte('day', to);
  if (filter.studentId) q = q.eq('student_id', filter.studentId);
  const { data } = await pageAll<any>((f, t) => q.order('day').order('id').range(f, t), 120_000);
  const wanted = filter.classes ? new Set(filter.classes.map(normCls)) : null;
  return wanted ? data.filter(r => wanted.has(normCls(r.class_name))) : data;
}

async function examRows(db: SupabaseClient, schoolId: string, opts: { studentIds?: string[]; classes?: string[]; subject?: string }) {
  const { data: classes } = await db.from('classes').select('id, name').eq('school_id', schoolId).limit(500);
  const wanted = opts.classes ? new Set(opts.classes.map(normCls)) : null;
  const classIds = (classes || []).filter(k => !wanted || wanted.has(normCls(k.name))).map(k => k.id);
  if (!classIds.length) return [];
  const { data: sheets } = await byIds<any>(classIds, (chunk, f, t) => db.from('exam_sheets').select('id, assessment_id, class_subject_id, class_id, max_marks, status')
    .eq('school_id', schoolId).in('class_id', chunk).order('id').range(f, t));
  if (!sheets.length) return [];
  const [{ data: assess }, { data: subj }] = await Promise.all([
    byIds<any>([...new Set(sheets.map(x => x.assessment_id))], (chunk, f, t) => db.from('exam_assessments').select('id, name, kind, held_from').in('id', chunk).order('id').range(f, t)),
    byIds<any>([...new Set(sheets.map(x => x.class_subject_id))], (chunk, f, t) => db.from('class_subjects').select('id, subject_name').in('id', chunk).order('id').range(f, t)),
  ]);
  const A = new Map(assess.map(a => [a.id, a])), SB = new Map(subj.map(x => [x.id, x.subject_name])), CL = new Map((classes || []).map(k => [k.id, k.name]));
  const keep = sheets.filter(x => !opts.subject || String(SB.get(x.class_subject_id) || '').toLowerCase().includes(opts.subject.toLowerCase()));
  const { data: marks } = await byIds<any>(keep.map(x => x.id), (chunk, f, t) => {
    let q = db.from('exam_marks').select('id, sheet_id, student_id, marks, code').in('sheet_id', chunk);
    if (opts.studentIds) q = q.in('student_id', opts.studentIds.slice(0, 150));
    return q.order('id').range(f, t);
  });
  const sheet = new Map(keep.map(x => [x.id, x]));
  return marks.map(m => {
    const sh = sheet.get(m.sheet_id)!;
    const a = A.get(sh.assessment_id);
    return { studentId: m.student_id, marks: m.marks === null ? null : Number(m.marks), code: m.code, max: Number(sh.max_marks) || null, assessment: a?.name || 'Assessment', kind: a?.kind || '', heldOn: a?.held_from || null, subject: SB.get(sh.class_subject_id) || 'Subject', cls: CL.get(sh.class_id) || '' };
  });
}

// ── Staff lookups ────────────────────────────────────────────────────────────
type Runner = (c: StaffCtx, args: Record<string, string>) => Promise<string>;

const student: Runner = async (c, args) => {
  const k = resolveStudent(c, args.student);
  if (!k) return 'STUDENT: not found among the students this person can see. Ask them to check the name.';
  const { from, to } = range(args, 56);
  const t = S(c, k);
  const out: string[] = [`STUDENT ${t} · ${displayClass(k.cls)} · ${from} to ${to}`];
  const academic = isTeacher(c) ? c.viewer.classes.includes(normCls(k.cls)) : has(c, 'academics.read');
  const href = (teacher: string, office: string) => (isTeacher(c) ? teacher : office);
  const need = `class:${k.cls}`;
  if (academic) {
    const m = await masteryWeeks(c.db, c.me.schoolId, [k.id], from);
    const n = c.sources.add({ label: 'Mastery Tracker', detail: `${k.name} · trend`, href: href('/teacher/mastery', '/admin/academic'), need });
    out.push(`MASTERY BY WEEK [${n}]:\n${seriesText(m.series)}\nWeakest chapters now: ${m.weakest.slice(0, 5).map(w => `${w.subject} ${w.name} ${round(w.score)}`).join('; ') || 'none'}`);
    const work = await workFor(c.db, c.me.schoolId, [k.cls], from, to);
    const mine = work.filter(a => !a.assigned_student_ids?.length || a.assigned_student_ids.includes(k.id));
    const handed = mine.filter(a => a.subs.some((x: any) => x.student_id === k.id));
    const scored = handed.map(a => a.subs.find((x: any) => x.student_id === k.id)).filter((x: any) => x && x.score !== null && Number(x.max_score) > 0);
    const missing = mine.filter(a => a.due_date < istDay() && !a.subs.some((x: any) => x.student_id === k.id));
    const n2 = c.sources.add({ label: 'Homework desk', detail: `${k.name} · ${short(from)}–${short(to)}`, href: href('/teacher/homework', '/admin/academic'), need });
    out.push(`HOMEWORK [${n2}]: handed in ${handed.length} of ${mine.length}; average on handed-in work ${round(mean(scored.map((x: any) => (Number(x.score) / Number(x.max_score)) * 100)))}. Missing (overdue): ${missing.slice(0, 8).map(a => `${a.subject} "${a.title}" due ${a.due_date}`).join('; ') || 'none'}.`);
  }
  if (isTeacher(c) ? c.viewer.classes.includes(normCls(k.cls)) : has(c, 'attendance.read')) {
    const rows = await attendanceFor(c.db, c.me.schoolId, from, to, { studentId: k.id });
    const ab = rows.filter(r => r.status === 'absent');
    const n = c.sources.add({ label: 'Attendance register', detail: `${k.name} · ${short(from)}–${short(to)}`, href: href('/teacher/attendance', '/admin/attendance'), need });
    out.push(`ATTENDANCE [${n}]: ${rows.length} days marked, present ${pct(rows.filter(r => r.status !== 'absent').length, rows.length)}, absent ${ab.length}${ab.length ? ` (${ab.slice(-10).map(r => short(r.day)).join(', ')})` : ''}, late ${rows.filter(r => r.status === 'late').length}.`);
  }
  if (has(c, 'fees.read') && c.admin) {
    const f = c.admin.fees.families.find(x => x.studentId === k.id);
    const n = c.sources.add({ label: 'Fees', detail: `${k.name} · ledger`, href: '/admin/fees', need: 'perm:fees.read' });
    out.push(f ? `FEES [${n}]: billed ${inr(f.billed)}, paid ${inr(f.paid)}, outstanding ${inr(f.outstanding)}, overdue ${inr(f.overdue)}${f.maxDaysOverdue ? ` (oldest ${f.maxDaysOverdue} days)` : ''}; reminders sent ${f.remindersSent}${f.lastReminderAt ? `, last ${f.lastReminderAt.slice(0, 10)}` : ''}; paid late ${f.lateHistory.late} of ${f.lateHistory.settled} times.` : `FEES [${n}]: no invoices this session.`);
  }
  if (isTeacher(c) ? c.viewer.classes.includes(normCls(k.cls)) : has(c, 'exams.read')) {
    const ex = await examRows(c.db, c.me.schoolId, { studentIds: [k.id], classes: [k.cls] });
    if (ex.length) {
      const n = c.sources.add({ label: 'Exams', detail: `${k.name} · marks`, href: href('/teacher/exams', '/admin/exams'), need });
      out.push(`EXAM MARKS [${n}]: ${ex.slice(0, 14).map(e => `${e.assessment} ${e.subject} ${e.marks === null ? (e.code || 'not entered') : `${e.marks}/${e.max ?? '?'}`}`).join('; ')}`);
    }
  }
  if (isTeacher(c) && c.viewer.classes.includes(normCls(k.cls))) {
    const { data: w } = await c.db.from('wellness_logs').select('energy, created_at').eq('student_id', k.id).gte('created_at', new Date(Date.now() - 14 * DAY_MS).toISOString()).not('energy', 'is', null).limit(60);
    if (w?.length) {
      const n = c.sources.add({ label: 'Student wellness', detail: `${k.name} · energy only`, href: '/teacher/wellness', need });
      out.push(`WELLNESS [${n}] (energy 1–5 only, journals private): ${w.length} check-ins in 14 days, ${w.filter(x => (x.energy ?? 5) <= 2).length} low.`);
    }
  }
  if (out.length === 1) out.push('Nothing about this student is within this person\'s role.');
  return out.join('\n');
};

const klass: Runner = async (c, args) => {
  const cls = resolveClass(c, args.class);
  if (!cls || !mayReadClass(c, cls, 'academics.read')) return `CLASS: "${args.class || ''}" is not a class this person can see.`;
  const kids = roster(c).filter(k => normCls(k.cls) === normCls(cls));
  const from = daysAgo(56), to = istDay();
  const need = `class:${cls}`;
  const href = (t: string, o: string) => (isTeacher(c) ? t : o);
  const m = await masteryWeeks(c.db, c.me.schoolId, kids.map(k => k.id), from, args.subject);
  const n1 = c.sources.add({ label: 'Mastery Tracker', detail: `${displayClass(cls)}${args.subject ? ` · ${args.subject}` : ''} · trend`, href: href('/teacher/mastery', '/admin/academic'), need });
  const work = await workFor(c.db, c.me.schoolId, [cls], daysAgo(42), to, { subject: args.subject });
  const byWeek = new Map<string, { due: number; done: number }>();
  for (const a of work.filter(x => x.due_date <= to)) {
    const size = a.assigned_student_ids?.length || kids.length;
    const w = byWeek.get(weekOf(a.due_date)) ?? { due: 0, done: 0 };
    w.due += size; w.done += new Set(a.subs.map((x: any) => x.student_id)).size; byWeek.set(weekOf(a.due_date), w);
  }
  const n2 = c.sources.add({ label: 'Homework desk', detail: `${displayClass(cls)} · 6 weeks`, href: href('/teacher/homework', '/admin/academic'), need });
  const att = await attendanceFor(c.db, c.me.schoolId, daysAgo(42), to, { classes: [cls] });
  const attWeek = new Map<string, { n: number; present: number }>();
  const absences = new Map<string, number>();
  for (const r of att) {
    const w = attWeek.get(weekOf(r.day)) ?? { n: 0, present: 0 };
    w.n++; if (r.status !== 'absent') w.present++; attWeek.set(weekOf(r.day), w);
    if (r.status === 'absent') absences.set(r.student_id, (absences.get(r.student_id) || 0) + 1);
  }
  const n3 = c.sources.add({ label: 'Attendance register', detail: `${displayClass(cls)} · 6 weeks`, href: href('/teacher/attendance', '/admin/attendance'), need });
  const missed = new Map<string, number>();
  for (const a of work.filter(x => x.due_date < to)) {
    const done = new Set(a.subs.map((x: any) => x.student_id));
    for (const k of kids) if ((!a.assigned_student_ids?.length || a.assigned_student_ids.includes(k.id)) && !done.has(k.id)) missed.set(k.id, (missed.get(k.id) || 0) + 1);
  }
  const lowest = kids.map(k => ({ k, tml: m.perStudent.get(k.id) ?? null })).sort((a, b) => (a.tml ?? 101) - (b.tml ?? 101)).slice(0, 12);
  return [
    `CLASS ${displayClass(cls)} · ${kids.length} students${args.subject ? ` · ${args.subject}` : ''}`,
    `MASTERY BY WEEK [${n1}]:\n${seriesText(m.series)}`,
    `WEAKEST CHAPTERS NOW [${n1}]: ${m.weakest.slice(0, 6).map(w => `${w.subject} ${w.name} ${round(w.score)} (${w.n} students)`).join('; ') || 'no evidence'}`,
    `HOMEWORK HANDED IN BY WEEK [${n2}]: ${[...byWeek].sort().map(([w, x]) => `${short(w)} ${pct(x.done, x.due)}`).join(', ') || 'no work due'}`,
    `ATTENDANCE BY WEEK [${n3}]: ${[...attWeek].sort().map(([w, x]) => `${short(w)} ${pct(x.present, x.n)}`).join(', ') || 'no register marked'}`,
    `STUDENTS, LOWEST MASTERY FIRST [${n1}][${n2}][${n3}]:\n${lowest.map(({ k, tml }) => `- ${S(c, k)} mastery ${round(tml)}, missed ${missed.get(k.id) || 0} tasks, absent ${absences.get(k.id) || 0} days`).join('\n')}`,
  ].join('\n');
};

const attendance: Runner = async (c, args) => {
  const { from, to } = range(args, 14);
  const one = args.class ? resolveClass(c, args.class) : null;
  if (args.class && (!one || !mayReadClass(c, one, 'attendance.read'))) return `ATTENDANCE: "${args.class}" is not a class this person can see.`;
  const classes = one ? [one] : classesSeen(c, 'attendance.read');
  if (!classes.length) return 'ATTENDANCE: no classes in this person\'s view.';
  const rows = await attendanceFor(c.db, c.me.schoolId, from, to, { classes });
  const n = c.sources.add({ label: 'Attendance register', detail: `${one ? displayClass(one) : 'all classes'} · ${short(from)}–${short(to)}`, href: isTeacher(c) ? '/teacher/attendance' : '/admin/attendance', need: one ? `class:${one}` : 'self|perm:attendance.read' });
  const byClass = new Map<string, { days: Set<string>; n: number; present: number }>();
  const absent = new Map<string, number>();
  const byDay = new Map<string, { n: number; present: number }>();
  for (const r of rows) {
    const k = displayClass(r.class_name);
    const x = byClass.get(k) ?? { days: new Set(), n: 0, present: 0 };
    x.days.add(r.day); x.n++; if (r.status !== 'absent') x.present++; byClass.set(k, x);
    const d = byDay.get(r.day) ?? { n: 0, present: 0 }; d.n++; if (r.status !== 'absent') d.present++; byDay.set(r.day, d);
    if (r.status === 'absent') absent.set(r.student_id, (absent.get(r.student_id) || 0) + 1);
  }
  const kids = new Map(roster(c).map(k => [k.id, k]));
  const most = [...absent].sort((a, b) => b[1] - a[1]).slice(0, 10).filter(([id]) => kids.has(id));
  return [
    `ATTENDANCE [${n}] ${short(from)}–${short(to)}:`,
    `By class: ${[...byClass].sort().map(([k, x]) => `${k} ${pct(x.present, x.n)} over ${x.days.size} days`).join('; ') || 'nothing marked'}`,
    one || classes.length <= 3 ? `By day: ${[...byDay].sort().slice(-20).map(([d, x]) => `${short(d)} ${pct(x.present, x.n)}`).join(', ')}` : '',
    `Absent most: ${most.map(([id, k]) => `${S(c, kids.get(id)!)} ${displayClass(kids.get(id)!.cls)} ${k} days`).join(', ') || 'nobody'}`,
  ].filter(Boolean).join('\n');
};

const homework: Runner = async (c, args) => {
  const weeks = Math.min(12, Math.max(1, Number(args.weeks) || 3));
  const one = args.class ? resolveClass(c, args.class) : null;
  if (args.class && (!one || !mayReadClass(c, one, 'academics.read'))) return `HOMEWORK: "${args.class}" is not a class this person can see.`;
  const classes = one ? [one] : classesSeen(c, 'academics.read');
  const to = istDay(new Date(Date.now() + 14 * DAY_MS));
  const work = await workFor(c.db, c.me.schoolId, classes, daysAgo(weeks * 7), to, { teacherId: isTeacher(c) ? c.me.id : undefined, subject: args.subject });
  const n = c.sources.add({ label: 'Homework desk', detail: `${one ? displayClass(one) : 'all classes'} · ${weeks} weeks`, href: isTeacher(c) ? '/teacher/homework' : '/admin/academic', need: one ? `class:${one}` : 'self|perm:academics.read' });
  const size = new Map<string, number>();
  for (const k of roster(c)) size.set(normCls(k.cls), (size.get(normCls(k.cls)) || 0) + 1);
  const today = istDay();
  const lines = work.slice(-15).map(a => {
    const total = a.assigned_student_ids?.length || size.get(normCls(a.class)) || 0;
    const done = new Set(a.subs.map((x: any) => x.student_id)).size;
    const toMark = a.subs.filter((x: any) => x.score === null && !x.teacher_approved).length;
    return `- ${a.type} "${a.title}" · ${displayClass(a.class)} ${a.subject} · due ${a.due_date}${a.due_date < today ? ' (past)' : ''} · handed in ${done}/${total} · to mark ${toMark}`;
  });
  return `HOMEWORK [${n}] (${weeks} weeks back, upcoming 2 weeks):\n${lines.join('\n') || '- nothing set'}`;
};

const fees: Runner = async (c, args) => {
  if (!has(c, 'fees.read') || !c.admin) return 'FEES: outside this person\'s role.';
  const F = c.admin.fees;
  const minDays = Math.max(0, Number(args.min_days) || 0);
  const g = normCls(args.class);
  const fam = F.families.filter(f => f.overdue > 0 && f.maxDaysOverdue >= minDays && (!g || normCls(f.cls) === g || normCls(f.cls).replace(/[a-z]+$/, '') === g));
  const byClass = new Map<string, { n: number; amt: number; quiet: number }>();
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
  for (const f of fam) {
    const k = displayClass(f.cls);
    const x = byClass.get(k) ?? { n: 0, amt: 0, quiet: 0 };
    x.n++; x.amt += f.overdue; if (!f.lastReminderAt || f.lastReminderAt < monthAgo) x.quiet++; byClass.set(k, x);
  }
  const n = c.sources.add({ label: 'Fees · Ageing', detail: `${F.session}${minDays ? ` · ${minDays}+ days` : ''}${g ? ` · ${args.class}` : ''}`, href: '/admin/fees', need: 'perm:fees.read' });
  const month = istDay().slice(0, 7);
  return [
    `FEES [${n}] (${F.session}): billed ${inr(F.totals.billed)}, collected ${inr(F.totals.collected)}, outstanding ${inr(F.totals.outstanding)}, overdue ${inr(F.totals.overdue)}. Collected this month ${inr(F.receipts.filter(r => !r.voided && r.paidOn.slice(0, 7) === month).reduce((s2, r) => s2 + r.amount, 0))}.`,
    `Ageing: ${F.ageing.map(b => `${b.label} ${b.families} families ${inr(b.amount)}`).join('; ')}`,
    `Overdue by class${minDays ? ` (${minDays}+ days)` : ''}: ${[...byClass].sort((a, b) => b[1].amt - a[1].amt).map(([k, x]) => `${k} ${x.n} families ${inr(x.amt)}, ${x.quiet} not reminded in 30 days`).join('; ') || 'none'}`,
    `Most overdue: ${fam.sort((a, b) => b.overdue - a.overdue).slice(0, 10).map(f => `${S(c, { id: f.studentId, name: f.name })} ${displayClass(f.cls)} ${inr(f.overdue)} (${f.maxDaysOverdue} days, ${f.remindersSent} reminders)`).join('; ') || 'none'}`,
  ].join('\n');
};

const admissions: Runner = async (c, args) => {
  if (!has(c, 'admissions.read') || !c.admin) return 'ADMISSIONS: outside this person\'s role.';
  const P = c.admin.admissions;
  const grade = Number(args.grade) || null;
  const stage = (args.stage || '').toLowerCase();
  const apps = P.applicants.filter(a => (!grade || a.grade === grade) && (!stage || String(a.stage).toLowerCase().includes(stage)));
  const n = c.sources.add({ label: 'Admissions', detail: `${P.session}${grade ? ` · Grade ${grade}` : ''}`, href: '/admin/admissions', need: 'perm:admissions.read' });
  const byStage = new Map<string, number>();
  for (const a of apps) byStage.set(String(a.stage), (byStage.get(String(a.stage)) || 0) + 1);
  return [
    `ADMISSIONS [${n}] (${P.session}): ${P.total} applicants, ${P.enrolled} enrolled, conversion ${round(P.conversion)}${P.leak ? `, biggest drop ${P.leak.fromLabel} → ${P.leak.toLabel} (${round(P.leak.rate)} move on)` : ''}.`,
    `Funnel: ${P.funnel.map(f => `${f.stage} ${f.reached}`).join(' → ')}`,
    `By grade: ${P.byGrade.map(g2 => `Grade ${g2.grade}: ${g2.total} applied, ${g2.enrolled} enrolled, ${g2.open} open`).join('; ')}`,
    `${grade || stage ? 'Matching' : 'All'} by stage: ${[...byStage].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    `Idle too long: ${P.stale.filter(a => apps.includes(a)).slice(0, 10).map(a => `${personToken(c.book, 'S', a.id, a.name)} Grade ${a.grade} in ${a.stage} since ${a.stageChangedAt.slice(0, 10)}`).join('; ') || 'none'}`,
  ].join('\n');
};

const staff: Runner = async (c, args) => {
  if (!has(c, 'workforce.read') || !c.admin) return 'STAFF: outside this person\'s role.';
  const W = c.admin.workforce;
  const p = c.book.people.get(tokOnly(args.teacher));
  const list = p ? W.teachers.filter(t => t.id === p.id) : W.teachers;
  const T = (id: string, name: string) => personToken(c.book, 'T', id, name);
  const n = c.sources.add({ label: 'Staff & leave', detail: p ? p.name : 'all teachers', href: '/admin/staff', need: 'perm:workforce.read' });
  return [
    `STAFF [${n}]: ${W.teachers.length} teachers, ${W.backlog} submissions waiting school-wide, ${W.pendingLeave.length} leave requests pending.`,
    ...list.sort((a, b) => b.backlog - a.backlog).slice(0, 15).map(t => `- ${T(t.id, t.name)} · ${t.classes.join(', ') || 'no classes'} · ${t.subjects.join(', ')} · backlog ${t.backlog}${t.oldestPendingDays ? ` (oldest ${t.oldestPendingDays} days)` : ''} · graded ${t.graded30} and posted ${t.posted30} in 30 days · class mastery ${round(t.tml)}${t.delta !== null ? ` (${t.delta >= 0 ? '+' : ''}${Math.round(t.delta)})` : ''}${t.onLeaveToday ? ' · ON LEAVE TODAY' : ''}`),
    `Leave pending: ${W.pendingLeave.filter(l => !p || l.staffId === p.id).slice(0, 8).map(l => `${T(l.staffId, l.staffName)} ${l.type} ${l.from}${l.to !== l.from ? ` to ${l.to}` : ''}`).join('; ') || 'none'}`,
  ].join('\n');
};

const exams: Runner = async (c, args) => {
  const one = args.class ? resolveClass(c, args.class) : null;
  if (args.class && (!one || !mayReadClass(c, one, 'exams.read'))) return `EXAMS: "${args.class}" is not a class this person can see.`;
  const classes = one ? [one] : classesSeen(c, 'exams.read');
  if (!classes.length) return 'EXAMS: no classes in this person\'s view.';
  const rows = await examRows(c.db, c.me.schoolId, { classes, subject: args.subject });
  const n = c.sources.add({ label: 'Exams', detail: `${one ? displayClass(one) : 'all classes'}${args.subject ? ` · ${args.subject}` : ''}`, href: isTeacher(c) ? '/teacher/exams' : '/admin/exams', need: one ? `class:${one}` : 'self|perm:exams.read' });
  const kids = new Map(roster(c).map(k => [k.id, k]));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const k = `${r.assessment} · ${displayClass(r.cls)} · ${r.subject}`; groups.set(k, [...(groups.get(k) || []), r]); }
  const lines = [...groups].slice(0, 20).map(([k, rs]) => {
    const p = rs.filter(r => r.marks !== null && r.max).map(r => ({ r, v: (r.marks! / r.max!) * 100 }));
    const low = p.filter(x => x.v < 33).filter(x => kids.has(x.r.studentId));
    return `- ${k}: ${p.length} marked, average ${round(mean(p.map(x => x.v)))}, highest ${round(Math.max(...p.map(x => x.v)))}, below 33%: ${low.length}${low.length ? ` (${low.slice(0, 6).map(x => S(c, kids.get(x.r.studentId)!)).join(', ')})` : ''}`;
  });
  return `EXAM MARKS [${n}]:\n${lines.join('\n') || '- no marks entered yet'}`;
};

async function liveVersion(db: SupabaseClient, schoolId: string) {
  const { data } = await db.from('timetable_versions').select('id').eq('school_id', schoolId).eq('status', 'published').lte('effective_from', istDay()).order('effective_from', { ascending: false }).limit(1);
  return data?.[0]?.id as string | undefined;
}
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const timetable: Runner = async (c, args) => {
  const ver = await liveVersion(c.db, c.me.schoolId);
  if (!ver) return 'TIMETABLE: no published timetable.';
  const p = c.book.people.get(tokOnly(args.teacher));
  const cls = args.class ? resolveClass(c, args.class) ?? args.class : null;
  const teacherId = p?.id ?? (!cls && isTeacher(c) ? c.me.id : null);
  if (!cls && !teacherId) return 'TIMETABLE: say which class or teacher.';
  // bounded: .limit(400) below (one class or teacher in one timetable version)
  let q = c.db.from('timetable_slots').select('weekday, period_no, subject, class, teacher_id, group_label').eq('version_id', ver);
  q = teacherId ? q.eq('teacher_id', teacherId) : q.eq('class_key', normCls(cls));
  const { data } = await q.order('weekday').order('period_no').limit(400);
  let rows = data || [];
  if (!teacherId && !rows.length && cls) {
    const { data: all } = await c.db.from('timetable_slots').select('weekday, period_no, subject, class, teacher_id, group_label').eq('version_id', ver).limit(5000);
    rows = (all || []).filter(r => normCls(r.class) === normCls(cls));
  }
  const ids = [...new Set(rows.map(r => r.teacher_id).filter(Boolean))];
  const { data: who } = ids.length ? await c.db.from('users').select('id, name').in('id', ids.slice(0, 200)).limit(200) : { data: [] as any[] };
  const name = new Map((who || []).map(u => [u.id, u.name]));
  const n = c.sources.add({ label: 'Timetable', detail: teacherId ? (p?.name || 'your week') : displayClass(cls), href: isTeacher(c) ? '/teacher/schedule' : '/admin/schedule', need: 'staff' });
  const byDay = new Map<number, string[]>();
  for (const r of rows) byDay.set(r.weekday, [...(byDay.get(r.weekday) || []), `P${r.period_no} ${r.subject}${teacherId ? ` ${displayClass(r.class)}` : r.teacher_id ? ` (${personToken(c.book, 'T', r.teacher_id, name.get(r.teacher_id) || 'Teacher')})` : ''}`]);
  return `TIMETABLE [${n}] ${teacherId ? `for ${teacherId === c.me.id ? 'you' : personToken(c.book, 'T', teacherId, p?.name || '')}` : displayClass(cls)}:\n${[...byDay].sort((a, b) => a[0] - b[0]).map(([d, xs]) => `- ${DAYS[d] || d}: ${xs.join(', ')}`).join('\n') || '- no periods'}`;
};

async function calendarText(db: SupabaseClient, schoolId: string, args: Record<string, string>, sources: Sources, href: string) {
  const today = istDay();
  const from = isDay(args.from) ? args.from : today;
  const to = isDay(args.to) && args.to >= from ? args.to : istDay(new Date(Date.parse(`${from}T00:00:00Z`) + 60 * DAY_MS));
  // bounded: one school's calendar over a window of weeks (a few dozen events)
  const { data } = await db.from('academic_events').select('title, kind, starts_on, ends_on, suspends_classes').eq('school_id', schoolId).gte('ends_on', from).lte('starts_on', to).order('starts_on').limit(80);
  const n = sources.add({ label: 'School calendar', detail: `${short(from)}–${short(to)}`, href, need: 'school' });
  return `CALENDAR [${n}] ${from} to ${to}:\n${(data || []).map(e => `- ${e.starts_on}${e.ends_on !== e.starts_on ? ` to ${e.ends_on}` : ''}: ${e.title} (${e.kind}${e.suspends_classes ? ', no classes' : ''})`).join('\n') || '- nothing on the calendar'}`;
}
const calendar: Runner = (c, args) => calendarText(c.db, c.me.schoolId, args, c.sources, isTeacher(c) ? '/teacher/schedule' : '/admin/schedule');

const STAFF_RUNNERS: Partial<Record<PlannedLookup['tool'], Runner>> = { student, class: klass, attendance, homework, fees, admissions, staff, exams, timetable, calendar };

export async function runStaffLookups(c: StaffCtx, plan: PlannedLookup[]): Promise<{ text: string; labels: string[] }> {
  const parts = await Promise.all(plan.map(async l => {
    const run = STAFF_RUNNERS[l.tool];
    if (!run) return null;
    try { return { text: await run(c, l.args), label: lookupLabel(c, l) }; }
    catch (e) { console.warn('[ask] lookup', l.tool, e instanceof Error ? e.message : e); return { text: `${TOOLS[l.tool].label.toUpperCase()}: could not be read just now.`, label: TOOLS[l.tool].label }; }
  }));
  const ok = parts.filter((p): p is { text: string; label: string } => !!p);
  return { text: ok.map(p => p.text).join('\n\n'), labels: ok.map(p => p.label) };
}

function lookupLabel(c: StaffCtx, l: PlannedLookup): string {
  const who = l.args.student ? c.book.people.get(tokOnly(l.args.student))?.name : l.args.teacher ? c.book.people.get(tokOnly(l.args.teacher))?.name : null;
  const bits = [who, l.args.class ? displayClass(l.args.class) : null, l.args.subject].filter(Boolean);
  return `${TOOLS[l.tool].label}${bits.length ? `, ${bits.join(' ')}` : ''}`;
}

// ── Parent lookups ───────────────────────────────────────────────────────────
type PRunner = (c: ParentCtx, args: Record<string, string>) => Promise<string>;
const kidOf = (c: ParentCtx, arg: string | undefined) => {
  const id = c.childOf(tokOnly(arg)) ?? (c.view.children.length === 1 ? c.view.children[0].id : null);
  return id && c.viewer.childIds.includes(id) ? c.view.children.find(k => k.id === id) ?? null : null;
};

const child: PRunner = async (c, args) => {
  const k = kidOf(c, args.child);
  if (!k) return 'CHILD: say which child.';
  const m = await masteryWeeks(c.db, c.viewer.schoolId, [k.id], daysAgo(84));
  const n = c.sources.add({ label: `${k.firstName} · Progress`, detail: 'mastery by week', href: '/parent/progress', need: `child:${k.id}` });
  return `MASTERY BY WEEK for ${c.tokenOfChild(k.id)} [${n}]:\n${seriesText(m.series)}\nWeakest chapters now: ${m.weakest.slice(0, 5).map(w => `${w.subject} ${w.name} ${round(w.score)}`).join('; ') || 'none'}`;
};
const childAttendance: PRunner = async (c, args) => {
  const k = kidOf(c, args.child);
  if (!k) return 'ATTENDANCE: say which child.';
  const { from, to } = range(args, 30);
  const days = k.attendance.days.filter(d => d.day >= from && d.day <= to).sort((a, b) => a.day.localeCompare(b.day));
  const n = c.sources.add({ label: `${k.firstName} · Attendance`, detail: `${short(from)}–${short(to)}`, href: '/parent/attendance', need: `child:${k.id}` });
  const off = days.filter(d => d.status !== 'present');
  return `ATTENDANCE for ${c.tokenOfChild(k.id)} [${n}] ${from} to ${to}: ${days.length} days marked, present ${pct(days.filter(d => d.status !== 'absent').length, days.length)}. Not present: ${off.map(d => `${short(d.day)} ${d.status}`).join(', ') || 'none'}. Session so far: ${k.attendance.pct ?? '—'}% (${k.attendance.absent} absent, ${k.attendance.late} late).`;
};
const childTimetable: PRunner = async (c, args) => {
  const k = kidOf(c, args.child);
  if (!k) return 'TIMETABLE: say which child.';
  if (!k.timetable) return `TIMETABLE for ${c.tokenOfChild(k.id)}: the school hasn't published one.`;
  const n = c.sources.add({ label: `${k.firstName} · Timetable`, detail: displayClass(k.cls), href: '/parent/schoolwork', need: `child:${k.id}` });
  const byDay = new Map<number, string[]>();
  for (const l of [...k.timetable.lessons].sort((a, b) => a.period - b.period)) byDay.set(l.weekday, [...(byDay.get(l.weekday) || []), `P${l.period} ${l.subject}`]);
  return `TIMETABLE for ${c.tokenOfChild(k.id)} [${n}]:\n${[...byDay].sort((a, b) => a[0] - b[0]).map(([d, xs]) => `- ${DAYS[d] || d}: ${xs.join(', ')}`).join('\n')}`;
};
const parentCalendar: PRunner = (c, args) => calendarText(c.db, c.viewer.schoolId, args, c.sources, '/parent');

const PARENT_RUNNERS: Partial<Record<PlannedLookup['tool'], PRunner>> = { child, child_attendance: childAttendance, child_timetable: childTimetable, calendar: parentCalendar };

export async function runParentLookups(c: ParentCtx, plan: PlannedLookup[]): Promise<{ text: string; labels: string[] }> {
  const parts = await Promise.all(plan.map(async l => {
    const run = PARENT_RUNNERS[l.tool];
    if (!run) return null;
    const k = l.args.child ? kidOf(c, l.args.child) : null;
    try { return { text: await run(c, l.args), label: `${TOOLS[l.tool].label}${k ? `, ${k.firstName}` : ''}` }; }
    catch (e) { console.warn('[ask] parent lookup', l.tool, e instanceof Error ? e.message : e); return null; }
  }));
  const ok = parts.filter((p): p is { text: string; label: string } => !!p);
  return { text: ok.map(p => p.text).join('\n\n'), labels: ok.map(p => p.label) };
}
