/**
 * Admin desk view model + pure shaping from Supabase rows. No I/O here — the
 * provider (useAdminDesk) fetches, this turns rows into what the canon admin
 * pages render. Every number on the admin side comes out of this file (or
 * fees.ts / admissions.ts), so it can be tested without a database.
 */
import { normaliseSubject } from '@/lib/curriculum';
import { displayClass, normClass, teachingScope, type ScopeEntry } from '@/lib/teacher/scope';
import { assemblePipeline, type Pipeline } from './admissions';
import { assembleLedger, dayBook, forecast, shapeConcession, type ConcessionRequest, type DayBookDay, type FeeLedger, type ForecastMonth } from './fees';
import { balances, type Balance } from './leave';
import { Access, activeGrants, type Grant } from './rbac';
import { CONSENT_TYPES, LEAVE_TYPES } from './constants';
import { DAY, daysBetween, gradeOf, isoDay, nextSession, sessionOf } from './format';

export { CONSENT_TYPES, LEAVE_TYPES };

// ── Rows ────────────────────────────────────────────────────────────────────
export interface AdminRows {
  school: { id: string; name: string; settings: any };
  users: any[];
  tml: any[];
  assignments: any[];
  submissions: any[];
  lessons: any[];
  consents: any[];
  guardians: any[];
  audit: any[];
  leave: any[];
  structures: any[];
  invoices: any[];
  payments: any[];
  reminders: any[];
  applicants: any[];
  admissionEvents: any[];
  filings: any[];
  /** public.school_wellness_report rows. */
  wellness: any[];
  proctor: any[];
  /** Sources that couldn't be read (e.g. a migration not applied yet), by table name. */
  missing: string[];
  /** Access control and ERP controls (optional so older fixtures still assemble). */
  meId?: string;
  superadmin?: boolean;
  grants?: any[];
  dayCloses?: any[];
  concessions?: any[];
  leavePolicies?: any[];
  probeAcks?: any[];
}

// ── Mastery bands (TML specification) ───────────────────────────────────────
export const BANDS = [
  { key: 'exemplary', label: 'Exemplary', range: '90–100%', min: 90, color: '#10B981' },
  { key: 'proficient', label: 'Proficient', range: '75–89%', min: 75, color: '#34D399' },
  { key: 'developing', label: 'Developing', range: '50–74%', min: 50, color: '#F5B60B' },
  { key: 'critical', label: 'Critical gap', range: '35–49%', min: 35, color: '#F98A4B' },
  { key: 'severe', label: 'Severe need', range: 'below 35%', min: -Infinity, color: '#E11D48' },
] as const;
export type BandKey = typeof BANDS[number]['key'];
export const bandOf = (v: number): BandKey => BANDS.find(b => v >= b.min)!.key;
/** Same threshold the teacher desk flags students at (TClass.belowForty). */
export const AT_RISK = 40;

const SUBJECT_NAMES: Record<string, string> = {
  mathematics: 'Mathematics', science: 'Science', 'social science': 'Social Science', english: 'English', hindi: 'Hindi',
  physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology',
};
export const subjectKey = (s: string | null | undefined) => normaliseSubject(s) || '';
export const subjectName = (k: string) => SUBJECT_NAMES[k] || k.replace(/\b\w/g, c => c.toUpperCase());

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
const ts = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);

// ── View model ──────────────────────────────────────────────────────────────
export interface AStudent {
  id: string;
  name: string;
  cls: string;
  grade: number | null;
  rollNo: string;
  /** TML per subject key, now. */
  tml: Record<string, number>;
  overall: number | null;
  /** Overall TML 14 days ago (from the snapshots that existed then). */
  overallBefore: number | null;
  /** TML per subject key, 14 days ago. */
  tmlBefore: Record<string, number>;
  /** Consent types a parent has granted and not withdrawn. */
  consents: string[];
  guardians: number;
  verifiedGuardians: number;
}

export interface SectionRow {
  cls: string;
  grade: number | null;
  students: number;
  evidenced: number;
  tml: number | null;
  atRisk: number;
  bySubject: Record<string, { tml: number | null; n: number }>;
}

