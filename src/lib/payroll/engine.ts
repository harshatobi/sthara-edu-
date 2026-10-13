/**
 * Payroll arithmetic: what one person is paid for one month, and why. Pure, shared by the pay-run routes, the
 * payroll pages, payslips and tests. Every figure a run stores is produced here from inputs the server gathers
 * (salary, attendance, records, rates), so a line can always be explained and re-derived.
 *
 * Amounts are whole rupees. Rates and slabs come from dated tables (Sthara's, or a school's override).
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type DayBasis = 'calendar' | 'fixed30' | 'working26';
export const DAY_BASIS: Record<DayBasis, string> = { calendar: 'Calendar days of the month', fixed30: 'Fixed 30 days', working26: '26 working days' };
export const COUNT_SOURCES = {
  sessions: 'Visiting sessions taken', duties: 'Duties (gate, bus, lunch, corridor)', duty_hours: 'Duty hours', invigilation: 'Exam invigilations',
  event_duty: 'Event duties', covers: 'Cover lessons taken', lessons: 'Own lessons taught',
} as const;
export type CountSource = keyof typeof COUNT_SOURCES;
export type Counts = Partial<Record<CountSource, number>>;

export interface PayItem {
  id: string; code: string; name: string; kind: 'earning' | 'deduction'; calc: 'fixed' | 'percent' | 'rate_count';
  percentOf: 'basic' | 'basic_da' | 'gross' | null; countSource: CountSource | null; threshold: number; defaultValue: number;
  role: 'basic' | 'da' | 'hra' | null; taxable: boolean; pfWage: boolean; esiWage: boolean; prorate: boolean; sort: number; active: boolean;
}
export interface SalaryLine { itemId: string; value: number }
export interface Salary { id: string; staffMemberId: string; effectiveFrom: string; lines: SalaryLine[]; templateId?: string | null; reason?: string | null }
export interface SchoolPay {
  dayBasis: DayBasis; pfEnabled: boolean; pfPolicy: 'capped' | 'full'; pfCode: string | null; esiEnabled: boolean; esiCode: string | null;
  ptState: string | null; tdsEnabled: boolean; tan: string | null; employerPan: string | null; bonusEnabled: boolean; bonusMonth: number; gratuityEnabled: boolean;
}
export const DEFAULT_SCHOOL_PAY: SchoolPay = {
  dayBasis: 'calendar', pfEnabled: false, pfPolicy: 'capped', pfCode: null, esiEnabled: false, esiCode: null, ptState: null, tdsEnabled: true,
  tan: null, employerPan: null, bonusEnabled: false, bonusMonth: 10, gratuityEnabled: true,
};
export interface PersonPay {
  taxRegime: 'new' | 'old'; pfMode: 'policy' | 'exempt' | 'capped' | 'full'; vpfPct: number; esiExempt: boolean; ptExempt: boolean; tdsExempt: boolean;
  payMode: 'bank' | 'cash' | 'cheque'; onHold: boolean; holdReason: string | null;
}
export const DEFAULT_PERSON_PAY: PersonPay = { taxRegime: 'new', pfMode: 'policy', vpfPct: 0, esiExempt: false, ptExempt: false, tdsExempt: false, payMode: 'bank', onHold: false, holdReason: null };

export interface Slab { upto: number | null; pct?: number; amount?: number }
export interface TaxTable {
  standard_deduction: number; slabs: Slab[]; rebate_income: number; rebate_max: number; marginal_relief?: boolean; cess_pct: number;
  surcharge?: { above: number; pct: number }[]; senior_exemption?: number; super_senior_exemption?: number;
  caps?: { c80: number; d80: number; home_loan_interest: number; nps_80ccd1b: number };
}
export interface Rates {
  pf: { employee_pct: number; employer_pct: number; eps_pct: number; ceiling: number; admin_pct: number; edli_pct: number };
  esi: { employee_pct: number; employer_pct: number; ceiling: number };
  pt: { slabs: Slab[]; february_amount?: number } | null;
  itNew: TaxTable; itOld: TaxTable;
  bonus: { pct: number; wage_ceiling: number; calc_ceiling: number };
  gratuity: { min_years: number; days: number; divisor: number; cap: number };
}
export interface RateRow { key: string; effectiveFrom: string; value: any; override?: boolean; reason?: string | null; note?: string | null }

export type LineSource = 'salary' | 'rule' | 'adjustment' | 'override' | 'arrears' | 'statutory' | 'loan' | 'settlement' | 'bonus';
export interface PayLine {
  code: string; name: string; amount: number; source: LineSource; itemId?: string | null; taxable?: boolean; pfWage?: number; esiWage?: number;
  /** What the full month would have paid, before loss of pay and part-month. */ full?: number;
  count?: number; rate?: number; note?: string; loanId?: string; forMonth?: string; role?: PayItem['role'];
  /** The wage a statutory deduction was worked on. */ base?: number;
}
export interface Days { calDays: number; basis: number; from: string; to: string; employed: number; lop: number; payable: number; factor: number }
export interface Declaration { c80?: number; d80?: number; rent_annual?: number; metro?: boolean; home_loan_interest?: number; nps_80ccd1b?: number; other_income?: number; prev_income?: number; prev_tds?: number }
export interface TaxWork {
  regime: 'new' | 'old'; fy: string; monthsLeft: number; incomeToDate: number; incomeThisMonth: number; incomeProjected: number; otherIncome: number;
  grossAnnual: number; standardDeduction: number; professionalTax: number; hraExemption: number; chapterVIA: number; taxableIncome: number;
  taxOnIncome: number; rebate: number; surcharge: number; cess: number; annualTax: number; deductedToDate: number; thisMonth: number;
}
export type Flag = 'attendance_open' | 'no_bank' | 'no_pan' | 'no_uan' | 'no_esi_no' | 'negative_net' | 'on_hold' | 'pt_no_state' | 'bonus_no_history' | 'zero_pay' | 'gratuity_not_due';
export const FLAGS: Record<Flag, string> = {
  attendance_open: 'Attendance for the month is not confirmed, so no loss of pay was applied', no_bank: 'No bank account on record',
  no_pan: 'Tax is being deducted but there is no PAN on record', no_uan: 'PF is being deducted but there is no UAN on record',
  no_esi_no: 'ESI is being deducted but there is no ESI number on record', negative_net: 'Deductions are more than earnings',
  on_hold: 'Pay is on hold', pt_no_state: 'No professional tax state is set for the school', bonus_no_history: 'Bonus is due this month but there are no approved runs for last year to work it from; add it by hand',
  zero_pay: 'Nothing to pay this month', gratuity_not_due: 'Service is under the qualifying period, so no gratuity',
};

