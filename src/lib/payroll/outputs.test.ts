import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, DEFAULT_PERSON_PAY, DEFAULT_SCHOOL_PAY, type PayItem, type Rates } from './engine';
import { bankRows, ecrText, esiRows, journalRows, ptRows, registerRows, taxYearRows, tdsRows, type RunLine, type Secrets } from './outputs';
import { rupeesInWords } from './payslip';

const item = (id: string, o: Partial<PayItem> = {}): PayItem => ({ id, code: id.toUpperCase(), name: id, kind: 'earning', calc: 'fixed', percentOf: null, countSource: null, threshold: 0, defaultValue: 0, role: null, taxable: true, pfWage: false, esiWage: true, prorate: true, sort: 0, active: true, ...o });
const ITEMS = [item('basic', { role: 'basic', pfWage: true }), item('special')];
const RATES: Rates = {
  pf: { employee_pct: 12, employer_pct: 12, eps_pct: 8.33, ceiling: 15000, admin_pct: 0.5, edli_pct: 0.5 }, esi: { employee_pct: 0.75, employer_pct: 3.25, ceiling: 21000 },
  pt: { slabs: [{ upto: 15000, amount: 0 }, { upto: 20000, amount: 150 }, { upto: null, amount: 200 }] },
  itNew: { standard_deduction: 75000, slabs: [{ upto: 400000, pct: 0 }, { upto: 800000, pct: 5 }, { upto: 1200000, pct: 10 }, { upto: 1600000, pct: 15 }, { upto: 2000000, pct: 20 }, { upto: 2400000, pct: 25 }, { upto: null, pct: 30 }], rebate_income: 1200000, rebate_max: 60000, marginal_relief: true, cess_pct: 4 },
  itOld: { standard_deduction: 50000, slabs: [{ upto: 250000, pct: 0 }, { upto: null, pct: 30 }], rebate_income: 500000, rebate_max: 12500, cess_pct: 4 },
  bonus: { pct: 8.33, wage_ceiling: 21000, calc_ceiling: 7000 }, gratuity: { min_years: 5, days: 15, divisor: 26, cap: 2000000 },
};
const school = { ...DEFAULT_SCHOOL_PAY, pfEnabled: true, esiEnabled: true, ptState: 'AP' };
function line(id: string, name: string, dept: string, basic: number, special: number, o: { month?: string; hold?: boolean; cash?: boolean } = {}): RunLine {
  const month = o.month ?? '2026-10-01';
  const r = computeLine({
    month, joinedOn: '2020-01-01', lastDay: null, salaries: [{ id: 's', staffMemberId: id, effectiveFrom: '2020-01-01', lines: [{ itemId: 'basic', value: basic }, { itemId: 'special', value: special }] }],
    items: ITEMS, school, person: DEFAULT_PERSON_PAY, rates: RATES, lopDays: 0, counts: {}, adjustments: [], loans: [], ytd: { taxable: 0, pfEmployee: 0, pt: 0, tds: 0 }, declaration: null, prior: [],
    has: { bank: true, pan: true, uan: true, esiNo: true },
  });
  return { ...r, id, staffMemberId: id, month, person: { name, code: `E-${id}`, designation: 'Staff', department: dept, grade: '', category: 'office' }, onHold: !!o.hold, payMode: o.cash ? 'cash' : 'bank' };
}
const secret = (o: Partial<Secrets>): Secrets => ({ bankAccount: null, bankIfsc: null, bankHolder: null, bankName: null, pan: null, uan: null, esiNo: null, ...o });
const LINES = [line('1', 'Asha Rao', 'Science', 10000, 4000), line('2', 'Bala K', 'Office', 200000, 200000), line('3', 'Chitra', 'Office', 12000, 3000, { hold: true }), line('4', 'Dev', 'Transport', 9000, 1000, { cash: true })];
const SECRETS = new Map<string, Secrets>([
  ['1', secret({ bankAccount: '111111111', bankIfsc: 'HDFC0000001', uan: '100000000001', esiNo: '2000000001', pan: 'AAAAA1111A' })],
  ['2', secret({ bankAccount: '222222222', bankIfsc: 'HDFC0000002', bankHolder: 'BALA KUMAR', uan: '100000000002', pan: 'BBBBB2222B' })],
  ['3', secret({ bankAccount: '333333333', bankIfsc: 'HDFC0000003', uan: '100000000003', esiNo: '2000000003' })], ['4', secret({})],
]);

test('register: a column for every earning and deduction, and the totals add up', () => {
  const rows = registerRows(LINES);
  const head = rows[0] as string[], foot = rows[rows.length - 1];
  assert.deepEqual(head.slice(0, 6), ['Employee code', 'Name', 'Designation', 'Department', 'Paid days', 'Loss of pay days']);
  const col = (name: string) => head.indexOf(name);
  assert.equal(foot[col('Gross')], LINES.reduce((n, l) => n + l.gross, 0));
  assert.equal(foot[col('Net pay')], LINES.reduce((n, l) => n + l.net, 0));
  assert.equal(Number(foot[col('Gross')]) - Number(foot[col('Total deductions')]), foot[col('Net pay')]);
  assert.equal(rows[3][rows[3].length - 1], 'On hold');
});

