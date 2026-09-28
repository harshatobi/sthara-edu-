/**
 * School health for the Platform Manager: one 0-100 score from four pillars
 * (Adoption, Operations, Data quality, Commercial), each explained by the
 * measures behind it and the findings that pulled it down.
 *
 * Pure (no I/O). Input is the counts-only output of ops_school_metrics() plus
 * the school's commercial facts, so nothing here can reveal a person.
 *
 * A measure with nothing to measure (no teachers yet, no fees raised) is left
 * out of its pillar rather than scored as 0 or 100; a pillar with no measures
 * is left out of the total.
 */

export type Role = 'student' | 'teacher' | 'parent' | 'admin';
export interface RoleStat { total: number; signedIn7: number; signedIn30: number; active7: number; active30: number; never: number }
export interface SchoolMetrics {
  at: string;
  roles: Partial<Record<Role, RoleStat>>;
  weekly: { week: string; role: Role; active: number }[];
  classes: { name: string; students: number; active7: number }[];
  data: {
    studentsNoParent: number; studentsNoClass: number; studentsNoRoll: number; parentsNoChild: number;
    teachersNoAssignments: number; staleTempPasswords: number;
  };
  ops: {
    classCount: number; attendanceDays14: number; classesMarked7: number; feeStructures: number;
    feeDue: number; feeCollected: number; invoicesDue: number; assignments30: number; teachersSettingWork30: number;
    gradingBacklog: number; incidentsOpenOld: number; timetablePublished: boolean; leavePendingOld: number;
    errors7: number; aiCostUsd30: number;
  };
}

/** What Commercial needs from the school's registry row (see SchoolPolicy). */
export interface CommercialFacts {
  active: boolean;
  plan: string;
  trialExpired: boolean;
  trialDaysLeft: number | null;
  contractStudents: number | null;
  /** INR per student per year actually charged, or null when there is none (pilot, or not set). */
  pricePerStudent: number | null;
  usdToInr: number;
}

export type PillarKey = 'adoption' | 'operations' | 'data' | 'commercial';
export type Severity = 'high' | 'medium' | 'low';
/** Where in the school workspace the fix lives. */
export type FixTab = 'people' | 'support' | 'teaching' | 'access' | 'classes' | 'overview';
export interface Finding { id: string; pillar: PillarKey; severity: Severity; title: string; detail?: string; tab?: FixTab }
export interface Measure { label: string; score: number; value: string; weight: number }
export interface Pillar { key: PillarKey; label: string; weight: number; score: number | null; measures: Measure[]; findings: Finding[] }
export type Band = 'strong' | 'fair' | 'weak' | 'critical' | 'setup' | 'suspended';
export interface Health { score: number | null; band: Band; pillars: Pillar[]; findings: Finding[] }

export const PILLARS: { key: PillarKey; label: string; weight: number; about: string }[] = [
  { key: 'adoption', label: 'Adoption', weight: 35, about: 'Are people actually using Sthara: teachers and students doing work, parents signing in, the office active.' },
  { key: 'operations', label: 'Operations', weight: 25, about: 'Is the school running on it: attendance marked, fees collected, homework set, grading kept up.' },
  { key: 'data', label: 'Data quality', weight: 20, about: 'Is the roster complete: parents verified, classes and roll numbers set, teachers assigned.' },
  { key: 'commercial', label: 'Commercial', weight: 20, about: 'Is the account healthy: status, pilot runway, seats against contract, AI cost against price.' },
];

export const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong', fair: 'Fair', weak: 'Weak', critical: 'Critical', setup: 'Setting up', suspended: 'Suspended',
};
export const bandOf = (score: number): Band => (score >= 80 ? 'strong' : score >= 60 ? 'fair' : score >= 40 ? 'weak' : 'critical');

const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
const rateSeverity = (rate: number): Severity => (rate < 0.5 ? 'high' : rate < 0.8 ? 'medium' : 'low');
const ROLE_WORD: Record<Role, [string, string]> = { student: ['student', 'students'], teacher: ['teacher', 'teachers'], parent: ['parent', 'parents'], admin: ['office user', 'office users'] };
const people = (r: Role, n: number) => plural(n, ROLE_WORD[r][0], ROLE_WORD[r][1]);

