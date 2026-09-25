/**
 * Fee ledger: pure shaping from fee_structures / fee_invoices / fee_payments /
 * fee_reminders rows. Balances are always derived from receipts (never stored),
 * so the ledger can't drift from what was actually collected.
 */
import { daysBetween, gradeOf, isoDay, r2 } from './format';

export interface ScheduleItem { no: number; label: string; dueOn: string; share: number }

export interface FeeStructure {
  id: string;
  grade: number;
  annualFee: number;
  schedule: ScheduleItem[];
  note: string | null;
  updatedAt: string | null;
}

export type InvoiceStatus = 'paid' | 'partial' | 'due' | 'overdue' | 'void';

export interface Receipt {
  id: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  mode: string;
  reference: string | null;
  paidOn: string;
  receiptNo: string;
  recordedAt: string;
  voided: boolean;
  voidReason: string | null;
}

export interface Invoice {
  id: string;
  studentId: string;
  instalmentNo: number;
  label: string;
  invoiceNo: string;
  dueOn: string;
  amount: number;
  concession: number;
  concessionReason: string | null;
  /** Sum of receipts that aren't void. */
  paid: number;
  /** amount − concession − paid; 0 for a void invoice. */
  balance: number;
  status: InvoiceStatus;
  /** Days past due while there's still a balance; 0 otherwise. */
  daysOverdue: number;
  voided: boolean;
  receipts: Receipt[];
}

export type ReminderTone = 'gentle' | 'firm' | 'final';

export interface Family {
  studentId: string;
  name: string;
  cls: string;
  invoices: Invoice[];
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  maxDaysOverdue: number;
  /** Paid invoices settled after their due date / all settled invoices. */
  lateHistory: { late: number; settled: number };
  remindersSent: number;
  lastReminderAt: string | null;
  tone: ReminderTone;
}

export interface AgeingBucket { key: string; label: string; families: number; amount: number; tone: 'g' | 'a' | 'r' }

export interface GradeFeeRow {
  grade: number;
  students: number;
  structure: FeeStructure | null;
  /** annual fee × students on roll (what the grade should bill this session). */
  expected: number;
}

export interface InstalmentRun {
  no: number;
  label: string;
  dueOn: string;
  /** Students whose grade schedules this instalment. */
  eligible: number;
  raised: number;
}

export interface FeeLedger {
  session: string;
  structures: FeeStructure[];
  grades: GradeFeeRow[];
  runs: InstalmentRun[];
  invoices: Invoice[];
  families: Family[];
  receipts: Receipt[];
  totals: {
    /** Invoiced so far, net of concessions and voids. */
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
    concessions: number;
    /** collected / billed, null before anything is billed. */
    collectionRate: number | null;
    /** Full-year expectation from structures × roll. */
    expectedAnnual: number;
    familiesOverdue: number;
    /** Mean days after the due date that invoices were settled (0 = on time). */
    avgDaysLate: number | null;
  };
  ageing: AgeingBucket[];
  byMode: { mode: string; amount: number; count: number }[];
}

export const PAY_MODES: Record<string, string> = {
  upi: 'UPI', bank_transfer: 'Bank transfer', card: 'Card', cheque: 'Cheque', cash: 'Cash', dd: 'Demand draft',
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function parseSchedule(raw: unknown): ScheduleItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => ({ no: Number(e?.no), label: String(e?.label || '').trim(), dueOn: String(e?.due_on || e?.dueOn || ''), share: Number(e?.share) }))
    .filter(e => Number.isInteger(e.no) && e.no >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(e.dueOn) && e.share > 0)
    .sort((a, b) => a.no - b.no);
}

/**
 * Checks a schedule an admin is about to save. Returns the error to show, or null.
 * Shares must be positive and sum to 1; due dates must run in order inside the session.
 */
