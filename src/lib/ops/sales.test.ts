import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIMITS, approvalNeeded, canDecide, daysInStage, effectiveStatus, forecast, moveProblem, quoteMath, quoteMoves, quoteProblem, quoteRef,
  type Opp, type Stage,
} from './sales';
import { can } from './roles';

const STAGES: Stage[] = [
  { key: 'qualify', label: 'Qualifying', sort: 10, probability: 10, kind: 'open', active: true },
  { key: 'pilot_running', label: 'Pilot running', sort: 40, probability: 60, kind: 'open', active: true },
  { key: 'negotiation', label: 'Negotiation', sort: 50, probability: 80, kind: 'open', active: true },
  { key: 'won', label: 'Won', sort: 90, probability: 100, kind: 'won', active: true },
  { key: 'lost', label: 'Lost', sort: 99, probability: 0, kind: 'lost', active: true },
];

test('a quote comes to seats times price for the term, plus 18% GST', () => {
  const q = quoteMath('shikhara', 800, 3500, 12);
  assert.deepEqual([q.listPrice, q.discountPct, q.annual, q.subtotal, q.gst, q.total], [3500, 0, 2_800_000, 2_800_000, 504_000, 3_304_000]);
  const d = quoteMath('shikhara', 800, 3150, 24);
  assert.deepEqual([d.discountPct, d.annual, d.subtotal], [10, 2_520_000, 5_040_000]);
  assert.equal(quoteMath('sthamba', 100, 2333.33).discountPct, 6.7, 'to one decimal');
  assert.equal(quoteMath('sthamba', 100, 3000).discountPct, 0, 'above list is not a negative discount');
  assert.deepEqual([quoteMath('mandala', 5000, 1800).listPrice, quoteMath('mandala', 5000, 1800).discountPct], [null, 0]);
  assert.equal(quoteRef(1001), 'Q-1001');
  assert.equal(quoteRef(1001, 3), 'Q-1001-v3');
});

test('a quote that cannot be saved says why', () => {
  const ok = { plan: 'sthamba', students: 500, pricePerStudent: 2500, termMonths: 12, validUntil: '2026-11-30' };
  assert.equal(quoteProblem(ok, '2026-10-14'), null);
  assert.match(quoteProblem({ ...ok, plan: 'pilot' }, '2026-10-14')!, /tier/);
  assert.match(quoteProblem({ ...ok, students: 0 }, '2026-10-14')!, /students/);
  assert.match(quoteProblem({ ...ok, pricePerStudent: 0 }, '2026-10-14')!, /price/);
  assert.match(quoteProblem({ ...ok, validUntil: '2026-10-01' }, '2026-10-14')!, /valid/);
});

test('discounts within a writer\'s limit need nobody; above it, the lowest approver who can cover it', () => {
  const L = DEFAULT_LIMITS;
  assert.equal(approvalNeeded(L, 'sales_rep', 'shikhara', 5), null);
  assert.equal(approvalNeeded(L, 'sales_rep', 'shikhara', 5.1), 'regional_lead');
  assert.equal(approvalNeeded(L, 'sales_rep', 'shikhara', 15), 'regional_lead');
  assert.equal(approvalNeeded(L, 'sales_rep', 'shikhara', 15.1), 'director');
  assert.equal(approvalNeeded(L, 'regional_lead', 'shikhara', 12), null);
  assert.equal(approvalNeeded(L, 'regional_lead', 'shikhara', 30), 'director');
  assert.equal(approvalNeeded(L, 'sales_rep', 'mandala', 0), 'director', 'a custom price always goes to the director');
  assert.equal(approvalNeeded(L, 'director', 'mandala', 0), null);
  assert.equal(approvalNeeded(L, 'director', 'shikhara', 60), null);
  assert.equal(approvalNeeded({ ...L, sales_rep: 0 }, 'sales_rep', 'sthamba', 1), 'regional_lead');
});

test('who may decide an approval', () => {
  const L = DEFAULT_LIMITS, lead = { id: 'lead', role: 'regional_lead' as const }, dir = { id: 'dir', role: 'director' as const }, rep = { id: 'rep', role: 'sales_rep' as const };
  const q = { needsRole: 'regional_lead', discountPct: 10, plan: 'shikhara' as const, createdBy: 'rep', status: 'pending_approval' };
  assert.ok(canDecide(L, lead, q) && canDecide(L, dir, q));
  assert.equal(canDecide(L, rep, q), false);
  assert.equal(canDecide(L, lead, { ...q, createdBy: 'lead' }), false, 'nobody approves their own quote');
  assert.equal(canDecide(L, lead, { ...q, needsRole: 'director', discountPct: 30 }), false);
  assert.equal(canDecide(L, lead, { ...q, discountPct: 20 }), false, 'the limit is checked again, in case it was lowered');
  assert.equal(canDecide(L, dir, { ...q, status: 'approved' }), false);
  assert.ok(canDecide(L, dir, { ...q, createdBy: 'dir' }), 'the director is the last word');
});

