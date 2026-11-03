import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkFees, checkPayment, feeDue, feesOf, lotteryOrder, NO_FEES, rteModeOf, suggestRteSeats } from './rteFees';

test('fee rules: none unless set, checked amounts and concessions', () => {
  assert.deepEqual(feesOf(null), NO_FEES);
  assert.deepEqual(feesOf({ admissions: { fees: { application: 500, deposit: 'x', depositDays: 200, siblingPct: 10 } } }),
    { ...NO_FEES, application: 500, siblingPct: 10 });
  assert.ok('error' in checkFees({ admission: -1 }));
  assert.ok('error' in checkFees({ admission: 100.555 }), 'paise, not fractions of them');
  assert.ok('error' in checkFees({ depositDays: 0 }));
  assert.ok('error' in checkFees({ staffPct: 101 }));
  const ok = checkFees({ application: '500', deposit: '10000', admission: '25000', depositDays: '7', siblingPct: '10', staffPct: '' });
  assert.ok('value' in ok);
  if ('value' in ok) assert.deepEqual(ok.value, { application: 500, deposit: 10000, admission: 25000, depositDays: 7, siblingPct: 10, staffPct: 0 });
});

test('what is owed: the larger concession, on the admission fee only', () => {
  const r = { ...NO_FEES, application: 500, admission: 25000, siblingPct: 10, staffPct: 25 };
  assert.deepEqual(feeDue('application', r, { sibling: true, staff: true }), { amount: 500, concession: 0, why: null });
  assert.deepEqual(feeDue('admission', r, { sibling: false, staff: false }), { amount: 25000, concession: 0, why: null });
  assert.deepEqual(feeDue('admission', r, { sibling: true, staff: false }), { amount: 22500, concession: 2500, why: '10% sibling concession' });
  assert.deepEqual(feeDue('admission', r, { sibling: true, staff: true }), { amount: 18750, concession: 6250, why: '25% staff ward concession' });
});

test('payments: a reference for everything but cash, not in the future', () => {
  const today = '2026-10-27';
  assert.ok('error' in checkPayment({ kind: 'admission', amount: 100, mode: 'upi' }, today), 'UPI needs the transaction id');
  assert.ok('error' in checkPayment({ kind: 'admission', amount: 0, mode: 'cash' }, today));
  assert.ok('error' in checkPayment({ kind: 'tuition', amount: 10, mode: 'cash' }, today));
  assert.ok('error' in checkPayment({ kind: 'deposit', amount: 10, mode: 'gateway', reference: 'x' }, today), 'the gateway is not typed in by hand');
  assert.ok('error' in checkPayment({ kind: 'deposit', amount: 10, mode: 'cash', paidOn: '2026-10-28' }, today));
  const ok = checkPayment({ kind: 'deposit', amount: '10000', mode: 'upi', reference: ' 4321UPI ' }, today);
  assert.ok('value' in ok && ok.value.reference === '4321UPI' && ok.value.paid_on === today);
});

test('RTE: the mode, a quarter of the class, and a lottery anyone can recompute', () => {
  assert.equal(rteModeOf(null), 'portal');
  assert.equal(rteModeOf({ admissions: { rte: { mode: 'lottery' } } }), 'lottery');
  assert.equal(suggestRteSeats(40), 10);
  assert.equal(suggestRteSeats(30), 8, 'rounded up: at least a quarter');
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const ids = ['b', 'a', 'd', 'c'];
  const first = lotteryOrder('0f'.repeat(16), ids, sha);
  assert.deepEqual(lotteryOrder('0f'.repeat(16), [...ids].reverse(), sha), first, 'the order of entry does not matter');
  assert.deepEqual([...first].sort(), ['a', 'b', 'c', 'd']);
  assert.notDeepEqual(lotteryOrder('1e'.repeat(16), ids, sha), first, 'another seed, another order');
});
