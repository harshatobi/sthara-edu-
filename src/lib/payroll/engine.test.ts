import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualTax, computeLine, fyOf, gratuityYears, hraExemption, monthlyFull, monthsLeftInFy, paidByItem, payDays, rateOn, ratesOn, runTotals, salarySummary,
  DEFAULT_PERSON_PAY, DEFAULT_SCHOOL_PAY, type LineInput, type PayItem, type Rates, type RateRow, type Salary,
} from './engine';

const item = (o: Partial<PayItem> & { id: string }): PayItem => ({
  code: o.id.toUpperCase(), name: o.id, kind: 'earning', calc: 'fixed', percentOf: null, countSource: null, threshold: 0, defaultValue: 0, role: null,
  taxable: true, pfWage: false, esiWage: true, prorate: true, sort: 0, active: true, ...o,
});
const ITEMS: PayItem[] = [
  item({ id: 'basic', role: 'basic', pfWage: true, sort: 1 }), item({ id: 'da', role: 'da', pfWage: true, calc: 'percent', percentOf: 'basic', sort: 2 }),
  item({ id: 'hra', role: 'hra', calc: 'percent', percentOf: 'basic_da', sort: 3 }), item({ id: 'special', sort: 4 }),
  item({ id: 'session', calc: 'rate_count', countSource: 'sessions', prorate: false, sort: 5 }),
  item({ id: 'duty', calc: 'rate_count', countSource: 'duties', threshold: 4, prorate: false, sort: 6 }),
  item({ id: 'bus', kind: 'deduction', prorate: false, sort: 7 }),
];
const RATES: Rates = {
  pf: { employee_pct: 12, employer_pct: 12, eps_pct: 8.33, ceiling: 15000, admin_pct: 0.5, edli_pct: 0.5 },
  esi: { employee_pct: 0.75, employer_pct: 3.25, ceiling: 21000 },
  pt: { slabs: [{ upto: 15000, amount: 0 }, { upto: 20000, amount: 150 }, { upto: null, amount: 200 }] },
  itNew: { standard_deduction: 75000, slabs: [{ upto: 400000, pct: 0 }, { upto: 800000, pct: 5 }, { upto: 1200000, pct: 10 }, { upto: 1600000, pct: 15 }, { upto: 2000000, pct: 20 }, { upto: 2400000, pct: 25 }, { upto: null, pct: 30 }], rebate_income: 1200000, rebate_max: 60000, marginal_relief: true, cess_pct: 4 },
  itOld: { standard_deduction: 50000, slabs: [{ upto: 250000, pct: 0 }, { upto: 500000, pct: 5 }, { upto: 1000000, pct: 20 }, { upto: null, pct: 30 }], senior_exemption: 300000, super_senior_exemption: 500000, rebate_income: 500000, rebate_max: 12500, cess_pct: 4, caps: { c80: 150000, d80: 75000, home_loan_interest: 200000, nps_80ccd1b: 50000 } },
  bonus: { pct: 8.33, wage_ceiling: 21000, calc_ceiling: 7000 }, gratuity: { min_years: 5, days: 15, divisor: 26, cap: 2000000 },
};
const sal = (lines: [string, number][], from = '2024-06-01'): Salary => ({ id: from, staffMemberId: 'p', effectiveFrom: from, lines: lines.map(([itemId, value]) => ({ itemId, value })) });
// Basic 20,000; DA 10% = 2,000; HRA 20% of 22,000 = 4,400; special 3,600: gross 30,000.
const STD = sal([['basic', 20000], ['da', 10], ['hra', 20], ['special', 3600]]);
const base = (o: Partial<LineInput> = {}): LineInput => ({
  month: '2026-10-01', joinedOn: '2024-06-01', lastDay: null, salaries: [STD], items: ITEMS, school: { ...DEFAULT_SCHOOL_PAY, tdsEnabled: false }, person: DEFAULT_PERSON_PAY,
  rates: RATES, lopDays: 0, counts: {}, adjustments: [], loans: [], ytd: { taxable: 0, pfEmployee: 0, pt: 0, tds: 0 }, declaration: null, prior: [],
  has: { bank: true, pan: true, uan: true, esiNo: true }, ...o,
});
const amt = (xs: { code: string; amount: number }[], code: string) => xs.find(x => x.code === code)?.amount ?? 0;

