/**
 * Situational feed rules: what becomes a feed item, how serious it is, and when
 * it escalates to the principal. Pure (rows in, drafts out) so it is unit
 * tested; src/lib/feed/raise.ts writes the drafts, scan.ts feeds them rows.
 *
 * Teacher-safe by construction: nothing here reads a student's private journal
 * text. Wellness items carry the energy level and whether a note was shared.
 */
import { displayClass, normClass } from '@/lib/teacher/scope';

export type Category = 'academic' | 'wellness' | 'attendance' | 'incident' | 'security';
export type Severity = 'critical' | 'high' | 'normal';
export type Kind =
  | 'proctor_flag' | 'overdue_work' | 'tml_drop' | 'low_scores'
  | 'low_energy' | 'energy_streak' | 'help_request'
  | 'absence_streak' | 'exam_absence' | 'incident';

export interface Draft {
  kind: Kind;
  category: Category;
  severity: Severity;
  title: string;
  message: string;
  dedupeKey: string;
  studentId?: string | null;
  studentName?: string | null;
  className?: string | null;
  subject?: string | null;
  /** Addressed to one teacher (e.g. the assignment's owner); null = every teacher of the student/class. */
  teacherId?: string | null;
  /** 'principal' items (child protection) reach incidents.manage holders only. */
  audience?: 'staff' | 'principal';
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  academic: 'Academic', wellness: 'Wellness', attendance: 'Attendance', incident: 'Incident', security: 'Integrity',
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', normal: 'Normal' };
const SEVERITY_RANK: Record<Severity, number> = { normal: 0, high: 1, critical: 2 };
export const higher = (a: Severity, b: Severity): Severity => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b);

// ── Time (the school runs on IST whatever the server's clock zone) ─────────
const IST_MS = 330 * 60_000;
export const DAY_MS = 86_400_000;
/** YYYY-MM-DD in IST. */
export const istDay = (d: Date = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
/** The instant hh:mm IST falls on a given IST day. */
export function istAt(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m) - IST_MS);
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isSunday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;

export const DEFAULT_DAY_END = '16:00';

/**
 * When an unacknowledged item goes to the principal. Critical: one hour after
 * it was raised. High: the end of that school day (the next school day's end
 * when raised after hours; Sundays skipped). Normal: never.
 */
export function escalateAt(severity: Severity, raisedAt: Date, dayEnd = DEFAULT_DAY_END): Date | null {
  if (severity === 'critical') return new Date(raisedAt.getTime() + 3600_000);
  if (severity === 'normal') return null;
  let day = istDay(raisedAt);
  if (isSunday(day) || raisedAt >= istAt(day, dayEnd)) {
    day = addDays(day, 1);
    while (isSunday(day)) day = addDays(day, 1);
  }
  return istAt(day, dayEnd);
}

/** Escalated = past its escalation time and still not acknowledged. Derived, so no job is needed to show it. */
export const isEscalated = (s: { escalate_at?: string | null; acknowledged_at?: string | null }, now = Date.now()) =>
  !s.acknowledged_at && !!s.escalate_at && new Date(s.escalate_at).getTime() <= now;

// ── Incidents ──────────────────────────────────────────────────────────────
export type IncidentCategory = 'health' | 'discipline' | 'bullying' | 'safety' | 'property' | 'child_protection' | 'other';
export type ParentNotice = 'sent' | 'awaiting_class_teacher' | 'principal_decides' | 'declined' | 'not_applicable';

/**
 * The school's routing for incidents (decided 2026-09-26): health is told to
 * parents at once; discipline waits for the class teacher to confirm; bullying,
 * safety and child protection are the principal's call. Child protection is
 * seen by the principal only (POCSO: mandatory reporting still applies).
 */