export function validateSchedule(items: ScheduleItem[], session: string): string | null {
  if (!items.length) return 'Add at least one instalment.';
  if (items.length > 12) return 'At most 12 instalments.';
  const start = `${session.slice(0, 4)}-04-01`;
  const end = `${Number(session.slice(0, 4)) + 1}-03-31`;
  for (const [i, it] of items.entries()) {
    if (it.no !== i + 1) return 'Instalments must be numbered 1, 2, 3… in order.';
    if (!it.label.trim()) return `Instalment ${it.no} needs a name.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.dueOn)) return `Instalment ${it.no} needs a due date.`;
    if (it.dueOn < start || it.dueOn > end) return `Instalment ${it.no} is due outside the ${session} session.`;
    if (i && it.dueOn <= items[i - 1].dueOn) return `Instalment ${it.no} must be due after instalment ${it.no - 1}.`;
    if (!(it.share > 0)) return `Instalment ${it.no} needs a share above 0%.`;
  }
  const total = items.reduce((s, it) => s + it.share, 0);
  if (Math.abs(total - 1) > 0.0001) return `Instalment shares add up to ${Math.round(total * 1000) / 10}%, not 100%.`;
  return null;
}

/** An even split, due on the 10th of evenly spaced months from April. */
export function evenSchedule(count: number, session: string): ScheduleItem[] {
  const y = Number(session.slice(0, 4));
  const gap = Math.floor(12 / count);
  const share = Math.floor((1 / count) * 10000) / 10000;
  return Array.from({ length: count }, (_, i) => {
    const m = 3 + i * gap; // 0-based month, April = 3
    const yy = y + Math.floor(m / 12);
    const mm = (m % 12) + 1;
    return {
      no: i + 1,
      label: count === 1 ? 'Annual' : count === 2 ? `Term ${i + 1}` : count === 4 ? `Quarter ${i + 1}` : `Instalment ${i + 1}`,
      dueOn: `${yy}-${String(mm).padStart(2, '0')}-10`,
      // The last instalment takes the rounding remainder so shares sum to exactly 1.
      share: i === count - 1 ? r2((1 - share * (count - 1)) * 10000) / 10000 : share,
    };
  });
}

export function shapeStructure(r: any): FeeStructure {
  return {
    id: r.id, grade: Number(r.grade), annualFee: n(r.annual_fee), schedule: parseSchedule(r.schedule),
    note: r.note ?? null, updatedAt: r.updated_at ?? null,
  };
}

function shapeReceipt(p: any): Receipt {
  return {
    id: p.id, invoiceId: p.invoice_id, studentId: p.student_id, amount: n(p.amount), mode: p.mode,
    reference: p.reference ?? null, paidOn: String(p.paid_on).slice(0, 10), receiptNo: p.receipt_no,
    recordedAt: p.recorded_at, voided: !!p.voided_at, voidReason: p.void_reason ?? null,
  };
}

export function shapeInvoice(r: any, receipts: Receipt[], today = isoDay()): Invoice {
  const live = receipts.filter(p => !p.voided);
  const paid = r2(live.reduce((s, p) => s + p.amount, 0));
  const amount = n(r.amount);
  const concession = n(r.concession);
  const voided = !!r.voided_at;
  const balance = voided ? 0 : Math.max(0, r2(amount - concession - paid));
  const dueOn = String(r.due_on).slice(0, 10);
  const daysOverdue = balance > 0 && dueOn < today ? daysBetween(dueOn, today) : 0;
  const status: InvoiceStatus = voided ? 'void' : balance === 0 ? 'paid' : daysOverdue > 0 ? 'overdue' : paid > 0 ? 'partial' : 'due';
  return {
    id: r.id, studentId: r.student_id, instalmentNo: Number(r.instalment_no), label: r.label, invoiceNo: r.invoice_no,
    dueOn, amount, concession, concessionReason: r.concession_reason ?? null, paid, balance, status, daysOverdue, voided,
    receipts: [...receipts].sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1)),
  };
}

/**
 * Reminder tone from the family's own history (canon: "gentle for consistently
 * on-time families, firm for repeat late payers"), escalating with age and
 * with reminders already ignored.
 */
export function reminderTone(maxDaysOverdue: number, lateHistory: { late: number; settled: number }, remindersSent: number): ReminderTone {
  if (maxDaysOverdue > 60 || remindersSent >= 3) return 'final';
  const repeatLate = lateHistory.late >= 2 || (lateHistory.settled > 0 && lateHistory.late / lateHistory.settled > 0.5);
  if (maxDaysOverdue > 30 || repeatLate || remindersSent >= 1) return 'firm';
  return 'gentle';
}

const AGEING: { key: string; label: string; min: number; max: number; tone: 'g' | 'a' | 'r' }[] = [
  { key: 'current', label: 'Not yet due', min: -Infinity, max: 0, tone: 'g' },
  { key: '1-30', label: '1–30 days', min: 1, max: 30, tone: 'a' },
  { key: '31-60', label: '31–60 days', min: 31, max: 60, tone: 'a' },
  { key: '61-90', label: '61–90 days', min: 61, max: 90, tone: 'r' },
  { key: '90+', label: '90+ days', min: 91, max: Infinity, tone: 'r' },
];
export const bucketOf = (daysOverdue: number) => AGEING.find(b => daysOverdue >= b.min && daysOverdue <= b.max)!.key;

export interface LedgerInput {
  session: string;
  students: { id: string; name: string; cls: string }[];
  structures: any[];
  invoices: any[];
  payments: any[];
  reminders: any[];
  today?: string;
}

export function assembleLedger(input: LedgerInput): FeeLedger {
  const today = input.today ?? isoDay();
  const structures = input.structures.map(shapeStructure).sort((a, b) => a.grade - b.grade);
  const receipts = input.payments.map(shapeReceipt).sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  const rByInv = new Map<string, Receipt[]>();
  for (const p of receipts) rByInv.set(p.invoiceId, [...(rByInv.get(p.invoiceId) || []), p]);
  const invoices = input.invoices.map(r => shapeInvoice(r, rByInv.get(r.id) || [], today))
    .sort((a, b) => (a.dueOn === b.dueOn ? a.invoiceNo.localeCompare(b.invoiceNo) : a.dueOn < b.dueOn ? -1 : 1));

  const byStudent = new Map(input.students.map(s => [s.id, s]));
  const remBy = new Map<string, any[]>();
  for (const r of input.reminders) remBy.set(r.student_id, [...(remBy.get(r.student_id) || []), r]);
  const invBy = new Map<string, Invoice[]>();
  for (const i of invoices) invBy.set(i.studentId, [...(invBy.get(i.studentId) || []), i]);

  const families: Family[] = [...invBy].map(([sid, list]) => {
    const live = list.filter(i => !i.voided);
    const settled = live.filter(i => i.status === 'paid' && i.receipts.some(p => !p.voided));
    const late = settled.filter(i => {
      const last = i.receipts.filter(p => !p.voided).map(p => p.paidOn).sort().pop()!;
      return last > i.dueOn;
    }).length;
    const rems = (remBy.get(sid) || []).sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
    const maxDaysOverdue = Math.max(0, ...live.map(i => i.daysOverdue));
    const lateHistory = { late, settled: settled.length };
    const s = byStudent.get(sid);
    return {
      studentId: sid, name: s?.name || 'Former student', cls: s?.cls || '', invoices: list,
      billed: r2(live.reduce((t, i) => t + i.amount - i.concession, 0)),
      paid: r2(live.reduce((t, i) => t + i.paid, 0)),
      outstanding: r2(live.reduce((t, i) => t + i.balance, 0)),
      overdue: r2(live.filter(i => i.daysOverdue > 0).reduce((t, i) => t + i.balance, 0)),
      maxDaysOverdue, lateHistory, remindersSent: rems.length, lastReminderAt: rems[0]?.sent_at ?? null,
      tone: reminderTone(maxDaysOverdue, lateHistory, rems.length),
    };
  }).sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || a.name.localeCompare(b.name));

  const live = invoices.filter(i => !i.voided);
  const billed = r2(live.reduce((t, i) => t + i.amount - i.concession, 0));
  const collected = r2(live.reduce((t, i) => t + i.paid, 0));
  const outstanding = r2(live.reduce((t, i) => t + i.balance, 0));
  const overdue = r2(live.filter(i => i.daysOverdue > 0).reduce((t, i) => t + i.balance, 0));

  const lateDays = live.filter(i => i.status === 'paid' && i.receipts.some(p => !p.voided)).map(i => {
    const last = i.receipts.filter(p => !p.voided).map(p => p.paidOn).sort().pop()!;
    return Math.max(0, daysBetween(i.dueOn, last));
  });

  const ageing: AgeingBucket[] = AGEING.map(b => {
    const open = live.filter(i => i.balance > 0 && bucketOf(i.daysOverdue) === b.key);
    return { key: b.key, label: b.label, tone: b.tone, families: new Set(open.map(i => i.studentId)).size, amount: r2(open.reduce((t, i) => t + i.balance, 0)) };
  });

  const modes = new Map<string, { amount: number; count: number }>();
  for (const p of receipts.filter(p => !p.voided)) {
    const m = modes.get(p.mode) || { amount: 0, count: 0 };
    modes.set(p.mode, { amount: r2(m.amount + p.amount), count: m.count + 1 });
  }

  const rollByGrade = new Map<number, number>();
  for (const s of input.students) { const g = gradeOf(s.cls); if (g) rollByGrade.set(g, (rollByGrade.get(g) || 0) + 1); }
  const gradeKeys = [...new Set([...rollByGrade.keys(), ...structures.map(s => s.grade)])].sort((a, b) => a - b);
  const grades: GradeFeeRow[] = gradeKeys.map(g => {
    const st = structures.find(s => s.grade === g) || null;
    const roll = rollByGrade.get(g) || 0;
    return { grade: g, students: roll, structure: st, expected: st ? r2(st.annualFee * roll) : 0 };
  });

  const runNos = [...new Set(structures.flatMap(s => s.schedule.map(i => i.no)))].sort((a, b) => a - b);
  const runs: InstalmentRun[] = runNos.map(no => {
    const items = structures.flatMap(s => s.schedule.filter(i => i.no === no).map(i => ({ ...i, grade: s.grade })));
    const eligibleGrades = new Set(items.map(i => i.grade));
    const eligibleIds = new Set(input.students.filter(s => eligibleGrades.has(gradeOf(s.cls) ?? -1)).map(s => s.id));
    const first = [...items].sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))[0];
    return {
      no, label: first.label, dueOn: first.dueOn, eligible: eligibleIds.size,
      raised: new Set(invoices.filter(i => i.instalmentNo === no && eligibleIds.has(i.studentId)).map(i => i.studentId)).size,
    };
  });

  return {
    session: input.session, structures, grades, runs, invoices, families, receipts,
    totals: {
      billed, collected, outstanding, overdue,
      concessions: r2(live.reduce((t, i) => t + i.concession, 0)),
      collectionRate: billed > 0 ? Math.round((collected / billed) * 1000) / 10 : null,
      expectedAnnual: r2(grades.reduce((t, g) => t + g.expected, 0)),
      familiesOverdue: families.filter(f => f.overdue > 0).length,
      avgDaysLate: lateDays.length ? Math.round((lateDays.reduce((a, b) => a + b, 0) / lateDays.length) * 10) / 10 : null,
    },
    ageing,
    byMode: [...modes].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.amount - a.amount),
  };
}

/** Reminder text a parent sees, by tone. No emoji; amounts in rupees. */
export function reminderMessage(tone: ReminderTone, childName: string, outstanding: string, oldestDue: string, school: string) {
  const first = childName.split(' ')[0];
  if (tone === 'gentle') {
    return {
      title: `Fee reminder for ${first}`,
      body: `A gentle reminder from ${school}: ${outstanding} is due for ${first} (since ${oldestDue}). If you've already paid, please ignore this note.`,
    };
  }
  if (tone === 'firm') {
    return {
      title: `Fees overdue for ${first}`,
      body: `${school}: ${outstanding} for ${first} is overdue since ${oldestDue}. Please clear it this week, or contact the accounts office to set up a plan.`,
    };
  }
  return {
    title: `Final notice: fees for ${first}`,
    body: `${school}: ${outstanding} for ${first} has been overdue since ${oldestDue} despite earlier reminders. Please contact the accounts office within 7 days.`,
  };
}

