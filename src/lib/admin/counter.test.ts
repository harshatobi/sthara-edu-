import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, dues, findFamilies, paymentProblem, tillFor } from './counter';
import type { Family, Invoice, Receipt } from './fees';

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i', studentId: 's', instalmentNo: 1, label: 'Term 1', invoiceNo: 'INV-1', dueOn: '2026-06-10', amount: 20000, concession: 0, concessionReason: null,
  paid: 0, balance: 20000, status: 'due', daysOverdue: 0, voided: false, receipts: [], ...over,
} as Invoice);
const fam = (over: Partial<Family>): Family => ({
  studentId: 's1', name: 'Aarav Rao', cls: 'Class 9-A', invoices: [], billed: 0, paid: 0, outstanding: 0, overdue: 0, maxDaysOverdue: 0,
  lateHistory: { late: 0, settled: 0 }, remindersSent: 0, lastReminderAt: null, tone: 'gentle', ...over,
} as Family);
const rc = (over: Partial<Receipt>): Receipt => ({ id: 'r', invoiceId: 'i', studentId: 's', amount: 1000, mode: 'cash', reference: null, paidOn: '2026-10-14', receiptNo: 'R-1', recordedAt: '', voided: false, voidReason: null, ...over });

test('dues are the unpaid, unvoided invoices, oldest first', () => {
  const f = fam({ invoices: [inv({ id: 'c', dueOn: '2026-12-10', instalmentNo: 3 }), inv({ id: 'a', dueOn: '2026-06-10' }), inv({ id: 'p', balance: 0 }), inv({ id: 'v', voided: true }), inv({ id: 'b', dueOn: '2026-09-10', instalmentNo: 2 })] });
  assert.deepEqual(dues(f).map(i => i.id), ['a', 'b', 'c']);
});

test('one sum is spread oldest first, never past a balance', () => {
  const list = [inv({ id: 'a', balance: 20000 }), inv({ id: 'b', balance: 19500.5 }), inv({ id: 'c', balance: 20000 })];
  assert.deepEqual(allocate(list, 20000).splits.map(s => [s.invoice.id, s.amount]), [['a', 20000]]);
  assert.deepEqual(allocate(list, 30000).splits.map(s => [s.invoice.id, s.amount]), [['a', 20000], ['b', 10000]]);
  assert.deepEqual(allocate(list, 39500.5).splits.map(s => [s.invoice.id, s.amount]), [['a', 20000], ['b', 19500.5]]);
  assert.equal(allocate(list, 70000).left, 10499.5);
  assert.deepEqual(allocate(list, 0).splits, []);
  assert.equal(allocate([inv({ balance: 0.1 }), inv({ balance: 0.2 })], 0.3).left, 0, 'paise do not drift');
});

test('a payment that cannot be taken says why', () => {
  assert.match(paymentProblem(0, 5000, 'cash', '')!, /amount/);
  assert.match(paymentProblem(6000, 5000, 'cash', '')!, /more than/);
  assert.match(paymentProblem(5000, 5000, 'cheque', ' ')!, /cheque number/);
  assert.match(paymentProblem(5000, 5000, 'upi', '')!, /UPI/);
  assert.equal(paymentProblem(5000, 5000, 'cash', ''), null);
  assert.equal(paymentProblem(5000, 5000, 'card', ''), null);
  assert.equal(paymentProblem(5000, 5000, 'upi', 'T123'), null);
});

test('the till counts the day\'s live receipts by mode', () => {
  const t = tillFor([rc({ amount: 1000 }), rc({ amount: 2500, mode: 'upi' }), rc({ amount: 500 }), rc({ amount: 9999, voided: true }), rc({ amount: 700, paidOn: '2026-10-13' })], '2026-10-14');
  assert.deepEqual([t.count, t.total, t.cash], [3, 4000, 1500]);
  assert.deepEqual(t.byMode, [{ mode: 'upi', count: 1, total: 2500 }, { mode: 'cash', count: 2, total: 1500 }]);
});

test('finding a family: every word must match; those who owe come first', () => {
  const list = [fam({ studentId: 'a', name: 'Aarav Rao', cls: 'Class 9-A' }), fam({ studentId: 'b', name: 'Aarav Nair', cls: 'Class 10-B', outstanding: 500 }), fam({ studentId: 'c', name: 'Diya Rao', cls: 'Class 9-A' })];
  const roll = new Map([['a', 'VN9A01'], ['c', 'VN9A02']]);
  assert.deepEqual(findFamilies(list, roll, 'aarav').map(f => f.studentId), ['b', 'a']);
  assert.deepEqual(findFamilies(list, roll, 'rao 9-a').map(f => f.studentId), ['a', 'c']);
  assert.deepEqual(findFamilies(list, roll, 'vn9a02').map(f => f.studentId), ['c']);
  assert.deepEqual(findFamilies(list, roll, 'diya 9a').map(f => f.studentId), ['c'], 'punctuation and spacing are ignored');
  assert.deepEqual(findFamilies(list, roll, 'VN-9A-01').map(f => f.studentId), ['a']);
  assert.deepEqual(findFamilies(list, roll, 'a'), []);
});