test('bank sheet: bank payees only, holds and missing accounts left out and named', () => {
  const { rows, skipped } = bankRows(LINES, SECRETS, 'Salary Oct 2026');
  assert.deepEqual(rows.slice(1).map(r => [r[0], r[1], r[3]]), [['Asha Rao', '111111111', LINES[0].net], ['BALA KUMAR', '222222222', LINES[1].net]]);
  assert.deepEqual(skipped, ['Chitra: on hold']);
  assert.deepEqual(bankRows([{ ...LINES[3], payMode: 'bank' }], SECRETS, 'x').skipped, ['Dev: no bank account on record']);
});

test('PF ECR: one line a member, wages and shares in the EPFO order', () => {
  const { text, skipped } = ecrText(LINES, SECRETS, 15000);
  const rows = text.split('\n').map(r => r.split('#~#'));
  // Asha: Basic 10,000. EPF 1,200; EPS 833; difference 367.
  assert.deepEqual(rows[0], ['100000000001', 'ASHA RAO', '14000', '10000', '10000', '10000', '1200', '833', '367', '0', '0']);
  // Bala: Basic 2,00,000 capped at 15,000.
  assert.deepEqual(rows[1].slice(3, 9), ['15000', '15000', '15000', '1800', '1250', '550']);
  assert.deepEqual(skipped, ['Dev: no UAN on record']);
  assert.equal(rows.length, 3);
});

test('ESI, professional tax and TDS statements', () => {
  const esi = esiRows(LINES, SECRETS);
  // Asha (14,000) and Chitra (15,000) are within the ceiling; Dev too but has no ESI number.
  assert.deepEqual(esi.rows.slice(1).map(r => [r[0], r[3], r[4], r[5]]), [['2000000001', 14000, 105, 455], ['2000000003', 15000, 113, 488]]);
  assert.deepEqual(esi.skipped, ['Dev: no ESI number on record']);
  const pt = ptRows(LINES);
  assert.deepEqual(pt[pt.length - 1].slice(1), ['Total', 400000, 200]);
  const tds = tdsRows(LINES, SECRETS);
  assert.equal(tds.length, 3);                                  // header, Bala, total
  assert.deepEqual([tds[1][1], tds[1][2], tds[1][3]], ['Bala K', 'BBBBB2222B', 'new']);
  assert.ok(Number(tds[2][8]) > 0);
});

test('journal: debits equal credits, expense split by department', () => {
  const rows = journalRows(LINES, '2026-10-01');
  const total = rows[rows.length - 1];
  assert.equal(total[1], total[2]);
  const acct = (name: string) => rows.find(r => r[0] === name);
  assert.equal(acct('Salaries and wages: Office')![1], 415000);
  assert.equal(acct('Salaries payable (on hold)')![2], LINES[2].net);
  assert.equal(acct('Salaries payable')![2], LINES[0].net + LINES[1].net + LINES[3].net);
  assert.ok(Number(acct('PF payable')![2]) > 0 && acct('Professional tax payable')![2] === 200);
  assert.equal(rows[1][3], 'Salaries for October 2026');
});

test('year statement: salary paid, the latest computation, TDS by quarter', () => {
  const year = ['2026-06-01', '2026-10-01', '2027-01-01'].map(month => line('2', 'Bala K', 'Office', 200000, 200000, { month }));
  const rows = taxYearRows(year, SECRETS);
  const head = rows[0] as string[], r = rows[1];
  const c = (n: string) => r[head.indexOf(n)];
  assert.deepEqual([c('Name'), c('PAN'), c('Months paid'), c('Gross salary paid')], ['Bala K', 'BBBBB2222B', 3, 1200000]);
  const tds = (l: RunLine) => l.deductions.find(d => d.code === 'TDS')?.amount ?? 0;
  assert.ok(tds(year[0]) > 0 && tds(year[1]) > 0);
  assert.deepEqual([c('TDS Q1 (Apr-Jun)'), c('TDS Q2 (Jul-Sep)'), c('TDS Q3 (Oct-Dec)'), c('TDS Q4 (Jan-Mar)')], [tds(year[0]), 0, tds(year[1]), tds(year[2])]);
  assert.equal(c('TDS deducted'), tds(year[0]) + tds(year[1]) + tds(year[2]));
  assert.equal(c('Tax for the year'), year[2].tax!.annualTax);
});

test('rupees in words', () => {
  assert.equal(rupeesInWords(0), 'zero');
  assert.equal(rupeesInWords(28000), 'twenty-eight thousand');
  assert.equal(rupeesInWords(123456), 'one lakh twenty-three thousand four hundred and fifty-six');
  assert.equal(rupeesInWords(10500007), 'one crore five lakh seven');
  assert.equal(rupeesInWords(101), 'one hundred and one');
});