test('financial year and months left', () => {
  assert.equal(fyOf('2026-10-01'), '2026-27');
  assert.equal(fyOf('2027-03-01'), '2026-27');
  assert.equal(fyOf('2027-04-01'), '2027-28');
  assert.deepEqual(['2026-04-01', '2026-10-01', '2027-03-01'].map(monthsLeftInFy), [12, 6, 1]);
});

test('a salary: fixed, percentage of Basic, of Basic + DA, of gross', () => {
  const full = monthlyFull(STD.lines, ITEMS);
  assert.deepEqual([full.get('basic'), full.get('da'), full.get('hra'), full.get('special')], [20000, 2000, 4400, 3600]);
  assert.deepEqual(salarySummary(STD.lines, ITEMS), { gross: 30000, basicDa: 22000, hra: 4400, taxable: 30000, deductions: 0, pfWage: 22000, esiWage: 30000 });
  const g = monthlyFull([{ itemId: 'basic', value: 10000 }, { itemId: 'x', value: 10 }], [...ITEMS, item({ id: 'x', calc: 'percent', percentOf: 'gross' })]);
  assert.equal(g.get('x'), 1000);
});

test('pay days on each basis', () => {
  assert.deepEqual(payDays('2026-10-01', 'calendar', '2024-01-01', null, 2), { calDays: 31, basis: 31, from: '2026-10-01', to: '2026-10-31', employed: 31, lop: 2, payable: 29, factor: 29 / 31 });
  assert.equal(payDays('2026-10-01', 'fixed30', null, null, 3).payable, 27);
  assert.equal(payDays('2026-02-01', 'fixed30', null, null, 0).payable, 30);
  assert.equal(payDays('2026-10-01', 'working26', null, null, 1).payable, 25);
  // Joined on the 17th of a 31-day month: 15 of 31 days.
  const j = payDays('2026-10-01', 'fixed30', '2026-10-17', null, 0);
  assert.deepEqual([j.employed, j.payable], [15, 14.52]);
  assert.equal(payDays('2026-10-01', 'calendar', '2026-11-05', null, 0).payable, 0);
  assert.equal(payDays('2026-10-01', 'calendar', null, '2026-10-10', 20).payable, 0);
});

test('a plain month: gross, nothing deducted when nothing is switched on', () => {
  const r = computeLine(base());
  assert.deepEqual(r.earnings.map(e => [e.code, e.amount]), [['BASIC', 20000], ['DA', 2000], ['HRA', 4400], ['SPECIAL', 3600]]);
  assert.deepEqual([r.gross, r.totalDeductions, r.net, r.flags], [30000, 0, 30000, ['pt_no_state']]);
});

test('PF, ESI and professional tax', () => {
  const school = { ...DEFAULT_SCHOOL_PAY, tdsEnabled: false, pfEnabled: true, esiEnabled: true, ptState: 'AP' };
  const r = computeLine(base({ school }));
  // PF wage 22,000 capped at 15,000: 1,800. Gross 30,000 is over the ESI ceiling. PT 200.
  assert.deepEqual(r.deductions.map(d => [d.code, d.amount]), [['PF', 1800], ['PT', 200]]);
  assert.deepEqual(r.employer.map(e => [e.code, e.amount]), [['PF_ER', 550], ['EPS', 1250], ['PF_ADMIN', 75], ['EDLI', 75]]);
  assert.equal(r.net, 28000);
  // On full wages, with 5% voluntary PF.
  const full = computeLine(base({ school: { ...school, pfPolicy: 'full' }, person: { ...DEFAULT_PERSON_PAY, vpfPct: 5 } }));
  assert.deepEqual([amt(full.deductions, 'PF'), amt(full.deductions, 'VPF'), amt(full.employer, 'PF_ER'), amt(full.employer, 'EPS')], [2640, 1100, 1390, 1250]);
  assert.equal(computeLine(base({ school, person: { ...DEFAULT_PERSON_PAY, pfMode: 'exempt', ptExempt: true } })).deductions.length, 0);
  // A lower-paid person is in ESI: 0.75% and 3.25% of 12,000, rounded up; PT nil under 15,000.
  const low = computeLine(base({ school, salaries: [sal([['basic', 8000], ['special', 4000]])] }));
  assert.deepEqual(low.deductions.map(d => [d.code, d.amount]), [['PF', 960], ['ESI', 90]]);
  assert.equal(amt(low.employer, 'ESI_ER'), 390);
  assert.ok(computeLine(base({ school, has: { bank: true, pan: true, uan: false, esiNo: true } })).flags.includes('no_uan'));
});

