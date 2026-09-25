/**
 * Probe: the admin side's analysis engine. Deterministic detectors over the
 * desk find what's going wrong across academics, staff, fees, admissions and
 * compliance; a correlation pass links findings that share a cause (a class
 * whose TML is falling, taught by a teacher who has stopped grading); each
 * finding carries its evidence, a severity score, and actions that do
 * something. Findings are filtered by the viewer's permissions, and hidden
 * while acknowledged unless they get worse (the fingerprint changes).
 * Pure: no I/O, so every rule is unit-tested.
 */
import { normClass } from '@/lib/teacher/scope';
import { AT_RISK, subjectKey, subjectName, type AdminDesk, type AStudent, type TeacherRow } from './desk';
import { STAGE_ONE, STAGES } from './admissions';
import { daysBetween, fmtDate, inr, inrShort, isoDay, plural } from './format';
import type { Perm } from './rbac';

export type Module = 'academics' | 'workforce' | 'finance' | 'admissions' | 'compliance';
export type Level = 'critical' | 'high' | 'medium' | 'low';

export const MODULES: Record<Module, { label: string; perm: Perm }> = {
  academics: { label: 'Academics', perm: 'academics.read' },
  workforce: { label: 'Staff', perm: 'workforce.read' },
  finance: { label: 'Fees', perm: 'fees.read' },
  admissions: { label: 'Admissions', perm: 'admissions.read' },
  compliance: { label: 'Compliance', perm: 'compliance.read' },
};

export type ProbeAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'nudge_teacher'; label: string; teacherId: string; teacherName: string; message: string; perm: Perm }
  | { kind: 'request_consent'; label: string; consentType: string; studentIds: string[]; perm: Perm }
  | { kind: 'remind_fees'; label: string; studentIds: string[]; perm: Perm };

export interface Evidence { label: string; value: string; tone?: 'r' | 'a' | 'g' }

export interface Finding {
  key: string;
  module: Module;
  /** 0–100. */
  severity: number;
  level: Level;
  title: string;
  summary: string;
  evidence: Evidence[];
  series?: { label: string; unit: '%' | '₹' | ''; points: { x: string; y: number | null }[] };
  /** Other signals that explain this one (filled by the correlation pass). */
  causes: string[];
  related: string[];
  actions: ProbeAction[];
  /** Changes when the finding gets materially worse, so an acknowledgement stops hiding it. */
  fingerprint: string;
  /** Permission needed to see it (beyond the module's own). */
  needs?: Perm;
  /** Ids used by the correlation pass. */
  teacherIds?: string[];
  sections?: string[];
}

export const levelOf = (s: number): Level => (s >= 70 ? 'critical' : s >= 50 ? 'high' : s >= 30 ? 'medium' : 'low');
const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
/** Coarse bucket for fingerprints: small wobbles don't resurface an acknowledged finding. */
const band = (n: number, step: number) => Math.floor(n / step);