export interface PriorMonth {
  month: string; days: Days; paid: Record<string, number>; arrearsPaid: number;
  /** Items HR set by hand that month: a deliberate figure, so never revisited as arrears. */ overridden?: string[];
}
export interface LoanDue { id: string; kind: 'advance' | 'loan'; instalment: number; outstanding: number; startMonth: string }
export interface Adjustment { id?: string; mode: 'add' | 'override'; itemId: string | null; kind: 'earning' | 'deduction'; label: string; amount: number; taxable: boolean; note: string }
export interface Settlement { lastDay: string; leaveDays: number; noticeShortDays: number; gratuity: 'auto' | 'none' | number; includeSalary: boolean }
export interface LineInput {
  month: string;                       // YYYY-MM-01
  joinedOn: string | null; lastDay: string | null; dateOfBirth?: string | null;
  salaries: Salary[]; items: PayItem[]; school: SchoolPay; person: PersonPay; rates: Rates;
  /** Confirmed loss-of-pay days, or null when the month's attendance isn't confirmed. */ lopDays: number | null;
  counts: Counts; adjustments: Adjustment[]; loans: LoanDue[];
  /** Approved lines earlier in this financial year. */ ytd: { taxable: number; pfEmployee: number; pt: number; tds: number };
  declaration: Declaration | null;
  /** Approved months whose salary may have been revised since (for arrears). */ prior: PriorMonth[];
  /** Sum over last financial year's approved months of min(Basic + DA earned, bonus calculation ceiling); null: no history. */ bonusBase?: number | null;
  has: { bank: boolean; pan: boolean; uan: boolean; esiNo: boolean };
  settlement?: Settlement | null;
}
export interface LineResult {
  days: Days; earnings: PayLine[]; deductions: PayLine[]; employer: PayLine[]; tax: TaxWork | null;
  gross: number; totalDeductions: number; net: number; flags: Flag[]; recoveries: { loanId: string; amount: number }[];
}