test('loss of pay reduces prorated items only; unconfirmed attendance is flagged', () => {
  const salaries = [sal([['basic', 20000], ['da', 10], ['hra', 20], ['special', 3600], ['bus', 500]])];
  const r = computeLine(base({ salaries, lopDays: 3 }));           // 28 of 31 days
  assert.deepEqual(r.earnings.map(e => e.amount), [18065, 1806, 3974, 3252]);
  assert.deepEqual([amt(r.deductions, 'BUS'), r.days.payable], [500, 28]);
  const open = computeLine(base({ lopDays: null }));
  assert.ok(open.flags.includes('attendance_open'));
  assert.equal(open.gross, 30000);
});

test('joining mid-month and a salary change mid-month', () => {
  const joined = computeLine(base({ joinedOn: '2026-10-17' }));     // 15 of 31 days
  assert.equal(joined.gross, Math.round(20000 * 15 / 31) + Math.round(2000 * 15 / 31) + Math.round(4400 * 15 / 31) + Math.round(3600 * 15 / 31));
  // Basic goes from 20,000 to 26,200 on the 16th: 15 days at the old, 16 at the new.
  const raised = computeLine(base({ salaries: [STD, sal([['basic', 26200], ['da', 10], ['hra', 20], ['special', 3600]], '2026-10-16')] }));
  assert.equal(amt(raised.earnings, 'BASIC'), Math.round(20000 * 15 / 31 + 26200 * 16 / 31));
  assert.equal(raised.earnings.find(e => e.code === 'BASIC')!.full, 23200);
});

test('rate x count rules: sessions, a duty threshold, and an override with its note', () => {
  const salaries = [sal([['session', 600], ['duty', 150]])];
  const r = computeLine(base({ salaries, counts: { sessions: 9, duties: 7 } }));
  assert.deepEqual(r.earnings.map(e => [e.code, e.amount, e.count, e.rate]), [['SESSION', 5400, 9, 600], ['DUTY', 450, 7, 150]]);
  assert.match(r.earnings[1].note!, /first 4 not paid/);
  assert.equal(computeLine(base({ salaries, counts: { duties: 3 } })).gross, 0);
  const ov = computeLine(base({ salaries, counts: { sessions: 9 }, adjustments: [{ mode: 'override', itemId: 'session', kind: 'earning', label: 'Session fee', amount: 6000, taxable: true, note: 'One double session' }] }));
  assert.deepEqual([ov.earnings[0].amount, ov.earnings[0].source, ov.earnings[0].note], [6000, 'override', 'One double session']);
  // Nobody is paid for covers unless the school writes a rule for them.
  assert.equal(computeLine(base({ counts: { covers: 12 } })).gross, 30000);
});

test('one-off additions and deductions', () => {
  const r = computeLine(base({ adjustments: [
    { mode: 'add', itemId: null, kind: 'earning', label: 'Annual day allowance', amount: 1000, taxable: true, note: 'Event' },
    { mode: 'add', itemId: null, kind: 'deduction', label: 'Uniform', amount: 400, taxable: false, note: 'Two sets' },
  ] }));
  assert.deepEqual([r.gross, r.totalDeductions, r.net], [31000, 400, 30600]);
});