export interface GradeRow { grade: number; sections: string[]; students: number; evidenced: number; tml: number | null; before: number | null; atRisk: number }

export interface Cell { grade: number; subject: string; tml: number | null; n: number; sectionsBelow: number; sections: number }

export interface Academics {
  schoolTml: number | null;
  schoolTmlBefore: number | null;
  evidenced: number;
  subjects: string[];
  grades: GradeRow[];
  sections: SectionRow[];
  matrix: Cell[];
  bands: { key: BandKey; count: number }[];
  noEvidence: number;
  atRisk: AStudent[];
  /** The lowest cell with enough evidence to act on (n ≥ 2). */
  weakest: Cell | null;
  lastComputedAt: string | null;
  /** Latest student x topic snapshots by confidence band (firm = 5+ data points). */
  confidence: { firm: number; provisional: number; insufficient: number };
}

export interface TeacherRow {
  id: string;
  name: string;
  email: string;
  scope: ScopeEntry[];
  classes: string[];
  subjects: string[];
  students: number;
  tml: number | null;
  before: number | null;
  delta: number | null;
  backlog: number;
  oldestPendingDays: number | null;
  posted30: number;
  lessons30: number;
  aiLessons30: number;
  graded30: number;
  lastActive: string | null;
  activity: 'high' | 'medium' | 'none';
  onLeaveToday: boolean;
}

export interface LeaveRow {
  id: string;
  staffId: string;
  staffName: string;
  type: string;
  from: string;
  to: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
  createdAt: string;
}

export interface Workforce {
  teachers: TeacherRow[];
  admins: { id: string; name: string; email: string }[];
  ratio: number | null;
  leave: LeaveRow[];
  pendingLeave: LeaveRow[];
  onLeaveToday: LeaveRow[];
  backlog: number;
  activeShare: number | null;
  /** Entitlements for the session, and each teacher's balances. */
  policies: { leave_type: string; days_per_year: number }[];
  balances: Record<string, Balance[]>;
}


export interface WellnessReport {
  since: string;
  students: number;
  checkins: number;
  /** 0–100: mean energy (1–5) rescaled; null when suppressed (<5 students). */
  energy: number | null;
  lowShare: number | null;
  participation: number | null;
  weeks: { week: string; students: number; energy: number | null }[];
  grades: { grade: number; students: number; energy: number | null }[];
}


export interface ComplianceFlag { key: string; tone: 'r' | 'a'; title: string; detail: string; href: string }

export interface AuditRow { id: string; at: string; actor: string; actorRole: string; action: string; table: string; summary: string }

export interface Compliance {
  consents: { type: string; label: string; purpose: string; granted: number; revoked: number; coverage: number | null }[];
  guardianCoverage: number | null;
  studentsWithoutGuardian: AStudent[];
  unverifiedLinks: number;
  flags: ComplianceFlag[];
  audit: AuditRow[];
}

export interface Filing {
  id: string | null;
  session: string;
  dueOn: string | null;
  data: Record<string, any>;
  status: 'draft' | 'filed';
  filedAt: string | null;
  snapshot: Record<string, any> | null;
}

export interface AdminDesk {
  school: { id: string; name: string; code: string | null; plan: string | null };
  session: string;
  admissionsSession: string;
  students: AStudent[];
  parents: number;
  academics: Academics;
  workforce: Workforce;
  fees: FeeLedger;
  admissions: Pipeline;
  wellness: WellnessReport;
  compliance: Compliance;
  filing: Filing;
  proctorFlags14: number;
  missing: string[];
  loadedAt: string;
  /** The signed-in office account and what it may do. */
  me: { id: string; access: Access };
  /** Every grant in the school (only filled for access.manage), plus office accounts. */
  grants: Grant[];
  revokedGrants: any[];
  dayBook: DayBookDay[];
  concessions: ConcessionRequest[];
  forecast: ForecastMonth[];
  /** School-wide TML at the end of each of the last 8 weeks (null before any evidence). */
  tmlSeries: { week: string; tml: number | null }[];
  probeAcks: { key: string; fingerprint: string; status: 'acknowledged' | 'snoozed'; snoozeUntil: string | null; note: string | null; by: string | null; at: string }[];
}