test('quote status: lapses after its date, and only moves where it can', () => {
  assert.equal(effectiveStatus({ status: 'sent', validUntil: '2026-10-01' }, '2026-10-14'), 'expired');
  assert.equal(effectiveStatus({ status: 'accepted', validUntil: '2026-10-01' }, '2026-10-14'), 'accepted');
  assert.equal(effectiveStatus({ status: 'sent', validUntil: '2026-10-14' }, '2026-10-14'), 'sent');
  assert.deepEqual(quoteMoves('draft'), ['submit']);
  assert.deepEqual(quoteMoves('pending_approval'), []);
  assert.deepEqual(quoteMoves('approved'), ['send', 'revise']);
  assert.deepEqual(quoteMoves('sent'), ['accept', 'decline', 'revise']);
  assert.deepEqual(quoteMoves('accepted'), []);
});

test('moving a deal: lost needs a reason, won needs a price', () => {
  const o = { amount: 0, stage: 'qualify' };
  assert.equal(moveProblem(STAGES, o, 'negotiation', null), null);
  assert.match(moveProblem(STAGES, o, 'lost', null)!, /why/);
  assert.equal(moveProblem(STAGES, o, 'lost', 'price'), null);
  assert.match(moveProblem(STAGES, o, 'won', null)!, /tier, students and price/);
  assert.equal(moveProblem(STAGES, { ...o, amount: 100 }, 'won', null), null);
  assert.match(moveProblem(STAGES, o, 'nope', null)!, /does not exist/);
  assert.match(moveProblem(STAGES.map(s => (s.key === 'negotiation' ? { ...s, active: false } : s)), o, 'negotiation', null)!, /retired/);
});

const opp = (over: Partial<Opp>): Opp => ({ id: 'o', stage: 'qualify', amount: 1_000_000, expectedClose: null, ownerId: null, closedAt: null, stageChangedAt: '2026-10-01T00:00:00Z', kind: 'new', lossReason: null, ...over });

test('forecast: weighted by stage, by month, with what closed in the last 90 days', () => {
  const f = forecast([
    opp({ stage: 'qualify', expectedClose: '2026-12-15' }),                              // 10% of 10 L
    opp({ stage: 'negotiation', amount: 2_000_000, expectedClose: '2026-10-30' }),        // 80% of 20 L
    opp({ stage: 'pilot_running', amount: 500_000, expectedClose: '2026-09-20' }),        // overdue: counts in October
    opp({ stage: 'pilot_running', amount: 300_000 }),                                     // no date
    opp({ stage: 'won', amount: 3_500_000, closedAt: '2026-09-01T00:00:00Z' }),
    opp({ stage: 'lost', closedAt: '2026-08-20T00:00:00Z', lossReason: 'price' }),
    opp({ stage: 'lost', closedAt: '2026-08-25T00:00:00Z', lossReason: 'price' }),
    opp({ stage: 'lost', closedAt: '2026-01-01T00:00:00Z', lossReason: 'timing' }),       // older than 90 days
  ], STAGES, '2026-10-14');
  assert.deepEqual(f.open, { count: 4, amount: 3_800_000, weighted: 100_000 + 1_600_000 + 300_000 + 180_000 });
  assert.deepEqual(f.byMonth[0], { month: '2026-10', count: 2, amount: 2_500_000, weighted: 1_900_000 });
  assert.deepEqual(f.byMonth[2], { month: '2026-12', count: 1, amount: 1_000_000, weighted: 100_000 });
  assert.equal(f.byMonth.length, 6);
  assert.deepEqual(f.undated, { count: 1, amount: 300_000 });
  assert.equal(f.overdue, 1);
  assert.deepEqual([f.won, f.lost, f.winRate], [{ count: 1, amount: 3_500_000 }, { count: 2, amount: 2_000_000 }, 33]);
  assert.deepEqual(f.lossReasons, [{ reason: 'price', count: 2 }]);
  assert.equal(f.byStage.find(s => s.key === 'lost')!.count, 2, 'old closed deals drop off the board');
  assert.equal(forecast([], STAGES, '2026-10-14').winRate, null);
  assert.equal(daysInStage('2026-10-01T00:00:00Z', Date.parse('2026-10-14T06:00:00Z')), 13);
});

test('who sells', () => {
  assert.ok(can('sales_rep', 'sales.work') && can('regional_lead', 'sales.work') && can('account_manager', 'sales.work'));
  assert.ok(can('finance', 'sales.read') && !can('finance', 'sales.work'));
  assert.ok(!can('support_agent', 'sales.read') && !can('engineer', 'sales.read'));
  for (const r of ['regional_lead', 'sales_rep', 'account_manager', 'finance'] as const) assert.equal(can(r, 'sales.admin'), false, r);
});