test('arrears for approved months when the salary is revised back-dated', () => {
  const sept = { month: '2026-09-01', days: payDays('2026-09-01', 'calendar', null, null, 0), paid: { basic: 20000, da: 2000, hra: 4400, special: 3600 }, arrearsPaid: 0 };
  const raised = sal([['basic', 22000], ['da', 10], ['hra', 20], ['special', 3600]], '2026-09-01');
  const r = computeLine(base({ salaries: [STD, raised], prior: [sept], school: { ...DEFAULT_SCHOOL_PAY, tdsEnabled: false, pfEnabled: true, pfPolicy: 'full' } }));
  const a = r.earnings.find(e => e.code === 'ARREARS')!;
  // Basic +2,000, DA +200, HRA +440.
  assert.deepEqual([a.amount, a.forMonth, a.pfWage, a.name], [2640, '2026-09-01', 2200, 'Arrears for September 2026']);
  assert.equal(amt(r.deductions, 'PF'), Math.round((24200 + 2200) * 0.12));
  // Already paid: nothing more.
  assert.ok(!computeLine(base({ salaries: [STD, raised], prior: [{ ...sept, arrearsPaid: 2640 }] })).earnings.some(e => e.code === 'ARREARS'));
  // Unchanged salary: no arrears.
  assert.ok(!computeLine(base({ prior: [sept] })).earnings.some(e => e.code === 'ARREARS'));
  // A back-dated cut recovers the excess.
  const cut = computeLine(base({ salaries: [STD, sal([['basic', 19000], ['da', 10], ['hra', 20], ['special', 3600]], '2026-09-01')], prior: [sept] }));
  assert.equal(amt(cut.deductions, 'EXCESS'), 1320);
  assert.deepEqual(paidByItem(r.earnings), { basic: 22000, da: 2200, hra: 4840, special: 3600 });
});

test('income tax for the year', () => {
  const t = (n: number, regime: 'new' | 'old' = 'new', age?: number) => annualTax(n, regime === 'new' ? RATES.itNew : RATES.itOld, age).total;
  assert.equal(t(1200000), 0);                      // rebate wipes out 60,000
  assert.equal(t(1210000), 10400);                  // marginal relief: tax limited to the 10,000 over the line, plus cess
  assert.equal(t(1600000), 124800);
  assert.equal(t(2500000), Math.round((20000 + 40000 + 60000 + 80000 + 100000 + 30000) * 1.04));
  assert.equal(t(500000, 'old'), 0);
  assert.equal(t(700000, 'old'), 54600);
  assert.equal(t(700000, 'old', 62), Math.round((10000 + 40000) * 1.04));     // 3,00,000 exemption
  assert.equal(t(700000, 'old', 81), Math.round(40000 * 1.04));
  assert.equal(hraExemption(120000, 480000, 180000, false), 120000);
  assert.equal(hraExemption(240000, 480000, 180000, false), 132000);          // rent less 10% of Basic + DA
  assert.equal(hraExemption(240000, 480000, 0, true), 0);
});