// ── Day book ────────────────────────────────────────────────────────────────
export interface DayBookDay {
  day: string;
  receipts: number;
  total: number;
  byMode: Record<string, number>;
  byRecorder: { id: string | null; count: number; amount: number }[];
  cash: number;
  close: { status: 'closed' | 'reopened'; closedBy: string | null; closedAt: string; cashCounted: number; variance: number; note: string | null; reopenReason: string | null } | null;
}

/** Receipts grouped by the day they were received, newest first, with each day's close (if any). */
export function dayBook(receipts: Receipt[], payRows: any[], closes: any[], days = 30, today = isoDay()): DayBookDay[] {
  const recorder = new Map(payRows.map(p => [p.id, p.recorded_by ?? null]));
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - (days - 1));
  const start = isoDay(from);
  const live = receipts.filter(p => !p.voided && p.paidOn >= start && p.paidOn <= today);
  const dates = new Set([...live.map(p => p.paidOn), ...closes.map(c => String(c.day)).filter(d => d >= start && d <= today)]);
  return [...dates].sort().reverse().map(day => {
    const list = live.filter(p => p.paidOn === day);
    const byMode: Record<string, number> = {};
    const rec = new Map<string | null, { count: number; amount: number }>();
    for (const p of list) {
      byMode[p.mode] = r2((byMode[p.mode] || 0) + p.amount);
      const k = recorder.get(p.id) ?? null;
      const cur = rec.get(k) || { count: 0, amount: 0 };
      rec.set(k, { count: cur.count + 1, amount: r2(cur.amount + p.amount) });
    }
    const c = closes.find(x => String(x.day) === day);
    return {
      day, receipts: list.length, total: r2(list.reduce((s, p) => s + p.amount, 0)), byMode,
      byRecorder: [...rec].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount),
      cash: byMode.cash || 0,
      close: c ? {
        status: c.status, closedBy: c.closed_by ?? null, closedAt: c.closed_at, cashCounted: Number(c.cash_counted),
        variance: Number(c.variance ?? Number(c.cash_counted) - Number(c.cash_expected)), note: c.note ?? null, reopenReason: c.reopen_reason ?? null,
      } : null,
    };
  });
}