export const INCIDENT_RULES: Record<IncidentCategory, { label: string; severity: Severity; notice: ParentNotice; audience: 'staff' | 'principal'; hint: string }> = {
  health: { label: 'Health or injury', severity: 'high', notice: 'sent', audience: 'staff', hint: 'Parents are told straight away.' },
  discipline: { label: 'Discipline', severity: 'normal', notice: 'awaiting_class_teacher', audience: 'staff', hint: 'The class teacher confirms before parents are told.' },
  bullying: { label: 'Bullying', severity: 'critical', notice: 'principal_decides', audience: 'staff', hint: 'The principal decides whether and how to tell parents.' },
  safety: { label: 'Safety', severity: 'critical', notice: 'principal_decides', audience: 'staff', hint: 'The principal decides whether and how to tell parents.' },
  property: { label: 'Property or damage', severity: 'normal', notice: 'awaiting_class_teacher', audience: 'staff', hint: 'The class teacher confirms before parents are told.' },
  child_protection: {
    label: 'Child protection', severity: 'critical', notice: 'principal_decides', audience: 'principal',
    hint: 'Only the principal sees this. Under POCSO, suspected abuse must be reported to the police or the Child Welfare Committee.',
  },
  other: { label: 'Other', severity: 'normal', notice: 'awaiting_class_teacher', audience: 'staff', hint: 'The class teacher confirms before parents are told.' },
};
export const INCIDENT_CATEGORIES = Object.keys(INCIDENT_RULES) as IncidentCategory[];

/** Severity for a logged incident; "urgent" lifts it to critical, never lowers it. */
export const incidentSeverity = (c: IncidentCategory, urgent = false): Severity => (urgent ? 'critical' : INCIDENT_RULES[c].severity);

/** No student named = nothing to tell parents. */
export const incidentNotice = (c: IncidentCategory, hasStudent: boolean): ParentNotice => (hasStudent ? INCIDENT_RULES[c].notice : 'not_applicable');

export function incidentDraft(i: {
  id: string; category: IncidentCategory; severity: Severity; summary: string; studentId: string | null; studentName: string | null;
  className: string | null; location: string | null; loggedByName: string; notice: ParentNotice;
}): Draft {
  const r = INCIDENT_RULES[i.category];
  const who = i.studentName ? `${i.studentName}${i.className ? ` (${displayClass(i.className)})` : ''}` : (i.className ? displayClass(i.className) : 'No student named');
  const notice = {
    sent: 'Parents have been told.', awaiting_class_teacher: 'Waiting for the class teacher to confirm before parents are told.',
    principal_decides: 'Waiting for the principal to decide on telling parents.', declined: 'Decided not to tell parents.', not_applicable: '',
  }[i.notice];
  return {
    kind: 'incident', category: 'incident', severity: i.severity, audience: r.audience,
    title: `${r.label}: ${i.summary}`,
    message: `${who}. Logged by ${i.loggedByName}${i.location ? ` at ${i.location}` : ''}. ${notice}`.trim(),
    dedupeKey: `incident:${i.id}`, studentId: i.studentId, studentName: i.studentName, className: i.className,
    sourceTable: 'incidents', sourceId: i.id, metadata: { incidentCategory: i.category, parentNotice: i.notice },
  };
}

// ── Detectors ──────────────────────────────────────────────────────────────
export interface StudentRow { id: string; name: string | null; student_class: string | null }
export interface AssignmentRow {
  id: string; teacher_id: string | null; title: string | null; type: string | null; subject: string | null; class: string | null;
  due_date: string | null; status: string | null; assigned_student_ids?: string[] | null; proctored?: boolean | null;
}
export interface SubmissionRow { id: string; assignment_id: string; student_id: string; score: number | null; max_score: number | null; teacher_approved: boolean | null; submitted_at: string | null }
export interface TmlRow { student_id: string; subject: string | null; topic_name: string | null; score: number | null; computed_at: string }
export interface WellnessRow { id: string; student_id: string; energy: number | null; shared: boolean | null; note_present?: boolean; created_at: string }
export interface AttendanceRow { student_id: string; class_name: string; day: string; status: 'present' | 'absent' | 'late' | 'excused' }
export interface ProctorRow { id: string; student_id: string; student_name: string | null; assignment_id: string | null; assignment_title: string | null; switch_count: number | null; flagged_at: string }