/** Mon-Sat days in the 14 days ending on `at` (Indian schools mostly run a six-day week). */
export function schoolDays14(at: string): number {
  const end = new Date(at);
  let n = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(end.getTime() - i * 86_400_000);
    if (d.getUTCDay() !== 0) n++;
  }
  return n;
}

function pillarScore(measures: Measure[]): number | null {
  const w = measures.reduce((n, m) => n + m.weight, 0);
  return w ? Math.round((measures.reduce((n, m) => n + m.score * m.weight, 0) / w) * 100) : null;
}

// ── Adoption ──────────────────────────────────────────────────────────────────

function adoption(m: SchoolMetrics): Omit<Pillar, 'key' | 'label' | 'weight' | 'score'> {
  const measures: Measure[] = [], findings: Finding[] = [];
  const r = (k: Role) => m.roles[k];
  const activeRate = (k: Role, label: string, weight: number) => {
    const s = r(k);
    if (!s?.total) return;
    const rate = s.active7 / s.total;
    measures.push({ label, score: rate, value: `${s.active7} of ${s.total}`, weight });
    const idle = s.total - s.active7;
    if (idle > 0) {
      findings.push({
        id: `adoption.idle.${k}`, pillar: 'adoption', severity: rateSeverity(rate),
        title: `${people(k, idle)} did nothing this week`, detail: `${pct(rate)} of ${ROLE_WORD[k][1]} were active in the last 7 days.`, tab: 'people',
      });
    }
    // Signing in without doing anything: the "logs in, does nothing" gap.
    const hollow = s.signedIn7 - s.active7;
    if (hollow > 0 && hollow / s.total >= 0.25) {
      findings.push({
        id: `adoption.hollow.${k}`, pillar: 'adoption', severity: 'medium',
        title: `${people(k, hollow)} signed in this week but did nothing`, detail: 'They reach the app and leave. Worth a training session or a walkthrough.',
      });
    }
    if (s.never > 0) {
      findings.push({
        id: `adoption.never.${k}`, pillar: 'adoption', severity: s.never / s.total >= 0.3 ? 'high' : 'medium',
        title: `${people(k, s.never)} never signed in`, detail: 'Their credentials may not have reached them.', tab: 'people',
      });
    }
  };
  activeRate('teacher', 'Teachers active this week', 35);
  activeRate('student', 'Students active this week', 30);
  const par = r('parent');
  if (par?.total) {
    const rate = par.signedIn30 / par.total;
    measures.push({ label: 'Parents signed in this month', score: rate, value: `${par.signedIn30} of ${par.total}`, weight: 15 });
    if (par.never > 0) {
      findings.push({ id: 'adoption.never.parent', pillar: 'adoption', severity: par.never / par.total >= 0.3 ? 'high' : 'medium', title: `${people('parent', par.never)} never signed in`, tab: 'people' });
    }
  }
  const adm = r('admin');
  if (adm?.total) {
    measures.push({ label: 'Office team active this week', score: adm.active7 > 0 ? 1 : 0, value: `${adm.active7} of ${adm.total}`, weight: 20 });
    if (!adm.active7) findings.push({ id: 'adoption.office', pillar: 'adoption', severity: 'high', title: 'Nobody in the office used Sthara this week', tab: 'people' });
  }
  for (const c of m.classes) {
    if (c.students >= 3 && c.active7 === 0) {
      findings.push({ id: `adoption.class.${c.name}`, pillar: 'adoption', severity: 'high', title: `${c.name}: none of ${c.students} students active this week` });
    }
  }
  // Trend: last full week against the three before it.
  const weeks = [...new Set(m.weekly.map(w => w.week))].sort();
  const thisWeek = weekStart(m.at);
  const full = weeks.filter(w => w < thisWeek);
  if (full.length >= 4) {
    for (const k of ['student', 'teacher'] as Role[]) {
      const at = (w: string) => m.weekly.find(x => x.week === w && x.role === k)?.active ?? 0;
      const last = at(full[full.length - 1]);
      const before = full.slice(-4, -1).map(at);
      const avg = before.reduce((a, b) => a + b, 0) / before.length;
      if (avg >= 3 && last < avg * 0.6) {
        findings.push({
          id: `adoption.trend.${k}`, pillar: 'adoption', severity: 'medium',
          title: `${k === 'student' ? 'Student' : 'Teacher'} activity fell ${Math.round((1 - last / avg) * 100)}% last week`,
          detail: `${last} active against an average of ${Math.round(avg)} over the three weeks before.`,
        });
      }
    }
  }
  return { measures, findings };
}