// ── TML shaping ─────────────────────────────────────────────────────────────
/** Per-student, per-subject TML as it stood at `cutoff` (latest snapshot per topic, mean over topics). */
export function tmlAsOf(rows: any[], cutoff = Infinity): Map<string, Record<string, number>> {
  const latest = new Map<string, any>();
  for (const r of rows) {
    const t = ts(r.computed_at);
    if (t > cutoff || !Number.isFinite(Number(r.score))) continue;
    const k = `${r.student_id}::${subjectKey(r.subject)}::${String(r.topic_name || '').toLowerCase().trim()}`;
    const prev = latest.get(k);
    if (!prev || t > ts(prev.computed_at)) latest.set(k, r);
  }
  const acc = new Map<string, Map<string, number[]>>();
  for (const r of latest.values()) {
    const bySubj = acc.get(r.student_id) ?? new Map<string, number[]>();
    acc.set(r.student_id, bySubj);
    const s = subjectKey(r.subject);
    bySubj.set(s, [...(bySubj.get(s) || []), Number(r.score)]);
  }
  const out = new Map<string, Record<string, number>>();
  for (const [sid, bySubj] of acc) out.set(sid, Object.fromEntries([...bySubj].map(([k, v]) => [k, mean(v)!])));
  return out;
}

const overallOf = (t: Record<string, number> | undefined, subjects?: string[]) =>
  t ? mean((subjects ? subjects.filter(s => s in t) : Object.keys(t)).map(s => t[s])) : null;

function confidenceOf(rows: any[]): Academics['confidence'] {
  const latest = new Map<string, any>();
  for (const r of rows) {
    const k = `${r.student_id}::${subjectKey(r.subject)}::${String(r.topic_name || '').toLowerCase().trim()}`;
    const prev = latest.get(k);
    if (!prev || ts(r.computed_at) > ts(prev.computed_at)) latest.set(k, r);
  }
  const out = { firm: 0, provisional: 0, insufficient: 0 };
  for (const r of latest.values()) {
    const b = r.confidence_band === 'firm' || r.confidence_band === 'provisional' ? r.confidence_band : 'insufficient';
    out[b as keyof typeof out]++;
  }
  return out;
}

function assembleAcademics(students: AStudent[], tmlRows: any[]): Academics {
  const evidenced = students.filter(s => s.overall !== null);
  const subjects = [...new Set(students.flatMap(s => Object.keys(s.tml)))].sort((a, b) => subjectName(a).localeCompare(subjectName(b)));

  const classes = [...new Set(students.map(s => s.cls).filter(Boolean))]
    .sort((a, b) => (gradeOf(a) ?? 99) - (gradeOf(b) ?? 99) || a.localeCompare(b));
  const sections: SectionRow[] = classes.map(cls => {
    const roll = students.filter(s => s.cls === cls);
    const ev = roll.filter(s => s.overall !== null);
    return {
      cls, grade: gradeOf(cls), students: roll.length, evidenced: ev.length, tml: mean(ev.map(s => s.overall!)),
      atRisk: ev.filter(s => s.overall! < AT_RISK).length,
      bySubject: Object.fromEntries(subjects.map(sub => {
        const vals = roll.map(s => s.tml[sub]).filter((v): v is number => typeof v === 'number');
        return [sub, { tml: mean(vals), n: vals.length }];
      })),
    };
  });

  const gradeNos = [...new Set(students.map(s => s.grade).filter((g): g is number => g !== null))].sort((a, b) => a - b);
  const grades: GradeRow[] = gradeNos.map(g => {
    const roll = students.filter(s => s.grade === g);
    const ev = roll.filter(s => s.overall !== null);
    const before = roll.filter(s => s.overallBefore !== null);
    return {
      grade: g, sections: sections.filter(s => s.grade === g).map(s => s.cls), students: roll.length, evidenced: ev.length,
      tml: mean(ev.map(s => s.overall!)), before: mean(before.map(s => s.overallBefore!)), atRisk: ev.filter(s => s.overall! < AT_RISK).length,
    };
  });

  const matrix: Cell[] = gradeNos.flatMap(g => subjects.map(sub => {
    const vals = students.filter(s => s.grade === g).map(s => s.tml[sub]).filter((v): v is number => typeof v === 'number');
    const secs = sections.filter(s => s.grade === g && s.bySubject[sub]?.n);
    return {
      grade: g, subject: sub, tml: mean(vals), n: vals.length, sections: secs.length,
      sectionsBelow: secs.filter(s => (s.bySubject[sub].tml ?? 100) < 60).length,
    };
  }));
  const weakest = matrix.filter(c => c.tml !== null && c.n >= 2).sort((a, b) => a.tml! - b.tml!)[0] ?? null;

  const withBefore = students.filter(s => s.overallBefore !== null);
  return {
    schoolTml: mean(evidenced.map(s => s.overall!)),
    schoolTmlBefore: withBefore.length ? mean(withBefore.map(s => s.overallBefore!)) : null,
    evidenced: evidenced.length, subjects, grades, sections, matrix,
    bands: BANDS.map(b => ({ key: b.key, count: evidenced.filter(s => bandOf(s.overall!) === b.key).length })),
    noEvidence: students.length - evidenced.length,
    atRisk: evidenced.filter(s => s.overall! < AT_RISK).sort((a, b) => a.overall! - b.overall!),
    weakest,
    lastComputedAt: tmlRows.reduce<string | null>((m, r) => (!m || r.computed_at > m ? r.computed_at : m), null),
    confidence: confidenceOf(tmlRows),
  };
}