const byId = (students: StudentRow[]) => new Map(students.map(s => [s.id, s]));
const fmtDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};
const isPublished = (a: AssignmentRow) => (a.status || 'published') !== 'draft';

/** Who an assignment is for: its explicit list, else every student in its class. */
export function assignees(a: AssignmentRow, students: StudentRow[]): StudentRow[] {
  if (a.assigned_student_ids?.length) {
    const want = new Set(a.assigned_student_ids);
    return students.filter(s => want.has(s.id));
  }
  const cls = normClass(a.class);
  return cls ? students.filter(s => normClass(s.student_class) === cls) : [];
}

/**
 * Published work that fell due in the last week with students still missing.
 * One item per assignment, addressed to its teacher; the count updates as
 * students submit (same dedupe key).
 */
export function detectOverdue(assignments: AssignmentRow[], submissions: SubmissionRow[], students: StudentRow[], today: string, lookbackDays = 7): Draft[] {
  const from = addDays(today, -lookbackDays);
  const submitted = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (!submitted.has(s.assignment_id)) submitted.set(s.assignment_id, new Set());
    submitted.get(s.assignment_id)!.add(s.student_id);
  }
  const out: Draft[] = [];
  for (const a of assignments) {
    if (!a.due_date || !isPublished(a)) continue;
    const due = a.due_date.slice(0, 10);
    if (due >= today || due < from) continue;
    const done = submitted.get(a.id) || new Set();
    const missing = assignees(a, students).filter(s => !done.has(s.id));
    if (!missing.length) continue;
    const names = missing.slice(0, 4).map(s => s.name || 'Student').join(', ') + (missing.length > 4 ? ` and ${missing.length - 4} more` : '');
    out.push({
      kind: 'overdue_work', category: 'academic', severity: 'normal',
      title: `${missing.length} ${missing.length === 1 ? 'student has' : 'students have'} not submitted "${a.title || 'Untitled'}"`,
      message: `Due ${fmtDay(due)}. Missing: ${names}.`,
      dedupeKey: `overdue:${a.id}`, teacherId: a.teacher_id, className: a.class, subject: a.subject,
      sourceTable: 'assignments', sourceId: a.id, metadata: { missing: missing.map(s => s.id), due },
    });
  }
  return out;
}

/** A topic's mastery fell by at least `drop` points between the last two snapshots and now sits below 50. */
export function detectTmlDrops(rows: TmlRow[], students: StudentRow[], drop = 15): Draft[] {
  const map = byId(students);
  const groups = new Map<string, TmlRow[]>();
  for (const r of rows) {
    if (r.score === null || r.score === undefined || !r.topic_name) continue;
    const k = `${r.student_id}|${(r.subject || '').toLowerCase()}|${r.topic_name.toLowerCase()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: Draft[] = [];
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    g.sort((a, b) => b.computed_at.localeCompare(a.computed_at));
    const [latest, prev] = g;
    const now = Math.round(Number(latest.score)), before = Math.round(Number(prev.score));
    if (before - now < drop || now >= 50) continue;
    const s = map.get(latest.student_id);
    if (!s) continue;
    out.push({
      kind: 'tml_drop', category: 'academic', severity: 'normal',
      title: `${s.name || 'A student'}'s mastery fell in ${latest.topic_name}`,
      message: `${latest.subject || 'Subject'}: from ${before} to ${now}. Worth a quick check-in or a remedial task.`,
      dedupeKey: `tml_drop:${k}:${latest.computed_at.slice(0, 10)}`,
      studentId: s.id, studentName: s.name, className: s.student_class, subject: latest.subject,
      sourceTable: 'tml_scores', metadata: { from: before, to: now, topic: latest.topic_name },
    });
  }
  return out;
}

