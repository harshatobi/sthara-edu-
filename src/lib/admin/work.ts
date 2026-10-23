/**
 * "Your work" on the command centre: the jobs this office account's roles can do, each with what is waiting and
 * a direct way in. Every role lands on the dashboard, so each must find its own work there rather than charts
 * alone (the cashier once saw only the fee chart, with the counter two clicks away). Pure, for the tests.
 */
import type { AdminDesk } from './desk';
import type { Perm } from './rbac';

export interface WorkAction { label: string; href: string; primary?: boolean }
export interface WorkItem {
  key: string;
  title: string;
  /** What is waiting, in words; empty when nothing is. */
  detail: string;
  /** How many things wait (null when the count isn't known here). */
  count: number | null;
  tone: 'r' | 'a' | 'g' | 'n';
  actions: WorkAction[];
}

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString('en-IN')} ${x === 1 ? one : many}`;

export function workItems(desk: Pick<AdminDesk, 'me' | 'workforce' | 'admissions' | 'concessions' | 'dayBook' | 'fees' | 'compliance' | 'filing'>, today: string): WorkItem[] {
  const a = desk.me.access;
  const can = (p: Perm) => a.can(p);
  const out: WorkItem[] = [];

  if (can('fees.collect')) {
    out.push({ key: 'counter', title: 'Fee counter', detail: 'Find a student, take the payment, print the receipt.', count: null, tone: 'n',
      actions: [{ label: 'Take a payment', href: '/admin/fees?tab=counter', primary: true }] });
  }
  if (can('fees.dayclose')) {
    const open = desk.dayBook.filter(d => d.receipts > 0 && d.day < today && d.close?.status !== 'closed').length;
    out.push({ key: 'daybook', title: 'Day book', detail: open ? `${n(open, 'day')} of receipts not closed yet.` : 'Every past day with receipts is closed.', count: open,
      tone: open ? 'a' : 'g', actions: [{ label: open ? 'Close the day' : 'Open the day book', href: '/admin/fees?tab=daybook', primary: !!open }] });
  }
  if (can('fees.concession.approve')) {
    const waiting = desk.concessions.filter(c => c.status === 'pending' && c.requestedBy !== desk.me.id).length;
    if (waiting) out.push({ key: 'concessions', title: 'Concessions to decide', detail: `${n(waiting, 'request')} waiting for your approval.`, count: waiting, tone: 'a',
      actions: [{ label: 'Decide', href: '/admin/fees?tab=concessions', primary: true }] });
  }
  if (can('fees.remind')) {
    const overdue = desk.fees.families.filter(f => f.overdue > 0).length;
    if (overdue) out.push({ key: 'remind', title: 'Overdue fees', detail: `${n(overdue, 'family', 'families')} with overdue fees.`, count: overdue, tone: 'r',
      actions: [{ label: 'See overdue families', href: '/admin/fees?view=overdue', primary: true }] });
  }
  if (can('admissions.manage')) {
    const P = desk.admissions;
    const offers = P.applicants.filter(x => x.open && x.stage === 'offer').length;
    const parts = [P.stale.length ? `${n(P.stale.length, 'applicant')} waiting too long in their stage` : '', offers ? `${n(offers, 'offer')} not yet accepted` : ''].filter(Boolean);
    out.push({ key: 'admissions', title: 'Admissions', detail: parts.length ? `${parts.join(' · ')}.` : 'Nobody is waiting on you.', count: P.stale.length + offers,
      tone: P.stale.length ? 'a' : 'n', actions: [{ label: 'New enquiry', href: '/admin/admissions?new=1', primary: true }, { label: 'Open the pipeline', href: '/admin/admissions' }] });
  }
  if (can('leave.approve')) {
    const waiting = desk.workforce.pendingLeave.length;
    out.push({ key: 'leave', title: 'Leave requests', detail: waiting ? `${n(waiting, 'request')} waiting for your decision.` : 'No leave waiting for you.', count: waiting,
      tone: waiting ? 'a' : 'g', actions: [{ label: waiting ? 'Decide' : 'Staff & leave', href: '/admin/staff#leave', primary: !!waiting }] });
  }
  if (can('hr.manage')) {
    out.push({ key: 'hr', title: 'Employee records', detail: 'Hire, change jobs, confirm, renew and exit staff; expiring documents and missing details.', count: null, tone: 'n',
      actions: [{ label: 'Needs attention', href: '/admin/people?tab=attention', primary: true }, { label: 'Add employee', href: '/admin/people?tab=directory' }] });
  }
  if (can('payroll.prepare') || can('payroll.approve')) {
    out.push({ key: 'payroll', title: 'Payroll', detail: can('payroll.approve') ? 'Approve pay runs and settlements, or send them back.' : 'Keep salaries, work out the month and submit it for approval.',
      count: null, tone: 'n', actions: [{ label: 'Pay runs', href: '/admin/payroll', primary: true }] });
  }
  if (can('schedule.academic')) {
    out.push({ key: 'cover', title: 'Timetable and cover', detail: 'Cover today\'s absences, edit or rebuild the timetable.', count: null, tone: 'n',
      actions: [{ label: 'Today\'s cover', href: '/admin/schedule?tab=cover', primary: true }, { label: 'Timetable', href: '/admin/schedule?tab=timetable' }] });
  }
  if (can('schedule.workforce')) {
    out.push({ key: 'staffday', title: 'Staff attendance and shifts', detail: 'Who is in today, late or missing, and the shift rota.', count: null, tone: 'n',
      actions: [{ label: 'Staff attendance', href: '/admin/schedule?tab=attendance', primary: true }, { label: 'Shifts', href: '/admin/schedule?tab=shifts' }] });
  }
  if (can('messages.office')) {
    out.push({ key: 'messages', title: 'Parent messages', detail: 'Read and answer what parents send the school office.', count: null, tone: 'n',
      actions: [{ label: 'Open messages', href: '/admin/messages', primary: true }] });
  }
  if (can('safeguarding.read') || can('incidents.manage')) {
    out.push({ key: 'safety', title: 'Safety alerts and incidents', detail: 'Tutor safety alerts, bullying and child-protection incidents waiting for a decision.', count: null, tone: 'n',
      actions: [{ label: 'Review', href: '/admin/feed', primary: true }] });
  }
  if (can('compliance.act')) {
    const gaps = desk.compliance.flags.length;
    out.push({ key: 'consent', title: 'Consent and DPDP', detail: gaps ? `${n(gaps, 'flag')} open: missing consent, unverified guardians.` : 'No open flags.', count: gaps,
      tone: desk.compliance.flags.some(f => f.tone === 'r') ? 'r' : gaps ? 'a' : 'g', actions: [{ label: gaps ? 'Fix the gaps' : 'Open compliance', href: '/admin/compliance', primary: !!gaps }] });
  }
  if (can('wellness.file') && desk.filing.status !== 'filed') {
    out.push({ key: 'filing', title: 'CBSE wellness filing', detail: desk.filing.dueOn ? `Due ${desk.filing.dueOn}. Fill in the manual sections and file.` : 'Fill in the manual sections and file.',
      count: null, tone: 'a', actions: [{ label: 'Prepare the filing', href: '/admin/wellness', primary: true }] });
  }
  if (can('students.manage')) {
    out.push({ key: 'register', title: 'Student register', detail: 'Admit into the register, correct records, set classes and roll numbers, close the year.', count: null, tone: 'n',
      actions: [{ label: 'Change requests', href: '/admin/students?tab=requests', primary: true }, { label: 'Open the register', href: '/admin/students' }] });
  }
  if (can('health.manage')) {
    out.push({ key: 'health', title: 'Health records', detail: 'Health cards, check-ups, vaccinations, alerts and parents’ requested changes.', count: null, tone: 'n',
      actions: [{ label: 'Open health records', href: '/admin/health', primary: true }] });
  }
  if (can('people.manage')) {
    out.push({ key: 'logins', title: 'Logins', detail: 'Ask Sthara for new logins, remove accounts, set what teachers teach.', count: null, tone: 'n',
      actions: [{ label: 'User directory', href: '/admin/directory', primary: true }] });
  }
  return out;
}