test('monthly TDS: the year projected, spread over the months left', () => {
  const school = { ...DEFAULT_SCHOOL_PAY, ptState: 'AP' };
  // 1,50,000 a month, all taxable, from April.
  const salaries = [sal([['basic', 100000], ['special', 50000]])];
  const april = computeLine(base({ month: '2026-04-01', salaries, school }));
  // 18,00,000 less 75,000 = 17,25,000: 60,000 + 60,000 + 25,000 = 1,45,000, with cess 1,50,800; over 12 months.
  assert.deepEqual([april.tax!.taxableIncome, april.tax!.annualTax, april.tax!.thisMonth, amt(april.deductions, 'TDS')], [1725000, 150800, 12567, 12567]);
  // October, with six months already deducted: the remaining tax over six months.
  const oct = computeLine(base({ salaries, school, ytd: { taxable: 900000, pfEmployee: 0, pt: 1200, tds: 75402 } }));
  assert.deepEqual([oct.tax!.monthsLeft, oct.tax!.grossAnnual, oct.tax!.thisMonth], [6, 1800000, Math.round((150800 - 75402) / 6)]);
  // A bonus in October raises the year and the rest of the months share it.
  const bonus = computeLine(base({ salaries, school, ytd: { taxable: 900000, pfEmployee: 0, pt: 1200, tds: 75402 }, adjustments: [{ mode: 'add', itemId: null, kind: 'earning', label: 'Bonus', amount: 100000, taxable: true, note: 'x' }] }));
  assert.equal(bonus.tax!.annualTax, Math.round((60000 + 60000 + 45000) * 1.04));
  // Under 12,75,000 a year on the new regime: nothing.
  assert.equal(computeLine(base({ month: '2026-04-01', school })).tax!.thisMonth, 0);
  // Old regime with declarations: 80C (with own PF), rent, professional tax.
  const old = computeLine(base({ month: '2026-04-01', salaries: [sal([['basic', 60000], ['hra', 40], ['special', 16000]])], school: { ...school, pfEnabled: true },
    person: { ...DEFAULT_PERSON_PAY, taxRegime: 'old' }, declaration: { c80: 100000, d80: 20000, rent_annual: 240000, metro: false } }));
  // Gross 12,00,000. Std 50,000. PT 2,400. HRA: min(2,88,000, 2,40,000 - 72,000, 2,88,000) = 1,68,000. 80C: 1,00,000 + PF 21,600 = 1,21,600; 80D 20,000.
  assert.deepEqual([old.tax!.grossAnnual, old.tax!.hraExemption, old.tax!.chapterVIA, old.tax!.professionalTax, old.tax!.taxableIncome], [1200000, 168000, 141600, 2400, 838000]);
  assert.equal(old.tax!.annualTax, Math.round((12500 + 338000 * 0.2) * 1.04));
  assert.ok(computeLine(base({ month: '2026-04-01', salaries, school, has: { bank: true, pan: false, uan: true, esiNo: true } })).flags.includes('no_pan'));
  assert.equal(computeLine(base({ salaries, school, person: { ...DEFAULT_PERSON_PAY, tdsExempt: true } })).tax, null);
});

test('advances and loans: the instalment, never more than is owed, not before the start month', () => {
  const loans = [{ id: 'a', kind: 'advance' as const, instalment: 5000, outstanding: 3000, startMonth: '2026-10-01' }, { id: 'b', kind: 'loan' as const, instalment: 2000, outstanding: 40000, startMonth: '2026-11-01' }];
  const r = computeLine(base({ loans }));
  assert.deepEqual(r.recoveries, [{ loanId: 'a', amount: 3000 }]);
  assert.equal(r.net, 27000);
  assert.deepEqual(computeLine(base({ month: '2026-11-01', loans })).recoveries, [{ loanId: 'a', amount: 3000 }, { loanId: 'b', amount: 2000 }]);
});

test('flags: hold, no bank account, deductions over earnings', () => {
  assert.ok(computeLine(base({ person: { ...DEFAULT_PERSON_PAY, onHold: true } })).flags.includes('on_hold'));
  assert.ok(computeLine(base({ has: { bank: false, pan: true, uan: true, esiNo: true } })).flags.includes('no_bank'));
  assert.ok(!computeLine(base({ person: { ...DEFAULT_PERSON_PAY, payMode: 'cash' }, has: { bank: false, pan: true, uan: true, esiNo: true } })).flags.includes('no_bank'));
  const neg = computeLine(base({ lopDays: 31, loans: [{ id: 'a', kind: 'advance', instalment: 5000, outstanding: 5000, startMonth: '2026-10-01' }] }));
  assert.ok(neg.net < 0 && neg.flags.includes('negative_net'));
});

test('statutory bonus in the bonus month, for those within the wage ceiling', () => {
  const school = { ...DEFAULT_SCHOOL_PAY, tdsEnabled: false, bonusEnabled: true, bonusMonth: 10 };
  const low = [sal([['basic', 12000], ['special', 3000]])];
  assert.equal(amt(computeLine(base({ school, salaries: low, bonusBase: 84000 })).earnings, 'BONUS'), 6997);     // 8.33% of 12 x 7,000
  assert.ok(computeLine(base({ school, salaries: low, bonusBase: null })).flags.includes('bonus_no_history'));
  assert.equal(amt(computeLine(base({ school, salaries: low, bonusBase: 84000, month: '2026-11-01' })).earnings, 'BONUS'), 0);
  assert.equal(amt(computeLine(base({ school, bonusBase: 84000 })).earnings, 'BONUS'), 0);                           // Basic + DA 22,000 is over the ceiling
});