/** Monday of the week containing `iso`, as YYYY-MM-DD (matches date_trunc('week') in UTC). */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

// ── Operations ────────────────────────────────────────────────────────────────

function operations(m: SchoolMetrics): Omit<Pillar, 'key' | 'label' | 'weight' | 'score'> {
  const measures: Measure[] = [], findings: Finding[] = [];
  const o = m.ops;
  const liveClasses = m.classes.filter(c => c.students > 0).length;
  const students = m.roles.student?.total ?? 0, teachers = m.roles.teacher?.total ?? 0;

  if (liveClasses && students) {
    const expected = schoolDays14(m.at);
    const rate = clamp(o.attendanceDays14 / expected);
    measures.push({ label: 'Attendance marked, last 14 days', score: rate, value: `${o.attendanceDays14} of ${expected} school days`, weight: 25 });
    if (o.attendanceDays14 === 0) findings.push({ id: 'ops.attendance.none', pillar: 'operations', severity: 'high', title: 'No attendance marked in the last 14 days', detail: 'The school may still be on paper registers.' });
    else if (rate < 0.8) findings.push({ id: 'ops.attendance.gaps', pillar: 'operations', severity: rateSeverity(rate), title: `Attendance marked on only ${o.attendanceDays14} of ${expected} school days` });
    const cover = clamp(o.classesMarked7 / liveClasses);
    measures.push({ label: 'Classes with attendance this week', score: cover, value: `${Math.min(o.classesMarked7, liveClasses)} of ${liveClasses}`, weight: 15 });
    if (o.attendanceDays14 > 0 && cover < 1) {
      findings.push({ id: 'ops.attendance.classes', pillar: 'operations', severity: rateSeverity(cover), title: `${plural(Math.max(0, liveClasses - o.classesMarked7), 'class', 'classes')} had no attendance marked this week` });
    }
  }
  if (o.feeDue > 0) {
    const rate = clamp(o.feeCollected / o.feeDue);
    measures.push({ label: 'Fees collected of fees due', score: rate, value: pct(rate), weight: 25 });
    if (rate < 0.8) findings.push({ id: 'ops.fees', pillar: 'operations', severity: rateSeverity(rate), title: `Only ${pct(rate)} of fees due have been collected`, detail: `Across ${plural(o.invoicesDue, 'invoice')} due to date.` });
  } else if (students && !o.feeStructures) {
    findings.push({ id: 'ops.fees.none', pillar: 'operations', severity: 'low', title: 'Fees are not run on Sthara', detail: 'No fee structure is set up. Fine if the school bills elsewhere.' });
  }
  if (teachers) {
    const rate = clamp(o.teachersSettingWork30 / teachers);
    measures.push({ label: 'Teachers who set work this month', score: rate, value: `${o.teachersSettingWork30} of ${teachers}`, weight: 20 });
    if (rate < 0.8) findings.push({ id: 'ops.homework', pillar: 'operations', severity: rateSeverity(rate), title: `${people('teacher', teachers - o.teachersSettingWork30)} set no work in 30 days`, tab: 'teaching' });
  }
  if (students) {
    const b = o.gradingBacklog;
    measures.push({ label: 'Grading kept up', score: b === 0 ? 1 : b <= 5 ? 0.7 : b <= 20 ? 0.4 : 0.1, value: b ? `${b} waiting over 7 days` : 'Up to date', weight: 15 });
    if (b > 0) findings.push({ id: 'ops.grading', pillar: 'operations', severity: b > 20 ? 'high' : b > 5 ? 'medium' : 'low', title: `${plural(b, 'submission')} waiting over a week for a teacher` });
  }
  if (liveClasses && !o.timetablePublished) findings.push({ id: 'ops.timetable', pillar: 'operations', severity: 'low', title: 'No published timetable' });
  if (o.incidentsOpenOld) findings.push({ id: 'ops.incidents', pillar: 'operations', severity: 'medium', title: `${plural(o.incidentsOpenOld, 'incident')} open for over two weeks` });
  if (o.leavePendingOld) findings.push({ id: 'ops.leave', pillar: 'operations', severity: 'low', title: `${plural(o.leavePendingOld, 'leave request')} undecided for over 3 days` });
  if (o.errors7) findings.push({ id: 'ops.errors', pillar: 'operations', severity: o.errors7 > 20 ? 'medium' : 'low', title: `${plural(o.errors7, 'app error')} at this school this week`, detail: 'See the error log.' });
  return { measures, findings };
}