// ── Dates ───────────────────────────────────────────────────────────────────
const utc = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const monthEnd = (month: string) => `${month.slice(0, 7)}-${String(daysIn(month)).padStart(2, '0')}`;
export function addMonth(month: string, n: number): string {
  return iso(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (month: string, short = false) => `${short ? MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3) : MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
/** The financial year (April to March) a month falls in, as "2026-27". */
export function fyOf(month: string): string {
  const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
export const fyStart = (fy: string) => `${fy.slice(0, 4)}-04-01`;
export const fyEnd = (fy: string) => `${Number(fy.slice(0, 4)) + 1}-03-31`;
/** Months from this one to March, counting this one. */
export const monthsLeftInFy = (month: string) => ((3 - Number(month.slice(5, 7)) + 12) % 12) + 1;
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
const rupee = (n: number) => Math.round(n + Number.EPSILON);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The rate in force on a date: the latest dated row, a school's override winning over Sthara's on the same date. */
export function rateOn(rows: RateRow[], key: string, date: string): RateRow | null {
  let best: RateRow | null = null;
  for (const r of rows) {
    if (r.key !== key || r.effectiveFrom > date) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom || (r.effectiveFrom === best.effectiveFrom && r.override && !best.override)) best = r;
  }
  return best;
}
export function ratesOn(rows: RateRow[], date: string, ptState: string | null): Rates | { missing: string } {
  const need = (k: string) => rateOn(rows, k, date)?.value;
  const out = { pf: need('pf'), esi: need('esi'), itNew: need('it:new'), itOld: need('it:old'), bonus: need('bonus'), gratuity: need('gratuity') };
  for (const [k, v] of Object.entries(out)) if (!v) return { missing: k };
  return { ...out, pt: ptState ? need(`pt:${ptState}`) ?? null : null } as Rates;
}

// ── Salary ──────────────────────────────────────────────────────────────────
/** The salary in force on a date. */
export function salaryOn(salaries: Salary[], date: string): Salary | null {
  let best: Salary | null = null;
  for (const s of salaries) if (s.effectiveFrom <= date && (!best || s.effectiveFrom > best.effectiveFrom)) best = s;
  return best;
}

/**
 * A salary's full-month amount for each fixed and percentage item. Fixed items first, then percentages of Basic
 * (or Basic + DA), then percentages of gross (the sum of the other earnings).
 */
export function monthlyFull(lines: SalaryLine[], items: PayItem[]): Map<string, number> {
  const byId = new Map(items.map(i => [i.id, i]));
  const out = new Map<string, number>();
  const mine = lines.map(l => ({ l, i: byId.get(l.itemId) })).filter((x): x is { l: SalaryLine; i: PayItem } => !!x.i && x.i.calc !== 'rate_count');
  for (const { l, i } of mine) if (i.calc === 'fixed') out.set(i.id, l.value);
  const roleSum = (roles: string[]) => sum(mine.filter(x => x.i.kind === 'earning' && x.i.role && roles.includes(x.i.role)).map(x => out.get(x.i.id) ?? 0));
  for (const { l, i } of mine) if (i.calc === 'percent' && i.percentOf !== 'gross') out.set(i.id, (l.value / 100) * roleSum(i.percentOf === 'basic' ? ['basic'] : ['basic', 'da']));
  const gross = sum(mine.filter(x => x.i.kind === 'earning').map(x => out.get(x.i.id) ?? 0));
  for (const { l, i } of mine) if (i.calc === 'percent' && i.percentOf === 'gross') out.set(i.id, (l.value / 100) * gross);
  return out;
}
/** Full-month figures a salary implies: gross earnings, Basic + DA, HRA, and the taxable part. */
export function salarySummary(lines: SalaryLine[], items: PayItem[]) {
  const full = monthlyFull(lines, items), byId = new Map(items.map(i => [i.id, i]));
  let gross = 0, basicDa = 0, hra = 0, taxable = 0, deductions = 0, pfWage = 0, esiWage = 0;
  for (const [id, amt] of full) {
    const i = byId.get(id)!;
    if (i.kind === 'deduction') { deductions += amt; continue; }
    gross += amt;
    if (i.role === 'basic' || i.role === 'da') basicDa += amt;
    if (i.role === 'hra') hra += amt;
    if (i.taxable) taxable += amt;
    if (i.pfWage) pfWage += amt;
    if (i.esiWage) esiWage += amt;
  }
  return { gross: rupee(gross), basicDa: rupee(basicDa), hra: rupee(hra), taxable: rupee(taxable), deductions: rupee(deductions), pfWage: rupee(pfWage), esiWage: rupee(esiWage) };
}

/**
 * The days a person is paid for in a month. `basis` is the school's divisor; someone who joined or left part-way
 * is paid for their share of it, and confirmed loss-of-pay days come off that.
 */
export function payDays(month: string, basis: DayBasis, joinedOn: string | null, lastDay: string | null, lop: number): Days {
  const calDays = daysIn(month), start = monthStart(month), end = monthEnd(month);
  const from = joinedOn && joinedOn > start ? joinedOn : start, to = lastDay && lastDay < end ? lastDay : end;
  const employed = to < from ? 0 : daysBetween(from, to) + 1;
  const b = basis === 'calendar' ? calDays : basis === 'fixed30' ? 30 : 26;
  const share = (b * employed) / calDays;
  const payable = Math.max(0, share - Math.max(0, lop));
  return { calDays, basis: b, from, to, employed, lop: Math.max(0, lop), payable: Math.round(payable * 100) / 100, factor: b ? payable / b : 0 };
}

/** Each item's full-month amount blended across salary changes inside the employed part of the month. */
function blendedFull(salaries: Salary[], items: PayItem[], d: Days): Map<string, number> {
  const out = new Map<string, number>();
  if (!d.employed) return out;
  const cuts = [d.from, ...salaries.map(s => s.effectiveFrom).filter(x => x > d.from && x <= d.to)].sort();
  cuts.forEach((from, i) => {
    const to = i + 1 < cuts.length ? iso(utc(cuts[i + 1]) - 86_400_000) : d.to;
    const s = salaryOn(salaries, from);
    if (!s) return;
    const share = (daysBetween(from, to) + 1) / d.employed;
    for (const [id, amt] of monthlyFull(s.lines, items)) out.set(id, (out.get(id) ?? 0) + amt * share);
  });
  return out;
}

// ── Tax ─────────────────────────────────────────────────────────────────────
export function slabTax(income: number, slabs: Slab[], exemption = 0): number {
  let tax = 0, lower = 0;
  for (const s of slabs) {
    const upper = s.upto ?? Infinity;
    // A higher basic exemption (senior citizens) takes the bottom of the scale out of tax.
    const lo = Math.max(lower, exemption);
    if (income > lo && upper > lo) tax += (Math.min(income, upper) - lo) * ((s.pct ?? 0) / 100);
    lower = upper;
  }
  return tax;
}
/** A year's income tax on a taxable income: slabs, rebate (with marginal relief where the regime has it), surcharge, cess. */
export function annualTax(taxable: number, t: TaxTable, age?: number | null): { tax: number; rebate: number; surcharge: number; cess: number; total: number } {
  const exemption = age != null && age >= 80 ? t.super_senior_exemption : age != null && age >= 60 ? t.senior_exemption : undefined;
  const tax = slabTax(taxable, t.slabs, exemption);
  let rebate = 0;
  if (taxable <= t.rebate_income) rebate = Math.min(tax, t.rebate_max);
  else if (t.marginal_relief && tax > taxable - t.rebate_income) rebate = tax - (taxable - t.rebate_income);
  const after = tax - rebate;
  const sc = [...(t.surcharge ?? [])].sort((a, b) => b.above - a.above).find(s => taxable > s.above);
  const surcharge = sc ? after * (sc.pct / 100) : 0;
  const cess = (after + surcharge) * (t.cess_pct / 100);
  return { tax: rupee(tax), rebate: rupee(rebate), surcharge: rupee(surcharge), cess: rupee(cess), total: rupee(after + surcharge + cess) };
}
/** HRA exemption for the year (old regime): the least of HRA received, rent less 10% of Basic + DA, and 50% (metro) or 40% of Basic + DA. */
export function hraExemption(hra: number, basicDa: number, rent: number, metro: boolean): number {
  if (!hra || !rent) return 0;
  return rupee(Math.max(0, Math.min(hra, rent - 0.1 * basicDa, (metro ? 0.5 : 0.4) * basicDa)));
}
export function ageOn(dob: string | null | undefined, date: string): number | null {
  if (!dob) return null;
  let a = Number(date.slice(0, 4)) - Number(dob.slice(0, 4));
  if (date.slice(5) < dob.slice(5)) a--;
  return a;
}

/** Completed years of service for gratuity: a final part-year of more than six months counts as a year. */
export function gratuityYears(joinedOn: string, lastDay: string): number {
  let months = (Number(lastDay.slice(0, 4)) - Number(joinedOn.slice(0, 4))) * 12 + Number(lastDay.slice(5, 7)) - Number(joinedOn.slice(5, 7));
  if (Number(lastDay.slice(8, 10)) < Number(joinedOn.slice(8, 10))) months--;
  const years = Math.floor(months / 12);
  return months % 12 > 6 ? years + 1 : years;
}

// ── One person's month ──────────────────────────────────────────────────────
export function computeLine(input: LineInput): LineResult {
  const { month, items, school, person, rates, salaries } = input;
  const byId = new Map(items.map(i => [i.id, i]));
  const flags: Flag[] = [];
  const st = input.settlement ?? null;
  const lastDay = st ? st.lastDay : input.lastDay;
  if (input.lopDays === null) flags.push('attendance_open');
  const days = payDays(month, school.dayBasis, input.joinedOn, lastDay, input.lopDays ?? 0);
  const paySalary = !st || st.includeSalary;
  const current = salaryOn(salaries, days.employed ? days.to : monthEnd(month));
  const blended = paySalary ? blendedFull(salaries, items, days) : new Map<string, number>();
  const overrides = new Map(input.adjustments.filter(a => a.mode === 'override' && a.itemId).map(a => [a.itemId!, a]));

  const earnings: PayLine[] = [], deductions: PayLine[] = [];
  const push = (i: PayItem, amount: number, extra: Partial<PayLine>) => {
    const ov = overrides.get(i.id);
    const amt = rupee(ov ? ov.amount : amount);
    if (!amt && !ov) return;
    const line: PayLine = { code: i.code, name: i.name, itemId: i.id, amount: amt, source: ov ? 'override' : extra.source ?? 'salary', ...extra, ...(ov ? { source: 'override' as const, note: ov.note } : {}) };
    if (i.kind === 'earning') earnings.push({ ...line, taxable: i.taxable, pfWage: i.pfWage ? amt : 0, esiWage: i.esiWage ? amt : 0, ...(i.role ? { role: i.role } : {}) });
    else deductions.push(line);
  };

  // Salary items, in the school's order.
  const ordered = [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  for (const i of ordered) {
    if (i.calc === 'rate_count') continue;
    const full = blended.get(i.id);
    if (full === undefined) { if (overrides.has(i.id) && paySalary) push(i, 0, {}); continue; }
    push(i, i.prorate ? full * days.factor : (days.employed ? full : 0), { full: rupee(full) });
  }
  // Rate x count rules, from the month's records.
  for (const i of ordered) {
    if (i.calc !== 'rate_count' || !current) continue;
    const rate = current.lines.find(l => l.itemId === i.id)?.value;
    if (rate === undefined) { if (overrides.has(i.id)) push(i, 0, { source: 'rule' }); continue; }
    const count = input.counts[i.countSource!] ?? 0, paid = Math.max(0, count - i.threshold);
    push(i, rate * paid, { source: 'rule', count, rate, note: i.threshold ? `${count} recorded, first ${i.threshold} not paid` : undefined });
  }

  // Arrears: approved months where today's salary history says more (or less) was due than was paid.
  for (const p of input.prior) {
    const due = blendedFull(salaries, items, p.days);
    let diff = 0, pf = 0, esi = 0, taxable = 0;
    for (const id of new Set([...due.keys(), ...Object.keys(p.paid)])) {
      const i = byId.get(id);
      if (!i || i.calc === 'rate_count' || i.kind !== 'earning' || p.overridden?.includes(id)) continue;
      const d = rupee(i.prorate ? (due.get(id) ?? 0) * p.days.factor : (p.days.employed ? due.get(id) ?? 0 : 0)) - (p.paid[id] ?? 0);
      diff += d; if (i.pfWage) pf += d; if (i.esiWage) esi += d; if (i.taxable) taxable += d;
    }
    const net = diff - p.arrearsPaid;
    if (Math.abs(net) < 1) continue;
    const scale = diff ? net / diff : 0;
    if (net > 0) earnings.push({ code: 'ARREARS', name: `Arrears for ${monthName(p.month)}`, amount: rupee(net), source: 'arrears', forMonth: p.month, taxable: taxable !== 0, pfWage: rupee(pf * scale), esiWage: rupee(esi * scale) });
    else deductions.push({ code: 'EXCESS', name: `Excess pay for ${monthName(p.month)} recovered`, amount: rupee(-net), source: 'arrears', forMonth: p.month });
  }

  // One-off additions and deductions.
  for (const a of input.adjustments) {
    if (a.mode !== 'add' || !a.amount) continue;
    const line: PayLine = { code: 'ADJ', name: a.label, amount: rupee(a.amount), source: 'adjustment', note: a.note, itemId: a.itemId };
    if (a.kind === 'earning') earnings.push({ ...line, taxable: a.taxable, pfWage: 0, esiWage: 0 });
    else deductions.push(line);
  }

  const nowSummary = current ? salarySummary(current.lines, items) : { gross: 0, basicDa: 0, hra: 0, taxable: 0, deductions: 0, pfWage: 0, esiWage: 0 };

  // Statutory bonus, in the school's bonus month, for last financial year.
  if (!st && school.bonusEnabled && Number(month.slice(5, 7)) === school.bonusMonth && nowSummary.basicDa > 0 && nowSummary.basicDa <= rates.bonus.wage_ceiling) {
    if (input.bonusBase == null) flags.push('bonus_no_history');
    else if (input.bonusBase > 0) earnings.push({ code: 'BONUS', name: 'Statutory bonus', amount: rupee(input.bonusBase * rates.bonus.pct / 100), source: 'bonus', taxable: true, pfWage: 0, esiWage: 0 });
  }

  // Full and final: leave encashment, gratuity, notice shortfall.
  if (st) {
    const perDay = days.basis ? 1 / days.basis : 0;
    if (st.leaveDays > 0) earnings.push({ code: 'LEAVE_ENC', name: 'Leave encashment', amount: rupee(st.leaveDays * nowSummary.basicDa * perDay), source: 'settlement', taxable: true, pfWage: 0, esiWage: 0, count: st.leaveDays, note: `${st.leaveDays} days at Basic + DA` });
    if (st.gratuity !== 'none' && school.gratuityEnabled) {
      const years = input.joinedOn ? gratuityYears(input.joinedOn, st.lastDay) : 0;
      const g = rates.gratuity;
      const auto = years >= g.min_years ? Math.min(g.cap, rupee((nowSummary.basicDa * g.days * years) / g.divisor)) : 0;
      const amount = st.gratuity === 'auto' ? auto : rupee(st.gratuity);
      if (amount > 0) earnings.push({ code: 'GRATUITY', name: 'Gratuity', amount, source: 'settlement', taxable: false, pfWage: 0, esiWage: 0, count: years, note: st.gratuity === 'auto' ? `${years} years of service` : 'Set by hand' });
      else if (st.gratuity === 'auto') flags.push('gratuity_not_due');
    }
    if (st.noticeShortDays > 0) deductions.push({ code: 'NOTICE', name: 'Notice period shortfall', amount: rupee(st.noticeShortDays * nowSummary.gross * perDay), source: 'settlement', count: st.noticeShortDays, note: `${st.noticeShortDays} days of gross pay` });
  }

  const gross = sum(earnings.map(e => e.amount));
  const pfWage = sum(earnings.map(e => e.pfWage ?? 0)), esiWage = sum(earnings.map(e => e.esiWage ?? 0));
  const employer: PayLine[] = [];
  const stat = (code: string, name: string, amount: number, note?: string, base?: number) => { if (amount > 0) deductions.push({ code, name, amount, source: 'statutory', note, ...(base !== undefined ? { base } : {}) }); };

  // Provident fund.
  let pfEmployee = 0;
  if (school.pfEnabled && person.pfMode !== 'exempt' && pfWage > 0) {
    const full = person.pfMode === 'full' || (person.pfMode === 'policy' && school.pfPolicy === 'full');
    const capped = Math.min(pfWage, rates.pf.ceiling), base = full ? pfWage : capped;
    pfEmployee = rupee(base * rates.pf.employee_pct / 100);
    const vpf = rupee(base * person.vpfPct / 100);
    stat('PF', 'Provident fund', pfEmployee, `${rates.pf.employee_pct}% of ${base.toLocaleString('en-IN')}`, base);
    stat('VPF', 'Voluntary provident fund', vpf, `${person.vpfPct}% of ${base.toLocaleString('en-IN')}`);
    const eps = rupee(capped * rates.pf.eps_pct / 100), er = rupee(base * rates.pf.employer_pct / 100);
    employer.push({ code: 'PF_ER', name: 'Employer provident fund', amount: Math.max(0, er - eps), source: 'statutory' });
    employer.push({ code: 'EPS', name: 'Employer pension (EPS)', amount: eps, source: 'statutory' });
    employer.push({ code: 'PF_ADMIN', name: 'PF administration', amount: rupee(base * rates.pf.admin_pct / 100), source: 'statutory' });
    employer.push({ code: 'EDLI', name: 'EDLI', amount: rupee(capped * rates.pf.edli_pct / 100), source: 'statutory' });
    pfEmployee += vpf;
    if (!input.has.uan) flags.push('no_uan');
  }
  // ESI: who is covered is decided on the full month's wage, the contribution on what was earned.
  if (school.esiEnabled && !person.esiExempt && nowSummary.esiWage > 0 && nowSummary.esiWage <= rates.esi.ceiling && esiWage > 0) {
    stat('ESI', 'ESI', Math.ceil(esiWage * rates.esi.employee_pct / 100), `${rates.esi.employee_pct}% of ${esiWage.toLocaleString('en-IN')}`);
    employer.push({ code: 'ESI_ER', name: 'Employer ESI', amount: Math.ceil(esiWage * rates.esi.employer_pct / 100), source: 'statutory' });
    if (!input.has.esiNo) flags.push('no_esi_no');
  }
  // Professional tax, on the month's gross.
  let pt = 0;
  if (!person.ptExempt && gross > 0) {
    if (!school.ptState || !rates.pt) { if (school.ptState === null) flags.push('pt_no_state'); }
    else {
      const slab = rates.pt.slabs.find(s => s.upto === null || gross <= s.upto);
      pt = slab?.amount ?? 0;
      if (pt > 0 && rates.pt.february_amount && month.slice(5, 7) === '02') pt = rates.pt.february_amount;
      stat('PT', 'Professional tax', pt);
    }
  }

  // Income tax: the year's liability on what has been earned and what the salary projects, spread over the months left.
  let tax: TaxWork | null = null;
  if (school.tdsEnabled && !person.tdsExempt) {
    const fy = fyOf(month), left = st ? 1 : monthsLeftInFy(month), later = left - 1;
    const t = person.taxRegime === 'old' ? rates.itOld : rates.itNew, dec = input.declaration ?? {};
    const taxableNow = sum(earnings.filter(e => e.taxable).map(e => e.amount));
    const incomeToDate = input.ytd.taxable + (dec.prev_income ?? 0), projected = later * nowSummary.taxable;
    const grossAnnual = incomeToDate + taxableNow + projected + (dec.other_income ?? 0);
    let professionalTax = 0, hra = 0, via = 0;
    if (person.taxRegime === 'old') {
      professionalTax = input.ytd.pt + pt + later * pt;
      // Rent relief is worked on the year as the salary stands; a mid-year change shifts it from that month on.
      hra = hraExemption(nowSummary.hra * 12, nowSummary.basicDa * 12, dec.rent_annual ?? 0, !!dec.metro);
      const caps = t.caps ?? { c80: 150000, d80: 75000, home_loan_interest: 200000, nps_80ccd1b: 50000 };
      const pfYear = input.ytd.pfEmployee + pfEmployee + later * pfEmployee;
      via = Math.min(caps.c80, (dec.c80 ?? 0) + pfYear) + Math.min(caps.d80, dec.d80 ?? 0) + Math.min(caps.home_loan_interest, dec.home_loan_interest ?? 0) + Math.min(caps.nps_80ccd1b, dec.nps_80ccd1b ?? 0);
    }
    const taxableIncome = Math.max(0, rupee(grossAnnual - Math.min(t.standard_deduction, grossAnnual) - professionalTax - hra - via));
    const a = annualTax(taxableIncome, t, ageOn(input.dateOfBirth, fyEnd(fy)));
    const deducted = input.ytd.tds + (dec.prev_tds ?? 0);
    const thisMonth = Math.max(0, rupee((a.total - deducted) / left));
    tax = {
      regime: person.taxRegime, fy, monthsLeft: left, incomeToDate: rupee(incomeToDate), incomeThisMonth: taxableNow, incomeProjected: rupee(projected), otherIncome: dec.other_income ?? 0,
      grossAnnual: rupee(grossAnnual), standardDeduction: Math.min(t.standard_deduction, rupee(grossAnnual)), professionalTax, hraExemption: hra, chapterVIA: rupee(via), taxableIncome,
      taxOnIncome: a.tax, rebate: a.rebate, surcharge: a.surcharge, cess: a.cess, annualTax: a.total, deductedToDate: deducted, thisMonth,
    };
    stat('TDS', 'Income tax (TDS)', thisMonth);
    if (thisMonth > 0 && !input.has.pan) flags.push('no_pan');
  }

  // Advances and loans: the instalment, or all of it in a settlement.
  const recoveries: { loanId: string; amount: number }[] = [];
  for (const l of input.loans) {
    if (l.outstanding <= 0 || (!st && l.startMonth > month)) continue;
    const amount = rupee(st ? l.outstanding : Math.min(l.instalment, l.outstanding));
    deductions.push({ code: l.kind === 'advance' ? 'ADVANCE' : 'LOAN', name: l.kind === 'advance' ? 'Salary advance recovery' : 'Loan instalment', amount, source: 'loan', loanId: l.id, note: `${rupee(l.outstanding - amount).toLocaleString('en-IN')} left after this` });
    recoveries.push({ loanId: l.id, amount });
  }

  const totalDeductions = sum(deductions.map(d => d.amount)), net = gross - totalDeductions;
  if (net < 0) flags.push('negative_net');
  if (!gross && !totalDeductions) flags.push('zero_pay');
  if (person.onHold) flags.push('on_hold');
  if (person.payMode === 'bank' && !input.has.bank && net > 0) flags.push('no_bank');
  return { days, earnings, deductions, employer: employer.filter(e => e.amount > 0), tax, gross, totalDeductions, net, flags, recoveries };
}

/** What a stored line paid per salary item, for working out arrears later. */
export function paidByItem(earnings: PayLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of earnings) if (e.itemId && (e.source === 'salary' || e.source === 'override')) out[e.itemId] = (out[e.itemId] ?? 0) + e.amount;
  return out;
}
export const overriddenItems = (earnings: PayLine[]) => earnings.filter(e => e.itemId && e.source === 'override').map(e => e.itemId!);
/** Basic + DA a stored line paid, for statutory bonus. */
export const basicDaPaid = (earnings: PayLine[]) => sum(earnings.filter(e => e.role === 'basic' || e.role === 'da').map(e => e.amount));

export interface RunTotals { people: number; gross: number; deductions: number; net: number; employer: number; onHold: number; byCode: Record<string, number> }
export function runTotals(lines: { gross: number; totalDeductions: number; net: number; onHold: boolean; deductions: PayLine[]; employer: PayLine[] }[]): RunTotals {
  const byCode: Record<string, number> = {};
  for (const l of lines) for (const d of [...l.deductions, ...l.employer]) if (d.source === 'statutory' || d.source === 'loan') byCode[d.code] = (byCode[d.code] ?? 0) + d.amount;
  return {
    people: lines.length, gross: sum(lines.map(l => l.gross)), deductions: sum(lines.map(l => l.totalDeductions)), net: sum(lines.map(l => l.net)),
    employer: sum(lines.flatMap(l => l.employer.map(e => e.amount))), onHold: lines.filter(l => l.onHold).length, byCode,
  };
}