test('full and final settlement', () => {
  assert.equal(gratuityYears('2019-06-01', '2026-10-20'), 7);
  assert.equal(gratuityYears('2019-03-01', '2026-10-20'), 8);        // 7 years 7 months
  assert.equal(gratuityYears('2022-06-01', '2026-10-20'), 4);
  const st = { lastDay: '2026-10-20', leaveDays: 6, noticeShortDays: 10, gratuity: 'auto' as const, includeSalary: true };
  const loans = [{ id: 'a', kind: 'loan' as const, instalment: 2000, outstanding: 9000, startMonth: '2026-12-01' }];
  const r = computeLine(base({ joinedOn: '2019-06-01', settlement: st, loans, school: { ...DEFAULT_SCHOOL_PAY, dayBasis: 'fixed30' } }));
  assert.equal(r.days.employed, 20);
  assert.equal(amt(r.earnings, 'LEAVE_ENC'), 4400);                            // 6 x 22,000 / 30
  assert.equal(amt(r.earnings, 'GRATUITY'), Math.round(22000 * 15 * 7 / 26));
  assert.equal(r.earnings.find(e => e.code === 'GRATUITY')!.taxable, false);
  assert.equal(amt(r.deductions, 'NOTICE'), 10000);                            // 10 x 30,000 / 30
  assert.deepEqual(r.recoveries, [{ loanId: 'a', amount: 9000 }]);             // all of it, whatever the start month
  assert.equal(r.tax!.monthsLeft, 1);
  const young = computeLine(base({ joinedOn: '2023-06-01', settlement: st }));
  assert.ok(young.flags.includes('gratuity_not_due') && !amt(young.earnings, 'GRATUITY'));
  assert.equal(amt(computeLine(base({ joinedOn: '2023-06-01', settlement: { ...st, gratuity: 50000 } })).earnings, 'GRATUITY'), 50000);
  // Salary already paid in the month's regular run: the settlement carries only the extras.
  const extras = computeLine(base({ joinedOn: '2019-06-01', settlement: { ...st, includeSalary: false, noticeShortDays: 0 } }));
  assert.deepEqual(extras.earnings.map(e => e.code), ['LEAVE_ENC', 'GRATUITY']);
});

test('rates: the latest dated row, a school override winning on the same date', () => {
  const rows: RateRow[] = [
    { key: 'pf', effectiveFrom: '2014-09-01', value: { ceiling: 15000 } }, { key: 'pf', effectiveFrom: '2027-04-01', value: { ceiling: 21000 } },
    { key: 'pf', effectiveFrom: '2014-09-01', value: { ceiling: 18000 }, override: true }, { key: 'esi', effectiveFrom: '2019-07-01', value: {} },
  ];
  assert.equal(rateOn(rows, 'pf', '2026-10-31')!.value.ceiling, 18000);
  assert.equal(rateOn(rows, 'pf', '2027-04-30')!.value.ceiling, 21000);         // Sthara's newer table supersedes an old override
  assert.equal(rateOn(rows, 'pf', '2010-01-01'), null);
  assert.deepEqual(ratesOn(rows, '2026-10-31', 'AP'), { missing: 'itNew' });
});

test('run totals', () => {
  const a = computeLine(base({ school: { ...DEFAULT_SCHOOL_PAY, tdsEnabled: false, pfEnabled: true, ptState: 'AP' } }));
  const t = runTotals([{ ...a, onHold: false }, { ...a, onHold: true }]);
  assert.deepEqual([t.people, t.gross, t.net, t.onHold, t.byCode.PF, t.byCode.PT, t.byCode.EPS], [2, 60000, 56000, 1, 3600, 400, 2500]);
});
