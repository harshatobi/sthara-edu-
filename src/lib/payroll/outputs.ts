/**
 * What comes out of an approved pay run: the register, the bank sheet, PF and ESI returns, the professional tax
 * and TDS statements, the salary journal and the year's tax statement. Pure: rows in, rows (or text) out.
 */
import { monthName, type Days, type PayLine, type TaxWork } from './engine';

export interface RunLine {
  id: string; staffMemberId: string; month: string;
  person: { name: string; code: string | null; designation: string; department: string; grade: string; category: string };
  days: Days; earnings: PayLine[]; deductions: PayLine[]; employer: PayLine[]; tax: TaxWork | null;
  gross: number; totalDeductions: number; net: number; onHold: boolean; payMode: string; flags: string[];
}
type Row = (string | number)[];
const of = (xs: PayLine[], ...codes: string[]) => xs.filter(x => codes.includes(x.code)).reduce((n, x) => n + x.amount, 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Every earning and deduction as its own column, one row a person, totals at the foot. */
export function registerRows(lines: RunLine[]): Row[] {
  const cols = (pick: (l: RunLine) => PayLine[]) => {
    const seen = new Map<string, string>();
    for (const l of lines) for (const x of pick(l)) if (!seen.has(x.code + x.name)) seen.set(x.code + x.name, x.name);
    return [...seen];
  };
  const e = cols(l => l.earnings), d = cols(l => l.deductions);
  const val = (xs: PayLine[], key: string) => sum(xs.filter(x => x.code + x.name === key).map(x => x.amount));
  const rows: Row[] = lines.map(l => [l.person.code ?? '', l.person.name, l.person.designation, l.person.department, l.days.payable, l.days.lop,
    ...e.map(([k]) => val(l.earnings, k)), l.gross, ...d.map(([k]) => val(l.deductions, k)), l.totalDeductions, l.net, l.onHold ? 'On hold' : l.payMode]);
  const head: Row = ['Employee code', 'Name', 'Designation', 'Department', 'Paid days', 'Loss of pay days', ...e.map(x => x[1]), 'Gross', ...d.map(x => x[1]), 'Total deductions', 'Net pay', 'Payment'];
  const foot: Row = ['', 'Total', '', '', '', '', ...e.map(([k]) => sum(lines.map(l => val(l.earnings, k)))), sum(lines.map(l => l.gross)),
    ...d.map(([k]) => sum(lines.map(l => val(l.deductions, k)))), sum(lines.map(l => l.totalDeductions)), sum(lines.map(l => l.net)), ''];
  return [head, ...rows, foot];
}

export interface Secrets { bankAccount: string | null; bankIfsc: string | null; bankHolder: string | null; bankName: string | null; pan: string | null; uan: string | null; esiNo: string | null }
/** The bank's bulk transfer sheet: everyone paid by bank and not on hold, with a positive net. */
export function bankRows(lines: RunLine[], secrets: Map<string, Secrets>, narration: string): { rows: Row[]; skipped: string[] } {
  const skipped: string[] = [];
  const rows: Row[] = [['Beneficiary name', 'Account number', 'IFSC', 'Amount', 'Narration', 'Employee code']];
  for (const l of lines) {
    const s = secrets.get(l.staffMemberId);
    if (l.net <= 0 || l.payMode !== 'bank') continue;
    if (l.onHold) { skipped.push(`${l.person.name}: on hold`); continue; }
    if (!s?.bankAccount || !s.bankIfsc) { skipped.push(`${l.person.name}: no bank account on record`); continue; }
    rows.push([s.bankHolder || l.person.name, s.bankAccount, s.bankIfsc, l.net, narration, l.person.code ?? '']);
  }
  return { rows, skipped };
}

/**
 * The EPFO ECR text file: one member a line, fields joined by "#~#". UAN, name, gross wages, EPF wages, EPS wages,
 * EDLI wages, EPF contribution (employee), EPS contribution, EPF-EPS difference (employer), NCP days, refund of advances.
 */
export function ecrText(lines: RunLine[], secrets: Map<string, Secrets>, pfCeiling: number): { text: string; skipped: string[] } {
  const out: string[] = [], skipped: string[] = [];
  for (const l of lines) {
    const ee = of(l.deductions, 'PF', 'VPF');
    if (!ee) continue;
    const uan = secrets.get(l.staffMemberId)?.uan;
    if (!uan) { skipped.push(`${l.person.name}: no UAN on record`); continue; }
    const wages = sum(l.earnings.map(e => e.pfWage ?? 0)), eps = of(l.employer, 'EPS'), capped = Math.min(wages, pfCeiling);
    const epfWages = l.deductions.find(d => d.code === 'PF')?.base ?? capped;
    out.push([uan, l.person.name.toUpperCase().replace(/[^A-Z .]/g, ' ').replace(/\s+/g, ' ').trim(), l.gross, epfWages, eps ? capped : 0, capped, ee, eps, of(l.employer, 'PF_ER'), Math.round(l.days.lop), 0].join('#~#'));
  }
  return { text: out.join('\n'), skipped };
}

export function esiRows(lines: RunLine[], secrets: Map<string, Secrets>): { rows: Row[]; skipped: string[] } {
  const skipped: string[] = [];
  const rows: Row[] = [['IP number', 'IP name', 'Days for which wages paid', 'Total monthly wages', 'Employee contribution', 'Employer contribution', 'Reason code', 'Last working day']];
  for (const l of lines) {
    const ee = of(l.deductions, 'ESI');
    if (!ee) continue;
    const no = secrets.get(l.staffMemberId)?.esiNo;
    if (!no) { skipped.push(`${l.person.name}: no ESI number on record`); continue; }
    rows.push([no, l.person.name, Math.ceil(l.days.payable), sum(l.earnings.map(e => e.esiWage ?? 0)), ee, of(l.employer, 'ESI_ER'), 0, '']);
  }
  return { rows, skipped };
}

export function ptRows(lines: RunLine[]): Row[] {
  const paid = lines.filter(l => of(l.deductions, 'PT') > 0);
  return [['Employee code', 'Name', 'Gross salary', 'Professional tax'], ...paid.map(l => [l.person.code ?? '', l.person.name, l.gross, of(l.deductions, 'PT')]), ['', 'Total', sum(paid.map(l => l.gross)), sum(paid.map(l => of(l.deductions, 'PT')))]];
}

export function tdsRows(lines: RunLine[], secrets: Map<string, Secrets>): Row[] {
  const paid = lines.filter(l => of(l.deductions, 'TDS') > 0);
  return [['Employee code', 'Name', 'PAN', 'Regime', 'Taxable salary this month', 'Projected taxable income for the year', 'Tax for the year', 'Deducted before this month', 'TDS this month'],
    ...paid.map(l => [l.person.code ?? '', l.person.name, secrets.get(l.staffMemberId)?.pan ?? 'PAN NOT ON RECORD', l.tax?.regime ?? '', l.tax?.incomeThisMonth ?? 0, l.tax?.taxableIncome ?? 0, l.tax?.annualTax ?? 0, l.tax?.deductedToDate ?? 0, of(l.deductions, 'TDS')]),
    ['', 'Total', '', '', '', '', '', '', sum(paid.map(l => of(l.deductions, 'TDS')))]];
}

/**
 * The salary journal: expense by department (earnings and the employer's contributions) against what is owed
 * to staff and to each authority. Debits equal credits.
 */
export function journalRows(lines: RunLine[], month: string): Row[] {
  const dr = new Map<string, number>(), cr = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => { if (v) m.set(k, (m.get(k) ?? 0) + v); };
  for (const l of lines) {
    const dept = l.person.department || 'No department';
    add(dr, `Salaries and wages: ${dept}`, l.gross);
    const er = sum(l.employer.map(e => e.amount));
    add(dr, `Employer PF, ESI and charges: ${dept}`, er);
    add(cr, 'PF payable', of(l.deductions, 'PF', 'VPF') + of(l.employer, 'PF_ER', 'EPS', 'PF_ADMIN', 'EDLI'));
    add(cr, 'ESI payable', of(l.deductions, 'ESI') + of(l.employer, 'ESI_ER'));
    add(cr, 'Professional tax payable', of(l.deductions, 'PT'));
    add(cr, 'TDS on salary payable', of(l.deductions, 'TDS'));
    add(cr, 'Staff advances and loans', of(l.deductions, 'ADVANCE', 'LOAN'));
    const other = l.totalDeductions - of(l.deductions, 'PF', 'VPF', 'ESI', 'PT', 'TDS', 'ADVANCE', 'LOAN');
    add(cr, 'Other recoveries from staff', other);
    add(cr, l.onHold ? 'Salaries payable (on hold)' : 'Salaries payable', l.net);
  }
  const narration = `Salaries for ${monthName(month)}`;
  const rows: Row[] = [['Account', 'Debit', 'Credit', 'Narration']];
  for (const [k, v] of [...dr].sort()) rows.push([k, v, '', narration]);
  for (const [k, v] of [...cr].sort()) rows.push([k, '', v, narration]);
  rows.push(['Total', sum([...dr.values()]), sum([...cr.values()]), '']);
  return rows;
}

/**
 * The year's salary and tax for each person, from approved lines: the figures Form 16 Part B and the quarterly
 * 24Q statement are prepared from. The computation columns are the last approved month's working.
 */
export function taxYearRows(lines: RunLine[], secrets: Map<string, Secrets>): Row[] {
  const by = new Map<string, RunLine[]>();
  for (const l of lines) by.set(l.staffMemberId, [...(by.get(l.staffMemberId) ?? []), l]);
  const q = (m: string) => Math.floor(((Number(m.slice(5, 7)) + 8) % 12) / 3);     // Apr-Jun 0 ... Jan-Mar 3
  const rows: Row[] = [['Employee code', 'Name', 'PAN', 'Regime', 'Months paid', 'Gross salary paid', 'Taxable salary paid', 'Standard deduction', 'Professional tax', 'HRA exemption',
    'Chapter VI-A deductions', 'Taxable income (projected)', 'Tax on income', 'Rebate', 'Surcharge', 'Cess', 'Tax for the year', 'TDS Q1 (Apr-Jun)', 'TDS Q2 (Jul-Sep)', 'TDS Q3 (Oct-Dec)', 'TDS Q4 (Jan-Mar)', 'TDS deducted']];
  for (const ls of by.values()) {
    ls.sort((a, b) => a.month.localeCompare(b.month));
    const last = ls[ls.length - 1], t = [...ls].reverse().find(l => l.tax)?.tax ?? null;
    const tq = [0, 0, 0, 0];
    for (const l of ls) tq[q(l.month)] += of(l.deductions, 'TDS');
    rows.push([last.person.code ?? '', last.person.name, secrets.get(last.staffMemberId)?.pan ?? 'PAN NOT ON RECORD', t?.regime ?? '', ls.length, sum(ls.map(l => l.gross)),
      sum(ls.map(l => sum(l.earnings.filter(e => e.taxable).map(e => e.amount)))), t?.standardDeduction ?? 0, t?.professionalTax ?? 0, t?.hraExemption ?? 0, t?.chapterVIA ?? 0,
      t?.taxableIncome ?? 0, t?.taxOnIncome ?? 0, t?.rebate ?? 0, t?.surcharge ?? 0, t?.cess ?? 0, t?.annualTax ?? 0, ...tq, sum(tq)]);
  }
  return rows;
}
