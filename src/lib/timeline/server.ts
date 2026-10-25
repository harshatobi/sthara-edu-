import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { accessOf } from '@/lib/admin/serverAuth';
import { pageAll } from '@/lib/ops/page';
import { schoolSettings } from '@/lib/students/server';
import { currentSession, sessionSettings, sessionStartDay } from '@/lib/students/register';
import { canSeeKind } from '@/lib/students/documents';
import { normClass, teachingScope } from '@/lib/teacher/scope';
import { emptyRows, officeLens, parentLens, sees, sessionEnd, studentLens, teacherLens, type Lens, type Rows } from './rules';

/**
 * The unified timeline (brief 08), server side: who is looking, what their lens allows, and only those sources
 * loaded. Every source is paged or bounded (the database API stops at 1,000 rows without saying so); attendance comes
 * summarised per month from the database (student_attendance_timeline).
 */

type Db = SupabaseClient;
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

export interface Viewer { id: string; name: string; role: string; schoolId: string }
export interface Subject { id: string; schoolId: string; userId: string | null; fullName: string; status: string; previousSchool: string | null; previousClass: string | null; previousTcNo: string | null; previousStatus: string | null; admittedOn: string | null; admissionNo: string | null }
/** Office: which documents the viewer may see (register readers all but medical, health.read the medical kinds). */
interface DocCan { students: boolean; health: boolean }

async function subjectOf(db: Db, schoolId: string, studentId: string): Promise<Subject | null> {
  const { data: s } = await db.from('students').select('id, school_id, user_id, full_name, status, previous_school, previous_class, previous_tc_no, previous_status, admitted_on, admission_no')
    .eq('id', studentId).eq('school_id', schoolId).maybeSingle();
  if (!s || s.status === 'cancelled') return null;
  return {
    id: s.id, schoolId: s.school_id, userId: s.user_id, fullName: s.full_name, status: s.status, previousSchool: s.previous_school, previousClass: s.previous_class,
    previousTcNo: s.previous_tc_no, previousStatus: s.previous_status, admittedOn: s.admitted_on, admissionNo: s.admission_no,
  };
}

/** The student's class today: this session's enrolment, else the class on their login. */
async function classToday(db: Db, s: Subject, session: string): Promise<string | null> {
  const { data: e } = await db.from('enrolments').select('class_name, starts_on').eq('student_id', s.id).eq('session', session).is('ends_on', null).order('starts_on', { ascending: false }).limit(1);
  if (e?.[0]?.class_name) return e[0].class_name;
  if (!s.userId) return null;
  const { data: u } = await db.from('users').select('student_class').eq('id', s.userId).maybeSingle();
  return u?.student_class ?? null;
}

export type Access_ = { ok: true; lens: Lens; subject: Subject; docCan: DocCan | null; viewer: Viewer } | { ok: false; error: string; status: number };

/**
 * May this signed-in user see this student's timeline, and through which lens? Office accounts by their roles;
 * teachers by class (class teacher) or subject; a parent only a verified child; a student only themself.
 */
export async function timelineAccess(db: Db, userId: string, studentId: string): Promise<Access_> {
  const { data: me } = await db.from('users').select('id, name, role, school_id, teacher_class, teacher_subject, assignments').eq('id', userId).maybeSingle();
  if (!me?.school_id) return fail('Unauthorized', 401);
  const viewer: Viewer = { id: me.id, name: me.name || 'Someone', role: me.role, schoolId: me.school_id };
  const subject = await subjectOf(db, me.school_id, studentId);
  if (!subject) return fail('Student not found', 404);
  const nope = fail('Not your student.', 403);

  if (me.role === 'admin') {
    const a = await accessOf(db, me.id, me.school_id);
    const lens = officeLens(a);
    if (lens) return { ok: true, lens, subject, viewer, docCan: { students: a.can('students.read'), health: a.can('health.read') } };
    // An office account that also teaches falls through to its teaching scope.
  }
  if (me.role === 'teacher' || me.role === 'admin') {
    const settings = await schoolSettings(db, me.school_id);
    const cls = await classToday(db, subject, currentSession(settings));
    const lens = teacherLens({ teacherClass: me.teacher_class, scope: teachingScope(me) }, cls, normClass);
    return lens ? { ok: true, lens, subject, viewer, docCan: null } : nope;
  }
  if (me.role === 'parent') {
    if (!subject.userId) return nope;
    const { data: g } = await db.from('guardians').select('id').eq('parent_id', me.id).eq('student_id', subject.userId).eq('verified', true).maybeSingle();
    return g ? { ok: true, lens: parentLens(), subject, viewer, docCan: null } : nope;
  }
  if (me.role === 'student') return subject.userId === me.id ? { ok: true, lens: studentLens(), subject, viewer, docCan: null } : nope;
  return nope;
}