// ── Data quality ─────────────────────────────────────────────────────────────

function dataQuality(m: SchoolMetrics): Omit<Pillar, 'key' | 'label' | 'weight' | 'score'> {
  const measures: Measure[] = [], findings: Finding[] = [];
  const d = m.data;
  const students = m.roles.student?.total ?? 0, teachers = m.roles.teacher?.total ?? 0, parents = m.roles.parent?.total ?? 0;
  const everyone = (['student', 'teacher', 'parent', 'admin'] as Role[]).reduce((n, k) => n + (m.roles[k]?.total ?? 0), 0);
  if (students) {
    const rate = 1 - d.studentsNoParent / students;
    measures.push({ label: 'Students with a verified parent', score: rate, value: `${students - d.studentsNoParent} of ${students}`, weight: 30 });
    if (d.studentsNoParent) findings.push({ id: 'data.no-parent', pillar: 'data', severity: rateSeverity(rate), title: `${people('student', d.studentsNoParent)} with no verified parent`, detail: 'Fee reminders, attendance alerts and messages cannot reach these families.', tab: 'support' });
    const gaps = d.studentsNoClass + d.studentsNoRoll;
    measures.push({ label: 'Students with class and roll number', score: 1 - gaps / (2 * students), value: gaps ? `${gaps} missing` : 'Complete', weight: 20 });
    if (d.studentsNoClass) findings.push({ id: 'data.no-class', pillar: 'data', severity: 'high', title: `${people('student', d.studentsNoClass)} not in any class`, tab: 'support' });
    if (d.studentsNoRoll) findings.push({ id: 'data.no-roll', pillar: 'data', severity: 'medium', title: `${people('student', d.studentsNoRoll)} with no roll number`, detail: 'Parents link to children by roll number.', tab: 'support' });
  }
  if (teachers) {
    measures.push({ label: 'Teachers with classes assigned', score: 1 - d.teachersNoAssignments / teachers, value: `${teachers - d.teachersNoAssignments} of ${teachers}`, weight: 20 });
    if (d.teachersNoAssignments) findings.push({ id: 'data.teacher-unassigned', pillar: 'data', severity: 'medium', title: `${people('teacher', d.teachersNoAssignments)} with no classes assigned`, tab: 'teaching' });
  }
  if (parents) {
    measures.push({ label: 'Parents linked to a child', score: 1 - d.parentsNoChild / parents, value: `${parents - d.parentsNoChild} of ${parents}`, weight: 10 });
    if (d.parentsNoChild) findings.push({ id: 'data.parent-childless', pillar: 'data', severity: 'medium', title: `${people('parent', d.parentsNoChild)} not linked to any child`, tab: 'support' });
  }
  if (everyone) {
    measures.push({ label: 'Temporary passwords changed', score: 1 - d.staleTempPasswords / everyone, value: d.staleTempPasswords ? `${d.staleTempPasswords} still temporary after 14 days` : 'All changed', weight: 10 });
    if (d.staleTempPasswords) findings.push({ id: 'data.temp-passwords', pillar: 'data', severity: 'low', title: `${plural(d.staleTempPasswords, 'account')} still on a temporary password after 14 days`, tab: 'people' });
  }
  return { measures, findings };
}

// ── Commercial ────────────────────────────────────────────────────────────────