// ── Workforce ───────────────────────────────────────────────────────────────
function leaveDays(from: string, to: string, halfDay: boolean) {
  return halfDay ? 0.5 : daysBetween(from, to) + 1;
}

export function shapeLeave(r: any, names: Map<string, string>): LeaveRow {
  const from = String(r.from_date).slice(0, 10);
  const to = String(r.to_date).slice(0, 10);
  return {
    id: r.id, staffId: r.staff_id, staffName: names.get(r.staff_id) || 'Staff member', type: r.leave_type, from, to,
    halfDay: !!r.half_day, days: leaveDays(from, to, !!r.half_day), reason: r.reason, status: r.status,
    decidedAt: r.decided_at ?? null, decidedBy: r.decided_by ? names.get(r.decided_by) || 'Admin' : null,
    note: r.decision_note ?? null, createdAt: r.created_at,
  };
}

function assembleWorkforce(rows: AdminRows, students: AStudent[], tmlBefore: Map<string, Record<string, number>>, now: number): Workforce {
  const today = isoDay(new Date(now));
  const since30 = now - 30 * DAY;
  const names = new Map(rows.users.map(u => [u.id, u.name || u.email || 'Staff member']));
  const leave = rows.leave.map(r => shapeLeave(r, names))
    .sort((a, b) => (a.status === 'pending') === (b.status === 'pending') ? (a.from < b.from ? 1 : -1) : a.status === 'pending' ? -1 : 1);
  const onLeaveToday = leave.filter(l => l.status === 'approved' && l.from <= today && l.to >= today);

  const asgBy = new Map<string, any[]>();
  for (const a of rows.assignments) asgBy.set(a.teacher_id, [...(asgBy.get(a.teacher_id) || []), a]);
  const subsByAsg = new Map<string, any[]>();
  for (const s of rows.submissions) subsByAsg.set(s.assignment_id, [...(subsByAsg.get(s.assignment_id) || []), s]);
  const lessonsBy = new Map<string, any[]>();
  for (const l of rows.lessons) lessonsBy.set(l.teacher_id, [...(lessonsBy.get(l.teacher_id) || []), l]);

  const teachers: TeacherRow[] = rows.users.filter(u => u.role === 'teacher').map(u => {
    const scope = teachingScope(u);
    const classes = [...new Set(scope.map(e => e.cls))];
    const subjects = [...new Set(scope.map(e => subjectName(subjectKey(e.subject))).filter(Boolean))];
    // Each student counts once, scored on the subjects this teacher teaches their class.
    const taught = students.map(s => {
      const subs = scope.filter(e => normClass(e.cls) === normClass(s.cls)).map(e => subjectKey(e.subject)).filter(Boolean);
      return { s, subs };
    }).filter(x => x.subs.length);
    const now_ = taught.map(x => overallOf(x.s.tml, x.subs)).filter((v): v is number => v !== null);
    const was = taught.map(x => overallOf(tmlBefore.get(x.s.id), x.subs)).filter((v): v is number => v !== null);
    const tml = mean(now_);
    const before = mean(was);

    const mine = asgBy.get(u.id) || [];
    const subs = mine.flatMap(a => subsByAsg.get(a.id) || []);
    const pending = subs.filter(s => s.teacher_approved !== true);
    const oldest = pending.reduce<string | null>((m, s) => { const at = s.submitted_at || s.created_at; return at && (!m || at < m) ? at : m; }, null);
    const graded30 = subs.filter(s => s.teacher_approved === true && ts(s.updated_at) >= since30);
    const posted30 = mine.filter(a => ts(a.created_at) >= since30 && a.status !== 'draft');
    const lessons = lessonsBy.get(u.id) || [];
    const lessons30 = lessons.filter(l => ts(l.created_at) >= since30);
    const actions = posted30.length + lessons30.length + graded30.length;
    const lastActive = [...mine.map(a => a.created_at), ...lessons.map(l => l.updated_at || l.created_at), ...graded30.map(s => s.updated_at)]
      .filter(Boolean).sort().pop() ?? null;

    return {
      id: u.id, name: u.name || u.email || 'Teacher', email: u.email || '', scope, classes, subjects,
      students: taught.length, tml, before, delta: tml !== null && before !== null ? tml - before : null,
      backlog: pending.length, oldestPendingDays: oldest ? Math.max(0, Math.floor((now - ts(oldest)) / DAY)) : null,
      posted30: posted30.length, lessons30: lessons30.length, aiLessons30: lessons30.filter(l => l.ai_drafted).length,
      graded30: graded30.length, lastActive,
      activity: actions >= 4 ? 'high' as const : actions >= 1 ? 'medium' as const : 'none' as const,
      onLeaveToday: onLeaveToday.some(l => l.staffId === u.id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    teachers,
    admins: rows.users.filter(u => u.role === 'admin').map(u => ({ id: u.id, name: u.name || u.email, email: u.email || '' })),
    ratio: teachers.length ? Math.round(students.length / teachers.length) : null,
    leave, pendingLeave: leave.filter(l => l.status === 'pending'), onLeaveToday,
    backlog: teachers.reduce((n, t) => n + t.backlog, 0),
    activeShare: teachers.length ? Math.round((teachers.filter(t => t.activity !== 'none').length / teachers.length) * 100) : null,
    policies: (rows.leavePolicies || []).map(p => ({ leave_type: p.leave_type, days_per_year: Number(p.days_per_year) })),
    balances: Object.fromEntries(teachers.map(t => [t.id, balances(rows.leavePolicies || [], rows.leave, t.id, sessionOf(new Date(now)))])),
  };
}

// ── Wellness (CBSE report) ──────────────────────────────────────────────────
/** Energy 1–5 → 0–100 (1 = 0%, 5 = 100%). */
export const energyPct = (e: number | string | null | undefined) =>
  e === null || e === undefined || !Number.isFinite(Number(e)) ? null : Math.round(((Number(e) - 1) / 4) * 100);

export function assembleWellness(rows: any[], enrolled: number, since: string, now: number): WellnessReport {
  const school = rows.find(r => r.bucket === 'school');
  const byWeek = new Map(rows.filter(r => r.bucket === 'week').map(r => [r.key, r]));
  // The last 12 Monday-starting weeks, oldest first, including empty ones.
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const w = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (11 - i) * 7);
    const key = isoDay(w);
    const r = byWeek.get(key);
    return { week: key, students: Number(r?.students) || 0, energy: energyPct(r?.avg_energy) };
  });
  const students = Number(school?.students) || 0;
  return {
    since, students, checkins: Number(school?.checkins) || 0,
    energy: energyPct(school?.avg_energy),
    lowShare: school?.low_share === null || school?.low_share === undefined ? null : Math.round(Number(school.low_share) * 100),
    participation: enrolled ? Math.round((students / enrolled) * 100) : null,
    weeks,
    grades: rows.filter(r => r.bucket === 'grade').map(r => ({ grade: Number(r.key), students: Number(r.students), energy: energyPct(r.avg_energy) }))
      .sort((a, b) => a.grade - b.grade),
  };
}