function make(f: Omit<Finding, 'level' | 'causes' | 'related'> & Partial<Pick<Finding, 'causes' | 'related'>>): Finding {
  const severity = clamp(f.severity);
  return { causes: [], related: [], ...f, severity, level: levelOf(severity) };
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Who teaches this section + subject (from teaching scopes). */
function teachersOf(d: AdminDesk, cls: string, subject?: string): TeacherRow[] {
  return d.workforce.teachers.filter(t => t.scope.some(e => normClass(e.cls) === normClass(cls)
    && (!subject || !e.subject || subjectKey(e.subject) === subject)));
}

// ── Academics ───────────────────────────────────────────────────────────────
function academics(d: AdminDesk): Finding[] {
  const out: Finding[] = [];
  const ac = d.academics;
  const bySection = new Map<string, AStudent[]>();
  for (const s of d.students) if (s.cls) bySection.set(s.cls, [...(bySection.get(s.cls) || []), s]);

  // A1 · a section's subject falling over the fortnight (same students, then vs now)
  for (const [cls, roll] of bySection) {
    for (const sub of ac.subjects) {
      const pairs = roll.filter(s => typeof s.tml[sub] === 'number' && typeof s.tmlBefore[sub] === 'number');
      if (pairs.length < 2) continue;
      const now = mean(pairs.map(s => s.tml[sub]))!;
      const was = mean(pairs.map(s => s.tmlBefore[sub]))!;
      const delta = now - was;
      if (delta > -5) continue;
      const falling = pairs.filter(s => s.tml[sub] < s.tmlBefore[sub]).length;
      const ts = teachersOf(d, cls, sub);
      out.push(make({
        key: `tml-decline:${normClass(cls)}:${sub}`, module: 'academics',
        severity: 40 + Math.abs(delta) * 3 + (now < 50 ? 10 : 0),
        title: `${cls} ${subjectName(sub)} down ${Math.abs(delta)} points in a fortnight`,
        summary: `${falling} of ${pairs.length} students with evidence slipped. The class is now at ${now}%, from ${was}%.`,
        evidence: [
          { label: 'Now', value: `${now}%`, tone: now < 50 ? 'r' : 'a' },
          { label: 'A fortnight ago', value: `${was}%` },
          { label: 'Students slipping', value: `${falling}/${pairs.length}`, tone: 'r' },
          { label: 'Taught by', value: ts.map(t => t.name).join(', ') || 'No teacher assigned' },
        ],
        actions: [
          { kind: 'link', label: 'Open the cell', href: `/admin/academic?grade=${roll[0].grade ?? ''}&subject=${encodeURIComponent(sub)}` },
          ...ts.map(t => ({
            kind: 'nudge_teacher' as const, label: `Nudge ${t.name.split(' ')[0]}`, teacherId: t.id, teacherName: t.name, perm: 'workforce.read' as Perm,
            message: `${cls} ${subjectName(sub)} has dropped from ${was}% to ${now}% TML over the last fortnight (${falling} of ${pairs.length} students slipping). Could you look at the Mastery Tracker and set some targeted practice?`,
          })),
        ],
        fingerprint: `${band(delta, 5)}:${band(now, 10)}`, teacherIds: ts.map(t => t.id), sections: [cls],
      }));
    }
  }

  // A2 · weakest cell with enough evidence
  for (const c of ac.matrix.filter(m => m.tml !== null && m.n >= 2 && m.tml < 55)) {
    const others = ac.matrix.filter(m => m.grade === c.grade && m.subject !== c.subject && m.tml !== null);
    const lo = others.length ? Math.min(...others.map(m => m.tml!)) : null;
    const subjectProblem = lo !== null && lo >= c.tml! + 7;
    out.push(make({
      key: `weak-cell:${c.grade}:${c.subject}`, module: 'academics',
      severity: 30 + (55 - c.tml!) * 1.5 + (subjectProblem ? 5 : 0),
      title: `Grade ${c.grade} ${subjectName(c.subject)} at ${c.tml}%`,
      summary: subjectProblem
        ? `Every other Grade ${c.grade} subject is at ${lo}% or above, so this points at the subject (teaching, sequencing or staffing), not the cohort.`
        : `Other Grade ${c.grade} subjects are also low, so look at the cohort as well as the subject.`,
      evidence: [
        { label: 'Cell TML', value: `${c.tml}%`, tone: c.tml! < 40 ? 'r' : 'a' },
        { label: 'Students with evidence', value: String(c.n) },
        { label: 'Sections below 60%', value: `${c.sectionsBelow}/${c.sections}` },
        ...(lo !== null ? [{ label: `Lowest other Grade ${c.grade} subject`, value: `${lo}%` }] : []),
      ],
      actions: [{ kind: 'link', label: 'Open the cell', href: `/admin/academic?grade=${c.grade}&subject=${encodeURIComponent(c.subject)}` }],
      fingerprint: `${band(c.tml!, 5)}`,
      teacherIds: d.academics.sections.filter(s => s.grade === c.grade).flatMap(s => teachersOf(d, s.cls, c.subject).map(t => t.id)),
      sections: d.academics.sections.filter(s => s.grade === c.grade).map(s => s.cls),
    }));
  }

  // A3 · blind spots: sections where most students have no graded work
  for (const sec of ac.sections) {
    if (sec.students < 2) continue;
    const share = sec.evidenced / sec.students;
    if (share >= 0.5) continue;
    const ts = teachersOf(d, sec.cls);
    const quiet = ts.filter(t => t.posted30 === 0);
    out.push(make({
      key: `blind-spot:${normClass(sec.cls)}`, module: 'academics',
      severity: 25 + (0.5 - share) * 40 + (quiet.length ? 10 : 0),
      title: `${sec.cls}: ${sec.students - sec.evidenced} of ${sec.students} students have no graded work`,
      summary: 'Without confirmed homework or quiz grades, their mastery is invisible and nobody will be flagged as falling behind.'
        + (quiet.length ? ` ${quiet.map(t => t.name).join(', ')} posted nothing in 30 days.` : ''),
      evidence: [
        { label: 'Evidence coverage', value: `${Math.round(share * 100)}%`, tone: share < 0.25 ? 'r' : 'a' },
        { label: 'Teachers', value: ts.map(t => `${t.name} (${t.posted30} posted)`).join(', ') || 'None assigned' },
      ],
      actions: quiet.map(t => ({
        kind: 'nudge_teacher' as const, label: `Nudge ${t.name.split(' ')[0]}`, teacherId: t.id, teacherName: t.name, perm: 'workforce.read' as Perm,
        message: `Most of ${sec.cls} has no graded work on Sthara yet, so their mastery can't be tracked. Could you set and grade a short homework or quiz this week?`,
      })),
      fingerprint: `${band(share * 100, 20)}`, teacherIds: ts.map(t => t.id), sections: [sec.cls],
    }));
  }

  // A4 · at-risk clusters
  for (const sec of ac.sections) {
    if (sec.atRisk < 2 || sec.evidenced === 0 || sec.atRisk / sec.evidenced < 0.2) continue;
    out.push(make({
      key: `at-risk-cluster:${normClass(sec.cls)}`, module: 'academics',
      severity: 50 + (sec.atRisk / sec.evidenced) * 40,
      title: `${sec.atRisk} students below ${AT_RISK}% in ${sec.cls}`,
      summary: `${Math.round((sec.atRisk / sec.evidenced) * 100)}% of the section's evidenced students are at risk: a cluster, not isolated cases.`,
      evidence: [{ label: 'At risk', value: `${sec.atRisk}/${sec.evidenced}`, tone: 'r' }, { label: 'Section TML', value: sec.tml !== null ? `${sec.tml}%` : '—' }],
      actions: [{ kind: 'link', label: 'See the students', href: '/admin/academic#at-risk' }],
      fingerprint: `${sec.atRisk}`, teacherIds: teachersOf(d, sec.cls).map(t => t.id), sections: [sec.cls],
    }));
  }

  // A5 · school TML trend over 8 weeks
  const pts = d.tmlSeries.filter(p => p.tml !== null);
  if (pts.length >= 3) {
    const first = pts[Math.max(0, pts.length - 5)].tml!;
    const last = pts[pts.length - 1].tml!;
    if (last - first <= -4) {
      out.push(make({
        key: 'school-trend', module: 'academics', severity: 45 + (first - last) * 2,
        title: `School-wide TML down ${first - last} points in a month`,
        summary: `From ${first}% to ${last}%. Check whether it's broad or driven by a few sections below.`,
        evidence: [{ label: 'Now', value: `${last}%`, tone: 'a' }, { label: 'Four weeks ago', value: `${first}%` }],
        series: { label: 'School-wide TML by week', unit: '%', points: d.tmlSeries.map(p => ({ x: fmtDate(p.week, true), y: p.tml })) },
        actions: [{ kind: 'link', label: 'Open academic health', href: '/admin/academic' }],
        fingerprint: `${band(first - last, 3)}`,
      }));
    }
  }

  // A6 · thin evidence
  const c = ac.confidence;
  const total = c.firm + c.provisional + c.insufficient;
  if (total >= 10 && c.firm / total < 0.3) {
    out.push(make({
      key: 'thin-evidence', module: 'academics', severity: 22,
      title: `Only ${Math.round((c.firm / total) * 100)}% of topic scores are firm`,
      summary: 'Most scores rest on fewer than five pieces of evidence, so small changes swing them. More graded homework and quizzes per topic steady them.',
      evidence: [{ label: 'Firm', value: String(c.firm) }, { label: 'Provisional', value: String(c.provisional) }, { label: 'Too little to judge', value: String(c.insufficient) }],
      actions: [{ kind: 'link', label: 'Open academic health', href: '/admin/academic' }],
      fingerprint: `${band((c.firm / total) * 100, 10)}`,
    }));
  }
  return out;
}

// ── Workforce ───────────────────────────────────────────────────────────────
function workforce(d: AdminDesk, today: string): Finding[] {
  const out: Finding[] = [];
  const wf = d.workforce;

  for (const t of wf.teachers) {
    // W1 · grading SLA
    const late = t.oldestPendingDays ?? 0;
    if (t.backlog >= 10 || late > 7) {
      out.push(make({
        key: `grading:${t.id}`, module: 'workforce', severity: 30 + Math.min(40, late * 2) + Math.min(15, t.backlog / 4),
        title: `${t.name}: ${plural(t.backlog, 'submission')} waiting, oldest ${plural(late, 'day')}`,
        summary: 'Ungraded work doesn\'t count toward TML, so these students\' mastery is out of date and nobody gets feedback.',
        evidence: [
          { label: 'Waiting', value: String(t.backlog), tone: t.backlog > 30 ? 'r' : 'a' },
          { label: 'Oldest', value: `${late} days`, tone: late > 14 ? 'r' : 'a' },
          { label: 'Graded in 30 days', value: String(t.graded30) },
        ],
        actions: [
          { kind: 'nudge_teacher', label: `Nudge ${t.name.split(' ')[0]}`, teacherId: t.id, teacherName: t.name, perm: 'workforce.read',
            message: `You have ${t.backlog} submissions waiting for review, the oldest from ${late} days ago. Grades only count toward students' TML once you confirm them.` },
          { kind: 'link', label: 'Open workforce', href: `/admin/staff?teacher=${t.id}` },
        ],
        fingerprint: `${band(t.backlog, 10)}:${band(late, 7)}`, teacherIds: [t.id],
      }));
    }
    // W2 · inactive
    if (t.activity === 'none' && !t.onLeaveToday && t.scope.length) {
      out.push(make({
        key: `inactive:${t.id}`, module: 'workforce', severity: 32,
        title: `${t.name}: no activity on Sthara in 30 days`,
        summary: `Teaches ${t.classes.join(', ')} (${plural(t.students, 'student')}) but posted no work, planned no lessons and confirmed no grades.`,
        evidence: [{ label: 'Last active', value: t.lastActive ? fmtDate(t.lastActive) : 'Never' }, { label: 'Students', value: String(t.students) }],
        actions: [
          { kind: 'nudge_teacher', label: `Nudge ${t.name.split(' ')[0]}`, teacherId: t.id, teacherName: t.name, perm: 'workforce.read',
            message: 'We haven\'t seen any homework, quizzes or lesson plans from you on Sthara in the last month. Is anything getting in the way? The office can help you get set up.' },
        ],
        fingerprint: 'inactive', teacherIds: [t.id],
      }));
    }
  }

  // W3 · leave coverage crunch in the next 14 days
  const horizon = Array.from({ length: 14 }, (_, i) => { const x = new Date(`${today}T00:00:00`); x.setDate(x.getDate() + i); return isoDay(x); });
  const threshold = Math.max(2, Math.ceil(wf.teachers.length * 0.2));
  const away = (day: string) => wf.leave.filter(l => (l.status === 'approved' || l.status === 'pending') && l.from <= day && l.to >= day);
  const crunch = horizon.map(day => ({ day, list: away(day) })).filter(x => new Set(x.list.map(l => l.staffId)).size >= threshold);
  if (crunch.length) {
    const worst = crunch.reduce((a, b) => (new Set(b.list.map(l => l.staffId)).size > new Set(a.list.map(l => l.staffId)).size ? b : a));
    const n = new Set(worst.list.map(l => l.staffId)).size;
    out.push(make({
      key: `leave-crunch:${crunch[0].day}`, module: 'workforce', needs: 'leave.approve',
      severity: 45 + (n / Math.max(1, wf.teachers.length)) * 50,
      title: `${n} teachers away on ${fmtDate(worst.day, true)}`,
      summary: `${plural(crunch.length, 'day')} in the next fortnight have ${threshold} or more teachers on leave (approved or pending). Check cover before approving more.`,
      evidence: [
        { label: 'Days affected', value: crunch.map(c => fmtDate(c.day, true)).join(', ') },
        { label: `Away on ${fmtDate(worst.day, true)}`, value: [...new Set(worst.list.map(l => `${l.staffName}${l.status === 'pending' ? ' (pending)' : ''}`))].join(', '), tone: 'a' },
      ],
      actions: [{ kind: 'link', label: 'Review leave', href: '/admin/staff#leave' }],
      fingerprint: `${n}:${crunch.length}`,
    }));
  }

  // W4 · pending leave about to start
  for (const l of wf.pendingLeave) {
    const inDays = daysBetween(today, l.from);
    if (inDays > 2) continue;
    const bal = wf.balances[l.staffId]?.find(b => b.type === l.type);
    out.push(make({
      key: `leave-pending:${l.id}`, module: 'workforce', needs: 'leave.approve', severity: inDays <= 0 ? 62 : 52,
      title: `${l.staffName}'s leave ${inDays <= 0 ? 'has started' : inDays === 1 ? 'starts tomorrow' : 'starts in 2 days'} without a decision`,
      summary: `${l.days} day${l.days === 1 ? '' : 's'} from ${fmtDate(l.from, true)}: "${l.reason}".`,
      evidence: [
        { label: 'Type', value: l.type },
        ...(bal && bal.entitled !== null ? [{ label: 'Balance after approval', value: String((bal.left ?? 0)), tone: (bal.left ?? 0) < 0 ? 'r' as const : undefined }] : []),
      ],
      actions: [{ kind: 'link', label: 'Decide', href: '/admin/staff#leave' }],
      fingerprint: `${Math.max(0, inDays)}`,
    }));
  }

  // W5 · over entitlement
  for (const t of wf.teachers) {
    for (const b of wf.balances[t.id] || []) {
      if (b.entitled === null || b.used <= b.entitled) continue;
      out.push(make({
        key: `leave-over:${t.id}:${b.type}`, module: 'workforce', severity: 26,
        title: `${t.name} has taken ${b.used - b.entitled} day${b.used - b.entitled === 1 ? '' : 's'} of ${b.label.toLowerCase()} beyond entitlement`,
        summary: `${b.used} taken against ${b.entitled} a year. Decide whether the excess becomes leave without pay.`,
        evidence: [{ label: 'Entitled', value: String(b.entitled) }, { label: 'Taken', value: String(b.used), tone: 'r' }],
        actions: [{ kind: 'link', label: 'Open workforce', href: `/admin/staff?teacher=${t.id}` }],
        fingerprint: `${b.used}`, teacherIds: [t.id],
      }));
    }
  }
  return out;
}

// ── Finance ─────────────────────────────────────────────────────────────────
function finance(d: AdminDesk, today: string): Finding[] {
  const out: Finding[] = [];
  const L = d.fees;
  const T = L.totals;

  // F1 · ageing 60+
  const old = L.ageing.filter(b => b.key === '61-90' || b.key === '90+');
  const oldAmt = old.reduce((s, b) => s + b.amount, 0);
  if (oldAmt > 0) {
    const fams = L.families.filter(f => f.maxDaysOverdue > 60);
    out.push(make({
      key: 'ageing-60', module: 'finance', severity: 50 + Math.min(35, (oldAmt / Math.max(1, T.outstanding)) * 40),
      title: `${inrShort(oldAmt)} overdue more than 60 days`,
      summary: `${plural(fams.length, 'family', 'families')}; ${Math.round((oldAmt / Math.max(1, T.outstanding)) * 100)}% of everything outstanding. The older a balance, the less likely it's collected.`,
      evidence: old.map(b => ({ label: b.label, value: `${inr(b.amount)} · ${plural(b.families, 'family', 'families')}`, tone: 'r' as const })),
      actions: [
        { kind: 'remind_fees', label: 'Send final notices', studentIds: fams.map(f => f.studentId), perm: 'fees.remind' },
        { kind: 'link', label: 'Open ledger', href: '/admin/fees?view=overdue' },
      ],
      fingerprint: `${band(oldAmt, 25000)}:${fams.length}`,
    }));
  }

  // F2 · collection slippage per instalment, 14+ days after it fell due
  for (const no of [...new Set(L.invoices.map(i => i.instalmentNo))]) {
    const list = L.invoices.filter(i => i.instalmentNo === no && !i.voided);
    const due = list[0]?.dueOn;
    if (!due || daysBetween(due, today) < 14) continue;
    const billed = list.reduce((s, i) => s + i.amount - i.concession, 0);
    const got = list.reduce((s, i) => s + i.paid, 0);
    const rate = billed ? Math.round((got / billed) * 100) : 100;
    if (rate >= 80) continue;
    out.push(make({
      key: `slippage:${no}`, module: 'finance', severity: 40 + (80 - rate) * 0.8,
      title: `${list[0].label}: ${rate}% collected, ${daysBetween(due, today)} days after the due date`,
      summary: `${inr(billed - got)} still open across ${plural(list.filter(i => i.balance > 0).length, 'family', 'families')}.`,
      evidence: [{ label: 'Billed', value: inr(billed) }, { label: 'Collected', value: inr(got), tone: rate < 60 ? 'r' : 'a' }, { label: 'Due', value: fmtDate(due) }],
      actions: [
        { kind: 'remind_fees', label: 'Remind these families', studentIds: list.filter(i => i.balance > 0).map(i => i.studentId), perm: 'fees.remind' },
        { kind: 'link', label: 'Open ledger', href: '/admin/fees?view=outstanding' },
      ],
      fingerprint: `${band(rate, 10)}`,
    }));
  }

  // F3 · unraised due instalments; F4 · unpriced grades
  for (const r of L.runs.filter(r => r.dueOn <= today && r.raised < r.eligible)) {
    out.push(make({
      key: `unraised:${r.no}`, module: 'finance', needs: 'fees.bill', severity: 45 + Math.min(20, daysBetween(r.dueOn, today) / 2),
      title: `${r.label} was due ${fmtDate(r.dueOn, true)} but ${plural(r.eligible - r.raised, 'student')} ${r.eligible - r.raised === 1 ? 'hasn\'t' : 'haven\'t'} been billed`,
      summary: 'Nothing can be collected or chased until the invoices exist.',
      evidence: [{ label: 'Invoiced', value: `${r.raised}/${r.eligible}`, tone: 'a' }],
      actions: [{ kind: 'link', label: 'Raise invoices', href: '/admin/fees#runs' }],
      fingerprint: `${r.eligible - r.raised}`,
    }));
  }
  const unpriced = L.grades.filter(g => g.students > 0 && !g.structure);
  if (unpriced.length) {
    out.push(make({
      key: 'unpriced', module: 'finance', needs: 'fees.bill', severity: 40,
      title: `No fee structure for ${unpriced.map(g => `Grade ${g.grade}`).join(', ')}`,
      summary: `${plural(unpriced.reduce((n, g) => n + g.students, 0), 'student')} can't be invoiced for ${d.session}.`,
      evidence: unpriced.map(g => ({ label: `Grade ${g.grade}`, value: plural(g.students, 'student') })),
      actions: [{ kind: 'link', label: 'Set fees', href: '/admin/fees#structure' }],
      fingerprint: unpriced.map(g => g.grade).join(','),
    }));
  }

  // F5 · overdue families never reminded
  const unreminded = L.families.filter(f => f.overdue > 0 && !f.remindersSent);
  if (unreminded.length) {
    out.push(make({
      key: 'unreminded', module: 'finance', severity: 35 + Math.min(20, unreminded.length),
      title: `${plural(unreminded.length, 'overdue family', 'overdue families')} never reminded`,
      summary: `${inr(unreminded.reduce((s, f) => s + f.overdue, 0))} overdue. Tone is set per family from payment history.`,
      evidence: [
        { label: 'Gentle', value: String(unreminded.filter(f => f.tone === 'gentle').length) },
        { label: 'Firm', value: String(unreminded.filter(f => f.tone === 'firm').length) },
        { label: 'Final', value: String(unreminded.filter(f => f.tone === 'final').length), tone: 'r' },
      ],
      actions: [{ kind: 'remind_fees', label: 'Send reminders', studentIds: unreminded.map(f => f.studentId), perm: 'fees.remind' }],
      fingerprint: `${band(unreminded.length, 5)}`,
    }));
  }

  // F6 · receipts on days that were never closed
  const open = d.dayBook.filter(x => x.day < today && x.receipts > 0 && x.close?.status !== 'closed');
  if (open.length) {
    out.push(make({
      key: 'unclosed-days', module: 'finance', needs: 'fees.dayclose', severity: 30 + Math.min(30, open.length * 5),
      title: `${plural(open.length, 'day')} of receipts not closed`,
      summary: 'Until a day is closed, its receipts can still be backdated or voided without review, and cash isn\'t reconciled.',
      evidence: open.slice(0, 5).map(x => ({ label: fmtDate(x.day, true), value: `${x.receipts} receipts · ${inr(x.total)}${x.close?.status === 'reopened' ? ' (reopened)' : ''}` })),
      actions: [{ kind: 'link', label: 'Open day book', href: '/admin/fees?tab=daybook' }],
      fingerprint: `${open.length}`,
    }));
  }

  // F7 · cash variances
  const variances = d.dayBook.filter(x => x.close?.status === 'closed' && x.close.variance !== 0);
  if (variances.length) {
    const net = variances.reduce((s, x) => s + x.close!.variance, 0);
    out.push(make({
      key: 'cash-variance', module: 'finance', needs: 'fees.void', severity: 45 + Math.min(30, variances.length * 5),
      title: `Cash didn't match receipts on ${plural(variances.length, 'day')}`,
      summary: `Net ${net < 0 ? 'short' : 'over'} by ${inr(Math.abs(net))} in the last 30 days.`,
      evidence: variances.slice(0, 5).map(x => ({ label: fmtDate(x.day, true), value: `${x.close!.variance > 0 ? '+' : ''}${inr(x.close!.variance)}${x.close!.note ? ` · "${x.close!.note}"` : ''}`, tone: 'r' as const })),
      actions: [{ kind: 'link', label: 'Open day book', href: '/admin/fees?tab=daybook' }],
      fingerprint: `${variances.length}:${band(Math.abs(net), 1000)}`,
    }));
  }

  // F8 · concessions awaiting approval; F9 · self-approved concessions
  const pending = d.concessions.filter(c => c.status === 'pending');
  if (pending.length) {
    const oldest = Math.max(...pending.map(c => daysBetween(c.requestedAt.slice(0, 10), today)));
    out.push(make({
      key: 'concessions-pending', module: 'finance', needs: 'fees.concession.approve', severity: 30 + Math.min(25, oldest * 3),
      title: `${plural(pending.length, 'concession')} awaiting approval`,
      summary: `${inr(pending.reduce((s, c) => s + c.amount, 0))} in total; the oldest has waited ${plural(oldest, 'day')}.`,
      evidence: pending.slice(0, 4).map(c => ({ label: d.students.find(s => s.id === c.studentId)?.name ?? 'Student', value: `${inr(c.amount)} · ${c.reason}` })),
      actions: [{ kind: 'link', label: 'Review', href: '/admin/fees?tab=concessions' }],
      fingerprint: `${pending.length}`,
    }));
  }
  const selfApproved = d.concessions.filter(c => c.status === 'approved' && c.selfApproved);
  if (selfApproved.length) {
    out.push(make({
      key: 'self-approved', module: 'finance', needs: 'audit.read', severity: 24,
      title: `${plural(selfApproved.length, 'concession')} approved by the person who requested ${selfApproved.length === 1 ? 'it' : 'them'}`,
      summary: 'This happens when a school has only one approver. Give a second person the finance head role so every concession gets a second look.',
      evidence: [{ label: 'Total', value: inr(selfApproved.reduce((s, c) => s + c.amount, 0)) }],
      actions: [{ kind: 'link', label: 'Manage roles', href: '/admin/access' }],
      fingerprint: `${selfApproved.length}`,
    }));
  }
  return out;
}

// ── Admissions ──────────────────────────────────────────────────────────────
function admissions(d: AdminDesk): Finding[] {
  const out: Finding[] = [];
  const P = d.admissions;
  if (P.stale.length) {
    out.push(make({
      key: 'stale-applicants', module: 'admissions', severity: 25 + Math.min(25, P.stale.length * 3),
      title: `${plural(P.stale.length, 'applicant')} idle for over two weeks`,
      summary: 'Families who hear nothing tend to accept another school\'s offer.',
      evidence: P.stale.slice(0, 5).map(a => ({ label: a.name, value: `${STAGE_ONE[a.stage]} · ${a.daysInStage} days` })),
      actions: [{ kind: 'link', label: 'Open admissions', href: '/admin/admissions' }],
      fingerprint: `${band(P.stale.length, 3)}`,
    }));
  }
  const offers = P.applicants.filter(a => a.stage === 'offer' && a.daysInStage > 14);
  if (offers.length) {
    out.push(make({
      key: 'offers-unconverted', module: 'admissions', severity: 38,
      title: `${plural(offers.length, 'offer')} not accepted after two weeks`,
      summary: 'An offer that sits usually means a family is comparing schools. A call now converts better than a reminder later.',
      evidence: offers.slice(0, 5).map(a => ({ label: a.name, value: `Grade ${a.grade} · ${a.daysInStage} days${a.guardianPhone ? ` · ${a.guardianPhone}` : ''}` })),
      actions: [{ kind: 'link', label: 'Open admissions', href: '/admin/admissions' }],
      fingerprint: `${offers.length}`,
    }));
  }
  for (let i = 1; i < STAGES.length; i++) {
    const f = P.funnel[i];
    if (P.funnel[i - 1].reached < 5 || f.fromPrev === null || f.fromPrev >= 50) continue;
    out.push(make({
      key: `leak:${STAGES[i]}`, module: 'admissions', severity: 30 + (50 - f.fromPrev) * 0.6,
      title: `Only ${f.fromPrev}% move from ${STAGE_ONE[STAGES[i - 1]].toLowerCase()} to ${STAGE_ONE[STAGES[i]].toLowerCase()}`,
      summary: `${P.funnel[i - 1].reached} reached ${STAGE_ONE[STAGES[i - 1]].toLowerCase()}, ${f.reached} went on.`,
      evidence: [{ label: 'Step conversion', value: `${f.fromPrev}%`, tone: 'a' }],
      actions: [{ kind: 'link', label: 'Open admissions', href: '/admin/admissions' }],
      fingerprint: `${band(f.fromPrev, 10)}`,
    }));
  }
  return out;
}

// ── Compliance ──────────────────────────────────────────────────────────────
function compliance(d: AdminDesk, today: string): Finding[] {
  const out: Finding[] = [];
  const C = d.compliance;
  const withParent = new Set(d.students.filter(s => s.verifiedGuardians > 0).map(s => s.id));
  for (const f of C.flags) {
    const type = f.key === 'wellness-consent' ? 'wellness_checkin' : f.key === 'tutor-consent' ? 'ai_tutor' : null;
    // Families who can be asked: a verified parent is linked and this consent isn't on file for the child.
    const missing = type ? d.students.filter(s => withParent.has(s.id) && !s.consents.includes(type)).map(s => s.id) : [];
    out.push(make({
      key: `dpdp:${f.key}`, module: 'compliance', severity: f.tone === 'r' ? 72 : f.key === 'tutor-consent' ? 48 : 38,
      title: f.title, summary: f.detail,
      evidence: type ? [
        { label: 'Consent on file', value: `${C.consents.find(c => c.type === type)?.granted ?? 0}/${d.students.length}`, tone: 'r' },
        { label: 'Students with a verified parent to ask', value: String(missing.length) },
      ] : [{ label: 'Verified-parent coverage', value: `${C.guardianCoverage ?? 0}%`, tone: 'a' }],
      actions: [
        ...(type && missing.length ? [{ kind: 'request_consent' as const, label: `Ask ${plural(missing.length, 'family', 'families')} for consent`, consentType: type, studentIds: missing, perm: 'compliance.act' as Perm }] : []),
        { kind: 'link', label: f.href.startsWith('/admin/directory') ? 'Link parents' : 'Open compliance', href: f.href },
      ],
      fingerprint: type ? `${C.consents.find(c => c.type === type)?.granted ?? 0}` : `${C.studentsWithoutGuardian.length}:${C.unverifiedLinks}`,
    }));
  }
  if (d.filing.status === 'draft' && d.filing.dueOn) {
    const left = daysBetween(today, d.filing.dueOn);
    if (left <= 30) {
      out.push(make({
        key: 'cbse-due', module: 'compliance', needs: 'wellness.read', severity: left < 0 ? 80 : 40 + (30 - left),
        title: left < 0 ? `CBSE wellness report ${plural(-left, 'day')} overdue` : `CBSE wellness report due in ${plural(left, 'day')}`,
        summary: 'Four sections fill from live data; the rest need figures and a signature before filing.',
        evidence: [{ label: 'Due', value: fmtDate(d.filing.dueOn) }],
        actions: [{ kind: 'link', label: 'Review and file', href: '/admin/wellness' }],
        fingerprint: `${band(left, 7)}`,
      }));
    }
  }
  // Access hygiene (school admins only)
  if (d.me.access.can('access.manage')) {
    const office = d.workforce.admins;
    const noRole = office.filter(a => !d.grants.some(g => g.userId === a.id));
    const owners = new Set(d.grants.filter(g => g.role === 'school_admin').map(g => g.userId));
    const expiring = d.grants.filter(g => g.expiresOn && daysBetween(today, g.expiresOn) <= 7);
    if (noRole.length) {
      out.push(make({
        key: 'access:no-role', module: 'compliance', needs: 'access.manage', severity: 28,
        title: `${plural(noRole.length, 'office account')} with no role`, summary: 'They can sign in but see nothing. Give each the role for their job, or remove the account.',
        evidence: noRole.map(a => ({ label: a.name, value: a.email })),
        actions: [{ kind: 'link', label: 'Manage roles', href: '/admin/access' }], fingerprint: `${noRole.length}`,
      }));
    }
    if (owners.size === 1 && office.length > 1) {
      out.push(make({
        key: 'access:single-owner', module: 'compliance', needs: 'access.manage', severity: 22,
        title: 'Only one person can manage access', summary: 'If they\'re away or leave, nobody can change roles. Consider a second school admin.',
        evidence: [{ label: 'School admins', value: '1' }], actions: [{ kind: 'link', label: 'Manage roles', href: '/admin/access' }], fingerprint: '1',
      }));
    }
    if (expiring.length) {
      out.push(make({
        key: 'access:expiring', module: 'compliance', needs: 'access.manage', severity: 26,
        title: `${plural(expiring.length, 'temporary role')} ending within a week`,
        summary: 'Extend them if the arrangement continues; otherwise they lapse on their own.',
        evidence: expiring.map(g => ({ label: office.find(a => a.id === g.userId)?.name ?? 'Account', value: `${g.role} until ${fmtDate(g.expiresOn!, true)}` })),
        actions: [{ kind: 'link', label: 'Manage roles', href: '/admin/access' }], fingerprint: expiring.map(g => g.id).join(','),
      }));
    }
  }
  return out;
}

// ── Correlation, filtering, acknowledgement ─────────────────────────────────
/**
 * Findings about a class and findings about its teacher explain each other:
 * falling TML + a grading backlog is one story, told from two sides. Link
 * them, say why, and raise the class finding (it now has a likely cause).
 */
export function correlate(list: Finding[]): Finding[] {
  const byTeacher = new Map<string, Finding[]>();
  for (const f of list.filter(f => f.module === 'workforce' && f.teacherIds?.length === 1)) {
    byTeacher.set(f.teacherIds![0], [...(byTeacher.get(f.teacherIds![0]) || []), f]);
  }
  return list.map(f => {
    if (f.module !== 'academics' || !f.teacherIds?.length) return f;
    const linked = f.teacherIds.flatMap(id => byTeacher.get(id) || []);
    if (!linked.length) return f;
    for (const w of linked) {
      w.related = [...new Set([...w.related, f.key])];
      w.causes = [...new Set([...w.causes, `In their class: ${f.title}`])];
    }
    const severity = clamp(f.severity + 10);
    return {
      ...f, severity, level: levelOf(severity),
      related: [...new Set([...f.related, ...linked.map(w => w.key)])],
      causes: [...new Set([...f.causes, ...linked.map(w => `Likely cause: ${w.title}`)])],
    };
  });
}

export interface ProbeResult {
  findings: Finding[];
  /** Hidden by an acknowledgement or snooze that still applies. */
  acknowledged: (Finding & { ack: AdminDesk['probeAcks'][number] })[];
  /** Modules this viewer can't see (so the page can say findings may exist there). */
  hiddenModules: Module[];
}

export function probe(d: AdminDesk, now = Date.now()): ProbeResult {
  const today = isoDay(new Date(now));
  const a = d.me.access;
  const all = correlate([
    ...academics(d), ...workforce(d, today), ...finance(d, today), ...admissions(d), ...compliance(d, today),
  ]);
  const visible = all
    .filter(f => a.can(MODULES[f.module].perm) || (f.module === 'compliance' && f.needs && a.can(f.needs)))
    .filter(f => !f.needs || a.can(f.needs))
    .map(f => ({ ...f, actions: f.actions.filter(x => x.kind === 'link' || a.can(x.perm)) }))
    .sort((x, y) => y.severity - x.severity);
  const acks = new Map(d.probeAcks.map(k => [k.key, k]));
  const findings: Finding[] = [];
  const acknowledged: ProbeResult['acknowledged'] = [];
  for (const f of visible) {
    const k = acks.get(f.key);
    const holds = k && (k.status === 'snoozed' ? !!k.snoozeUntil && k.snoozeUntil > today : k.fingerprint === f.fingerprint);
    if (k && holds) acknowledged.push({ ...f, ack: k });
    else findings.push(f);
  }
  return { findings, acknowledged, hiddenModules: (Object.keys(MODULES) as Module[]).filter(m => !a.can(MODULES[m].perm)) };
}