function commercial(m: SchoolMetrics, f: CommercialFacts, adoptionScore: number | null): Omit<Pillar, 'key' | 'label' | 'weight' | 'score'> {
  const measures: Measure[] = [], findings: Finding[] = [];
  const students = m.roles.student?.total ?? 0;
  if (!f.active) {
    measures.push({ label: 'Account status', score: 0, value: 'Suspended', weight: 40 });
    findings.push({ id: 'com.suspended', pillar: 'commercial', severity: 'high', title: 'School is suspended', tab: 'access' });
  } else if (f.plan === 'pilot') {
    const days = f.trialDaysLeft;
    const score = f.trialExpired ? 0.2 : days === null ? 0.8 : days <= 14 ? 0.6 : 1;
    measures.push({ label: 'Pilot runway', score, value: f.trialExpired ? 'Ended' : days === null ? 'No end date' : `${days} days left`, weight: 40 });
    if (f.trialExpired) findings.push({ id: 'com.pilot-ended', pillar: 'commercial', severity: 'high', title: 'Pilot has ended without converting', tab: 'access' });
    else if (days !== null && days <= 14) findings.push({ id: 'com.pilot-ending', pillar: 'commercial', severity: 'medium', title: `Pilot ends in ${plural(days, 'day')}`, detail: 'Time for the conversion conversation.', tab: 'access' });
    else if (days === null) findings.push({ id: 'com.pilot-open', pillar: 'commercial', severity: 'low', title: 'Pilot has no end date', tab: 'access' });
  } else {
    measures.push({ label: 'Account status', score: 1, value: 'Live', weight: 40 });
    if (f.pricePerStudent === null) findings.push({ id: 'com.no-price', pillar: 'commercial', severity: 'high', title: 'No price set for this school', detail: 'Annual value and billing cannot be worked out.', tab: 'access' });
  }
  if (f.contractStudents && students) {
    const use = students / f.contractStudents;
    measures.push({ label: 'Seats in use', score: use >= 0.8 ? 1 : clamp(use / 0.8), value: `${students} of ${f.contractStudents} contracted`, weight: 25 });
    if (use > 1.1) findings.push({ id: 'com.over-seats', pillar: 'commercial', severity: 'medium', title: `${people('student', students - f.contractStudents)} over the contracted seats`, detail: 'Billable: update the contract or invoice the difference.', tab: 'access' });
    else if (use < 0.5) findings.push({ id: 'com.under-seats', pillar: 'commercial', severity: 'medium', title: `Only ${pct(use)} of contracted seats in use`, detail: 'Unused seats are a renewal risk.', tab: 'access' });
  }
  if (f.pricePerStudent && students) {
    const yearlyAi = m.ops.aiCostUsd30 * 12 * f.usdToInr;
    const share = yearlyAi / (f.pricePerStudent * students);
    measures.push({ label: 'AI cost against price', score: 1 - clamp((share - 0.1) / 0.3), value: `${pct(share)} of revenue`, weight: 20 });
    if (share > 0.15) findings.push({ id: 'com.ai-cost', pillar: 'commercial', severity: share > 0.3 ? 'high' : 'medium', title: `AI is costing ${pct(share)} of this school's revenue`, detail: 'At the last 30 days’ rate, annualised.' });
  }
  if (adoptionScore !== null && adoptionScore < 50 && f.active) {
    measures.push({ label: 'Renewal outlook', score: adoptionScore / 100, value: 'Low adoption', weight: 15 });
    findings.push({ id: 'com.renewal', pillar: 'commercial', severity: 'high', title: 'Low adoption puts the renewal at risk', detail: 'A school that doesn’t use Sthara won’t renew it.' });
  }
  return { measures, findings };
}

// ── Total ─────────────────────────────────────────────────────────────────────

export function scoreHealth(m: SchoolMetrics, f: CommercialFacts): Health {
  const a = adoption(m);
  const aScore = pillarScore(a.measures);
  const parts: Record<PillarKey, Omit<Pillar, 'key' | 'label' | 'weight' | 'score'>> = {
    adoption: a, operations: operations(m), data: dataQuality(m), commercial: commercial(m, f, aScore),
  };
  const pillars: Pillar[] = PILLARS.map(p => ({ key: p.key, label: p.label, weight: p.weight, score: pillarScore(parts[p.key].measures), ...parts[p.key] }));
  for (const p of pillars) p.findings.sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);
  const findings = pillars.flatMap(p => p.findings).sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);

  const students = m.roles.student?.total ?? 0;
  if (!f.active) return { score: null, band: 'suspended', pillars, findings };
  if (!students) return { score: null, band: 'setup', pillars, findings };
  const scored = pillars.filter(p => p.score !== null);
  const w = scored.reduce((n, p) => n + p.weight, 0);
  const score = w ? Math.round(scored.reduce((n, p) => n + p.score! * p.weight, 0) / w) : null;
  return { score, band: score === null ? 'setup' : bandOf(score), pillars, findings };
}