// ── Compliance ──────────────────────────────────────────────────────────────
const TABLE_LABEL: Record<string, string> = {
  submissions: 'Grade', users: 'User account', consents: 'Consent', guardians: 'Guardian link', fee_structures: 'Fee structure',
  fee_invoices: 'Invoice', fee_payments: 'Receipt', fee_reminders: 'Fee reminder', admission_applicants: 'Applicant',
  leave_requests: 'Leave request', school_filings: 'Filing',
};

export function auditSummary(r: any): string {
  const t = TABLE_LABEL[r.table_name] || r.table_name;
  const nv = r.new_values || {};
  const ov = r.old_values || {};
  switch (r.table_name) {
    case 'submissions':
      return nv.teacher_approved && !ov.teacher_approved ? 'Grade confirmed' : `${t} changed`;
    case 'fee_payments':
      if (r.action === 'INSERT') return `Receipt ${nv.receipt_no} recorded`;
      return nv.voided_at && !ov.voided_at ? `Receipt ${nv.receipt_no} voided` : `${t} updated`;
    case 'fee_invoices':
      if (r.action === 'INSERT') return `Invoice ${nv.invoice_no} raised`;
      if (nv.voided_at && !ov.voided_at) return `Invoice ${nv.invoice_no} voided`;
      if (Number(nv.concession) !== Number(ov.concession)) return `Concession on ${nv.invoice_no}`;
      return `Invoice ${nv.invoice_no} updated`;
    case 'fee_structures':
      return `Grade ${nv.grade ?? ov.grade} fee structure ${r.action === 'INSERT' ? 'set' : r.action === 'DELETE' ? 'removed' : 'updated'}`;
    case 'admission_applicants':
      if (r.action === 'INSERT') return `Applicant added (Grade ${nv.grade})`;
      return nv.stage !== ov.stage ? `Applicant moved to ${nv.stage}` : 'Applicant updated';
    case 'leave_requests':
      if (r.action === 'INSERT') return 'Leave requested';
      return nv.status !== ov.status ? `Leave ${nv.status}` : 'Leave updated';
    case 'consents':
      return `${CONSENT_TYPES[nv.consent_type ?? ov.consent_type]?.label || 'Consent'} ${nv.granted ? 'granted' : 'withdrawn'}`;
    case 'guardians':
      if (r.action === 'INSERT') return 'Guardian linked';
      if (r.action === 'DELETE') return 'Guardian unlinked';
      return nv.verified && !ov.verified ? 'Guardian verified' : 'Guardian link updated';
    case 'users':
      if (r.action === 'DELETE') return 'Account deleted';
      return nv.role !== ov.role ? `Role changed to ${nv.role}` : 'Account details changed';
    case 'fee_reminders':
      return `${String(nv.tone || '').replace(/^\w/, (c: string) => c.toUpperCase())} fee reminder sent`;
    case 'school_filings':
      return nv.status === 'filed' && ov.status !== 'filed' ? 'CBSE wellness report filed' : 'Filing draft saved';
    default:
      return `${t} ${String(r.action).toLowerCase()}`;
  }
}