/** The register id of a login (parents and students pick by their child's or their own login). */
export async function registerIdOf(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from('students').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

const must = <T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data || [];
};

/**
 * The rows the lens allows. With `session`, the heavy sources (attendance, mastery, homework, wellness) are read for
 * that year only; the summary needs every year.
 */
export async function loadRows(db: Db, a: { lens: Lens; subject: Subject; docCan: DocCan | null; viewer: Viewer }, session?: string): Promise<Rows> {
  const { lens, subject: s } = a;
  const schoolId = s.schoolId;
  const settings = await schoolSettings(db, schoolId);
  const startMonth = sessionSettings(settings).startMonth;
  const from = session ? sessionStartDay(session, startMonth) : null;
  const to = session ? sessionEnd(session, startMonth) : null;
  const uid = s.userId;
  const on = (x: Parameters<typeof sees>[1]) => sees(lens, x) && !!uid;
  const none = Promise.resolve({ data: [] as any[], error: null });

  const enrolments = must(await db.from('enrolments').select('session, class_name, roll_no, starts_on, ends_on, end_reason, outcome, published_at')
    .eq('student_id', s.id).order('session').order('starts_on').limit(200), 'enrolments');
  const classes = [...new Set(enrolments.map(e => e.class_name).filter(Boolean) as string[])];
  if (uid) {
    const { data: u } = await db.from('users').select('student_class').eq('id', uid).maybeSingle();
    if (u?.student_class && !classes.some(c => normClass(c) === normClass(u.student_class))) classes.push(u.student_class);
  }
  const classKeys = new Set(classes.map(c => normClass(c)));
  const grades = [...new Set(classes.map(c => String(c).match(/\d{1,2}/)?.[0]).filter((g): g is string => !!g))];

  const [att, cards, tml, work, subs, invoices, kirti, certs, docs, health, discipline, incidents, counselling, wellness] = await Promise.all([
    on('attendance') ? db.rpc('student_attendance_timeline', { p_school: schoolId, p_student: uid, p_from: from, p_to: to ? isoDay(new Date(new Date(`${to}T00:00:00Z`).getTime() - 86_400_000)) : null }) : Promise.resolve({ data: null, error: null }),
    // bounded: a student's published report cards, a handful a year
    on('results') ? db.from('report_cards').select('published_at, term:snapshot->term, aggregate:snapshot->aggregate, result:snapshot->result, session:snapshot->>session, subjects:snapshot->subjects')
      .eq('school_id', schoolId).eq('student_id', uid).is('superseded_at', null).eq('held', false).not('published_at', 'is', null).limit(300) : none,
    // The whole history up to the year asked for: a year's mastery carries its earlier chapters.
    on('tml') ? pageAll<any>((f, t) => {
      const q = db.from('tml_scores').select('subject, topic_name, score, computed_at').eq('school_id', schoolId).eq('student_id', uid);
      return (to ? q.lt('computed_at', to) : q).order('computed_at').order('id').range(f, t);
    }, 50_000) : none,
    on('homework') && classes.length ? pageAll<any>((f, t) => {
      let q = db.from('assignments').select('id, subject, title, due_date, created_at, class, status, assigned_student_ids').eq('school_id', schoolId).neq('status', 'draft');
      if (grades.length && grades.length === classes.length) q = q.or(grades.map(g => `class.ilike.*${g}*`).join(','));
      if (from && to) q = q.or(`and(due_date.gte.${from},due_date.lt.${to}),and(due_date.is.null,created_at.gte.${from},created_at.lt.${to})`);
      return q.order('created_at').order('id').range(f, t);
    }, 50_000) : none,
    on('homework') ? pageAll<any>((f, t) => db.from('submissions').select('assignment_id, score, max_score, teacher_approved, submitted_at')
      .eq('student_id', uid).order('id').range(f, t), 50_000) : none,
    // bounded: one student's invoices, a few instalments a year
    sees(lens, 'fees') && uid ? db.from('fee_invoices').select('id, session, amount, concession').eq('school_id', schoolId).eq('student_id', uid).is('voided_at', null).limit(500) : none,
    // bounded: one student's approved Kirti
    sees(lens, 'kirti') ? db.from('kirti_entries').select('on_date, title, category, level, position, position_note').eq('school_id', schoolId).eq('student_id', s.id).eq('status', 'approved').limit(1000) : none,
    // bounded: one student's issued certificates
    sees(lens, 'certificates') ? db.from('certificates').select('issued_on, number, certificate_types(title)').eq('school_id', schoolId).eq('student_id', s.id).eq('status', 'issued').limit(500) : none,
    // bounded: one student's documents
    sees(lens, 'documents') ? db.from('student_documents').select('kind, title, status, source, uploaded_by, verified_at, created_at').eq('school_id', schoolId).eq('student_id', s.id).neq('status', 'rejected').limit(500) : none,
    // bounded: one student's check-ups and vaccinations (kind and date only; the detail stays in Health, where reads are recorded)
    sees(lens, 'health') ? db.from('health_events').select('kind, on_date').eq('school_id', schoolId).eq('student_id', s.id).limit(1000) : none,
    // bounded: one student's discipline actions
    sees(lens, 'discipline') ? db.from('discipline_actions').select('kind, on_date, until_date, reason, status, session').eq('school_id', schoolId).eq('student_id', s.id).eq('status', 'approved').limit(1000) : none,
    // bounded: one student's incidents; child protection is never read here
    on('incidents') ? db.from('incidents').select('occurred_at, category, summary').eq('school_id', schoolId).eq('student_id', uid).neq('category', 'child_protection').limit(1000) : none,
    // bounded: one student's counselling cases (dates and status, never notes)
    sees(lens, 'counselling') ? db.from('counselling_cases').select('opened_on, closed_on, status').eq('school_id', schoolId).eq('student_id', s.id).limit(200) : none,
    // Mood and energy only. A private journal entry (a note the student didn't share) isn't counted.
    on('wellness') ? pageAll<any>((f, t) => {
      let q = db.from('wellness_logs').select('created_at, mood, energy').eq('school_id', schoolId).eq('student_id', uid).or('note.is.null,shared.eq.true');
      if (from && to) q = q.gte('created_at', from).lt('created_at', to);
      return q.order('created_at').order('id').range(f, t);
    }, 20_000) : none,
  ]);
  if (att.error) throw new Error(`attendance: ${att.error.message}`);

  const invoiceRows = must(invoices, 'invoices');
  const payments = invoiceRows.length
    // bounded: payments against one student's invoices
    ? must(await db.from('fee_payments').select('invoice_id, amount, paid_on, receipt_no').eq('school_id', schoolId).in('invoice_id', invoiceRows.map(i => i.id)).is('voided_at', null).limit(2000), 'payments')
    : [];

  const docCan = a.docCan;
  const documents = must(docs, 'documents').filter(d => {
    if (lens.who === 'office') return d.status === 'verified' && !!docCan && canSeeKind(d.kind, docCan);
    if (lens.who === 'parent') return d.status === 'verified' || (d.source === 'parent' && d.uploaded_by === a.viewer.id);
    return d.status === 'verified';
  }).map(d => ({ kind: d.kind, title: d.title, on: String(d.verified_at || d.created_at).slice(0, 10) }));

  return emptyRows({
    student: { previousSchool: s.previousSchool, previousClass: s.previousClass, previousTcNo: s.previousTcNo, previousStatus: s.previousStatus, admittedOn: s.admittedOn },
    startMonth, currentSession: currentSession(settings), today: isoDay(),
    enrolments,
    attendance: (att.data as Rows['attendance']) ?? null,
    cards: must(cards, 'report cards').map(c => ({ session: c.session, publishedAt: c.published_at, term: c.term, aggregate: c.aggregate, result: c.result, subjects: Array.isArray(c.subjects) ? c.subjects : [] })),
    tml: must(tml, 'mastery'),
    work: must(work, 'homework').filter(w => classKeys.has(normClass(w.class)) || (Array.isArray(w.assigned_student_ids) && w.assigned_student_ids.includes(uid)))
      .filter(w => !Array.isArray(w.assigned_student_ids) || !w.assigned_student_ids.length || w.assigned_student_ids.includes(uid)),
    subs: must(subs, 'submissions'),
    invoices: invoiceRows,
    payments,
    kirti: must(kirti, 'kirti'),
    certificates: must(certs, 'certificates').map(c => ({ issued_on: c.issued_on, number: c.number, title: (c as any).certificate_types?.title || 'Certificate' })),
    documents,
    health: must(health, 'health'),
    discipline: must(discipline, 'discipline'),
    incidents: must(incidents, 'incidents'),
    counselling: must(counselling, 'counselling'),
    wellness: must(wellness, 'wellness'),
  });
}

/** Printing the student file is recorded, like every other look at a whole record. */
export async function recordPrint(db: Db, a: { viewer: Viewer; subject: Subject; lens: Lens }) {
  const { error } = await db.from('audit_log').insert({
    actor_id: a.viewer.id, actor_role: a.viewer.role, action: 'timeline.printed', table_name: 'students', row_id: a.subject.id, school_id: a.subject.schoolId,
    new_values: { as: a.lens.who, sources: a.lens.sources },
  });
  if (error) console.warn('[timeline audit]', error.message);
}