/** The last three graded pieces of a student's work (per teacher) all under 40%. */
export function detectLowScores(submissions: SubmissionRow[], assignments: AssignmentRow[], students: StudentRow[], threshold = 0.4): Draft[] {
  const aMap = new Map(assignments.map(a => [a.id, a]));
  const sMap = byId(students);
  const groups = new Map<string, { sub: SubmissionRow; a: AssignmentRow }[]>();
  for (const sub of submissions) {
    const a = aMap.get(sub.assignment_id);
    if (!a || !sub.teacher_approved || sub.score === null || !sub.max_score) continue;
    const k = `${sub.student_id}|${a.teacher_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ sub, a });
  }
  const out: Draft[] = [];
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    g.sort((x, y) => (y.sub.submitted_at || '').localeCompare(x.sub.submitted_at || ''));
    const last = g.slice(0, 3);
    if (!last.every(x => Number(x.sub.score) / Number(x.sub.max_score) < threshold)) continue;
    const st = sMap.get(last[0].sub.student_id);
    if (!st) continue;
    const pcts = last.map(x => `${Math.round((Number(x.sub.score) / Number(x.sub.max_score)) * 100)}%`).join(', ');
    out.push({
      kind: 'low_scores', category: 'academic', severity: 'normal',
      title: `${st.name || 'A student'} scored under ${Math.round(threshold * 100)}% three times running`,
      message: `Latest: ${pcts}, most recent first (${last[0].a.subject || 'your subject'}).`,
      dedupeKey: `low_scores:${st.id}:${last[0].sub.id}`,
      studentId: st.id, studentName: st.name, className: st.student_class, subject: last[0].a.subject, teacherId: last[0].a.teacher_id,
      sourceTable: 'submissions', sourceId: last[0].sub.id,
    });
  }
  return out;
}

/**
 * Low-energy check-ins (2 or below): each one is a normal item for the
 * student's teachers; three low check-ins in a row become one high item.
 * Only the energy level and whether a note was shared are ever shown.
 */
export function detectWellness(rows: WellnessRow[], students: StudentRow[], sinceIso: string): Draft[] {
  const map = byId(students);
  const per = new Map<string, WellnessRow[]>();
  for (const r of rows) {
    if (r.energy === null || r.energy === undefined) continue;
    if (!per.has(r.student_id)) per.set(r.student_id, []);
    per.get(r.student_id)!.push(r);
  }
  const out: Draft[] = [];
  for (const [sid, list] of per) {
    const s = map.get(sid);
    if (!s) continue;
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const streak = list.slice(0, 3);
    if (streak.length === 3 && streak.every(r => (r.energy ?? 5) <= 2) && streak[0].created_at >= sinceIso) {
      out.push({
        kind: 'energy_streak', category: 'wellness', severity: 'high',
        title: `${s.name || 'A student'} has checked in low three times in a row`,
        message: `Energy ${streak.map(r => r.energy).join(', ')} out of 5 (latest first). A quiet word today would help; refer to the counsellor if it continues.`,
        dedupeKey: `energy_streak:${sid}:${streak[0].id}`, studentId: sid, studentName: s.name, className: s.student_class,
        sourceTable: 'wellness_logs', sourceId: streak[0].id,
      });
      continue;
    }
    const latest = list[0];
    if (latest.created_at < sinceIso || (latest.energy ?? 5) > 2) continue;
    out.push({
      kind: 'low_energy', category: 'wellness', severity: 'normal',
      title: `${s.name || 'A student'} checked in at energy ${latest.energy} of 5`,
      message: latest.shared ? 'They shared a journal note with their teachers; see Student Wellness.' : 'No note shared. The journal stays private to the student.',
      dedupeKey: `low_energy:${latest.id}`, studentId: sid, studentName: s.name, className: s.student_class,
      sourceTable: 'wellness_logs', sourceId: latest.id,
    });
  }
  return out;
}

/**
 * Absence streaks from marked days: `min` or more marked school days absent in
 * a row, counting back from the latest marked day. Excused days don't count
 * either way; a present or late day ends the streak.
 */
export function detectAbsenceStreaks(rows: AttendanceRow[], students: StudentRow[], min = 3): Draft[] {
  const map = byId(students);
  const per = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    if (!per.has(r.student_id)) per.set(r.student_id, []);
    per.get(r.student_id)!.push(r);
  }
  const out: Draft[] = [];
  for (const [sid, list] of per) {
    list.sort((a, b) => b.day.localeCompare(a.day));
    const days: string[] = [];
    for (const r of list) {
      if (r.status === 'excused') continue;
      if (r.status !== 'absent') break;
      days.push(r.day);
    }
    if (days.length < min) continue;
    const s = map.get(sid);
    const start = days[days.length - 1];
    out.push({
      kind: 'absence_streak', category: 'attendance', severity: 'high',
      title: `${s?.name || 'A student'} has been absent ${days.length} school days in a row`,
      message: `Since ${fmtDay(start)}, no reason recorded. Call home or check with the office.`,
      dedupeKey: `absence:${sid}:${start}`, studentId: sid, studentName: s?.name ?? null, className: list[0].class_name,
      sourceTable: 'attendance', metadata: { days: days.length, since: start },
    });
  }
  return out;
}

/** Absent on a day a quiz or proctored assessment for their class fell due: tell the assignment's teacher. */
export function detectExamAbsences(rows: AttendanceRow[], assignments: AssignmentRow[], students: StudentRow[]): Draft[] {
  const map = byId(students);
  const tests = assignments.filter(a => a.due_date && isPublished(a) && (a.type === 'quiz' || a.proctored));
  const out: Draft[] = [];
  for (const r of rows) {
    if (r.status !== 'absent') continue;
    for (const a of tests) {
      if (a.due_date!.slice(0, 10) !== r.day) continue;
      const s = map.get(r.student_id);
      if (!assignees(a, s ? [s] : []).length) continue;
      out.push({
        kind: 'exam_absence', category: 'attendance', severity: 'high',
        title: `${s?.name || 'A student'} was absent for "${a.title || 'an assessment'}"`,
        message: `${fmtDay(r.day)}. Plan a make-up or record the reason.`,
        dedupeKey: `exam_absence:${r.student_id}:${a.id}`, studentId: r.student_id, studentName: s?.name ?? null,
        className: r.class_name, subject: a.subject, teacherId: a.teacher_id, sourceTable: 'assignments', sourceId: a.id,
      });
    }
  }
  return out;
}

/** Tab switching in proctored work: one item per student per assignment, high once it auto-submitted (3+ switches). */
export function detectProctoring(rows: ProctorRow[], assignments: AssignmentRow[], students: StudentRow[]): Draft[] {
  const aMap = new Map(assignments.map(a => [a.id, a]));
  const sMap = byId(students);
  const worst = new Map<string, ProctorRow>();
  for (const r of rows) {
    const k = `${r.student_id}|${r.assignment_id}`;
    const cur = worst.get(k);
    if (!cur || (r.switch_count ?? 0) > (cur.switch_count ?? 0)) worst.set(k, r);
  }
  const out: Draft[] = [];
  for (const r of worst.values()) {
    const a = r.assignment_id ? aMap.get(r.assignment_id) : undefined;
    const n = r.switch_count ?? 1;
    const s = sMap.get(r.student_id);
    out.push({
      kind: 'proctor_flag', category: 'security', severity: n >= 3 ? 'high' : 'normal',
      title: `${s?.name || r.student_name || 'A student'} left "${r.assignment_title || a?.title || 'a proctored task'}" ${n} ${n === 1 ? 'time' : 'times'}`,
      message: n >= 3 ? 'It was auto-submitted after the third tab switch. Review the answers before confirming the grade.' : 'Tab switch recorded during proctored work.',
      dedupeKey: `proctor:${r.student_id}:${r.assignment_id}`, studentId: r.student_id, studentName: s?.name || r.student_name,
      className: s?.student_class ?? a?.class ?? null, subject: a?.subject ?? null, teacherId: a?.teacher_id ?? null,
      sourceTable: 'proctor_alerts', sourceId: r.id, metadata: { switches: n },
    });
  }
  return out;
}