/**
 * Who made an audited change. Server-side writes carry no session user, so the
 * acting staff member is read from the row's own accountability column.
 */
const ACTOR_FIELDS = ['voided_by', 'decided_by', 'filed_by', 'recorded_by', 'sent_by', 'updated_by', 'created_by', 'actor_id'];
export function actorOf(r: any, names: Map<string, string>): string {
  if (r.actor_id) return names.get(r.actor_id) || 'Former user';
  const nv = r.new_values || {};
  const ov = r.old_values || {};
  // Prefer a field this change set (e.g. voided_by on a void) over one the row already had.
  const id = ACTOR_FIELDS.map(f => (nv[f] && nv[f] !== ov[f] ? nv[f] : null)).find(Boolean)
    ?? ACTOR_FIELDS.map(f => nv[f]).find(Boolean);
  if (id) return names.get(id) || 'Former user';
  return r.actor_role === 'server' ? 'Sthara service' : 'System';
}

function assembleCompliance(rows: AdminRows, students: AStudent[], wellness: WellnessReport): Compliance {
  const ids = new Set(students.map(s => s.id));
  const consents = Object.entries(CONSENT_TYPES).map(([type, meta]) => {
    const list = rows.consents.filter(c => c.consent_type === type && ids.has(c.student_id));
    const granted = list.filter(c => c.granted && !c.revoked_at).length;
    return { type, ...meta, granted, revoked: list.filter(c => !c.granted || c.revoked_at).length, coverage: students.length ? Math.round((granted / students.length) * 100) : null };
  });
  const withoutGuardian = students.filter(s => !s.verifiedGuardians);
  const names = new Map(rows.users.map(u => [u.id, u.name || u.email]));

  const flags: ComplianceFlag[] = [];
  const wc = consents.find(c => c.type === 'wellness_checkin')!;
  if (wellness.checkins > 0 && wc.granted < students.length) {
    flags.push({
      key: 'wellness-consent', tone: 'r',
      title: 'Wellness check-ins without recorded parental consent',
      detail: `Check-ins are active (${wellness.students} ${wellness.students === 1 ? 'student' : 'students'} so far this session) but only ${wc.granted} of ${students.length} students have a parent's consent on file. DPDP needs verifiable consent for a minor's wellness data.`,
      href: '/admin/compliance#consent',
    });
  }
  if (withoutGuardian.length) {
    flags.push({
      key: 'guardians', tone: 'a',
      title: `${withoutGuardian.length} student${withoutGuardian.length === 1 ? ' has' : 's have'} no verified parent linked`,
      detail: 'Without a verified guardian nobody can give or withdraw consent for them. Link parents in the directory.',
      href: '/admin/directory',
    });
  }
  const unverified = rows.guardians.filter(g => !g.verified && ids.has(g.student_id)).length;
  if (unverified) {
    flags.push({ key: 'unverified', tone: 'a', title: `${unverified} guardian link${unverified === 1 ? '' : 's'} awaiting verification`, detail: 'An unverified parent can\'t see the child or give consent until an admin verifies the link.', href: '/admin/directory' });
  }
  const aiTutor = consents.find(c => c.type === 'ai_tutor')!;
  if (aiTutor.coverage !== null && aiTutor.coverage < 100 && rows.tml.some(r => r.components?.tutor)) {
    flags.push({ key: 'tutor-consent', tone: 'a', title: aiTutor.granted ? 'AI tutor in use with partial consent' : 'AI tutor in use without recorded consent', detail: `${aiTutor.granted} of ${students.length} students have AI-tutor consent on file, and tutor depth already feeds TML.`, href: '/admin/compliance#consent' });
  }

  return {
    consents,
    guardianCoverage: students.length ? Math.round(((students.length - withoutGuardian.length) / students.length) * 100) : null,
    studentsWithoutGuardian: withoutGuardian,
    unverifiedLinks: unverified,
    flags,
    audit: rows.audit.map(r => ({
      id: String(r.id), at: r.at, actor: actorOf(r, names),
      actorRole: r.actor_role || '', action: r.action, table: TABLE_LABEL[r.table_name] || r.table_name, summary: auditSummary(r),
    })),
  };
}