// ── Concession requests ─────────────────────────────────────────────────────
export interface ConcessionRequest {
  id: string; invoiceId: string; studentId: string; amount: number; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedBy: string | null; requestedAt: string; decidedBy: string | null; decidedAt: string | null; note: string | null; selfApproved: boolean;
}
export const shapeConcession = (r: any): ConcessionRequest => ({
  id: r.id, invoiceId: r.invoice_id, studentId: r.student_id, amount: Number(r.amount), reason: r.reason, status: r.status,
  requestedBy: r.requested_by ?? null, requestedAt: r.requested_at, decidedBy: r.decided_by ?? null, decidedAt: r.decided_at ?? null,
  note: r.decision_note ?? null, selfApproved: !!r.self_approved,
});

// ── Collection forecast ─────────────────────────────────────────────────────
export interface ForecastMonth {
  month: string;      // YYYY-MM
  /** Net amount falling due that month: raised invoices, plus scheduled instalments not yet raised. */
  due: number;
  /** Of which not yet invoiced (an estimate from structure × roll). */
  unraised: number;
  collected: number;
  /** Still open on invoices due that month. */
  open: number;
}

/**
 * Month by month across the session: what falls due and what has been collected.
 * Collected is by receipt date, so early and late payments land in the month the money came in.
 */
export function forecast(L: FeeLedger, students: { id: string; cls: string }[]): ForecastMonth[] {
  const y = Number(L.session.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = 3 + i;
    return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
  });
  const live = L.invoices.filter(i => !i.voided);
  const invoiced = new Set(live.map(i => `${i.studentId}::${i.instalmentNo}`));
  return months.map(month => {
    const inv = live.filter(i => i.dueOn.slice(0, 7) === month);
    let unraised = 0;
    for (const st of L.structures) {
      for (const it of st.schedule.filter(x => x.dueOn.slice(0, 7) === month)) {
        const roll = students.filter(s => gradeOf(s.cls) === st.grade && !invoiced.has(`${s.id}::${it.no}`)).length;
        unraised += st.annualFee * it.share * roll;
      }
    }
    const collected = L.receipts.filter(p => !p.voided && p.paidOn.slice(0, 7) === month).reduce((s, p) => s + p.amount, 0);
    return {
      month, unraised: r2(unraised), due: r2(inv.reduce((s, i) => s + i.amount - i.concession, 0) + unraised),
      collected: r2(collected), open: r2(inv.reduce((s, i) => s + i.balance, 0)),
    };
  });
}