// ── Assemble ────────────────────────────────────────────────────────────────
export function assembleAdminDesk(rows: AdminRows, now = Date.now()): AdminDesk {
  const session = sessionOf(new Date(now));
  const tmlNow = tmlAsOf(rows.tml);
  const tmlBefore = tmlAsOf(rows.tml, now - 14 * DAY);
  const gByStudent = new Map<string, any[]>();
  for (const g of rows.guardians) gByStudent.set(g.student_id, [...(gByStudent.get(g.student_id) || []), g]);

  const students: AStudent[] = rows.users.filter(u => u.role === 'student').map(u => {
    const tml = tmlNow.get(u.id) || {};
    const gs = gByStudent.get(u.id) || [];
    return {
      id: u.id, name: u.name || u.email || 'Student', cls: u.student_class ? displayClass(u.student_class) : '', grade: gradeOf(u.student_class),
      rollNo: u.custom_student_id || '', tml, overall: overallOf(tml), overallBefore: overallOf(tmlBefore.get(u.id)), tmlBefore: tmlBefore.get(u.id) || {},
      consents: rows.consents.filter(c => c.student_id === u.id && c.granted && !c.revoked_at).map(c => c.consent_type),
      guardians: gs.length, verifiedGuardians: gs.filter(g => g.verified).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const academics = assembleAcademics(students, rows.tml);
  const workforce = assembleWorkforce(rows, students, tmlBefore, now);
  const today = isoDay(new Date(now));
  const fees = assembleLedger({
    session, students: students.map(s => ({ id: s.id, name: s.name, cls: s.cls })),
    structures: rows.structures, invoices: rows.invoices, payments: rows.payments, reminders: rows.reminders, today,
  });
  const admissionsSession = nextSession(session);
  const admissions = assemblePipeline(admissionsSession, rows.applicants, rows.admissionEvents, today);
  const wellness = assembleWellness(rows.wellness, students.length, `${session.slice(0, 4)}-04-01`, now);
  const compliance = assembleCompliance(rows, students, wellness);
  const f = rows.filings.find(x => x.kind === 'cbse_wellness' && x.session === session);
  const settings = rows.school.settings || {};

  return {
    school: { id: rows.school.id, name: rows.school.name, code: settings.code ?? null, plan: settings.plan ?? null },
    session, admissionsSession, students,
    parents: rows.users.filter(u => u.role === 'parent').length,
    academics, workforce, fees, admissions, wellness, compliance,
    filing: {
      id: f?.id ?? null, session, dueOn: f?.due_on ?? null, data: f?.data || {}, status: f?.status === 'filed' ? 'filed' : 'draft',
      filedAt: f?.filed_at ?? null, snapshot: f?.snapshot ?? null,
    },
    proctorFlags14: rows.proctor.filter(p => ts(p.flagged_at) >= now - 14 * DAY).length,
    missing: rows.missing,
    loadedAt: new Date(now).toISOString(),
    me: { id: rows.meId || '', access: new Access(activeGrants((rows.grants || []).filter(g => g.user_id === rows.meId), today).map(g => g.role), !!rows.superadmin) },
    grants: activeGrants(rows.grants || [], today),
    revokedGrants: (rows.grants || []).filter(g => g.revoked_at || (g.expires_on && String(g.expires_on) < today)),
    dayBook: dayBook(fees.receipts, rows.payments, rows.dayCloses || [], 30, today),
    concessions: (rows.concessions || []).map(shapeConcession).sort((a, b) => (a.status === 'pending') === (b.status === 'pending') ? (a.requestedAt < b.requestedAt ? 1 : -1) : a.status === 'pending' ? -1 : 1),
    forecast: forecast(fees, students),
    tmlSeries: Array.from({ length: 8 }, (_, i) => {
      const at = now - (7 - i) * 7 * DAY;
      const m = tmlAsOf(rows.tml, at);
      const vals = students.map(s => overallOf(m.get(s.id))).filter((v): v is number => v !== null);
      return { week: isoDay(new Date(at)), tml: mean(vals) };
    }),
    probeAcks: (rows.probeAcks || []).map(a => ({ key: a.finding_key, fingerprint: a.fingerprint, status: a.status, snoozeUntil: a.snooze_until ?? null, note: a.note ?? null, by: a.acked_by ?? null, at: a.acked_at })),
  };
}
