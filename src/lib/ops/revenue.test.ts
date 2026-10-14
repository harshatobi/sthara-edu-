import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquisitionCost, campaignCode, campaignStats, commissionLines, commissionMoves, commissionTotals, utmFrom } from './revenue';
import { can } from './roles';

const partner = { id: 'p1', name: 'Vidya Dealers', pct: 10 }, owner = { id: 'rep', name: 'Asha' }, manager = { id: 'lead', name: 'Ravi' };

test('a won deal owes the partner at its own rate, then Sthara\'s people by the rules switched on', () => {
  const lines = commissionLines({ amount: 2_800_000, partner, owner, manager }, { deal_owner: { ratePct: 2, active: true }, owner_manager: { ratePct: 0.5, active: true } });
  assert.deepEqual(lines.map(l => [l.payeeName, l.reason, l.ratePct, l.amount]), [
    ['Vidya Dealers', 'Partner commission', 10, 280_000], ['Asha', 'Sales commission', 2, 56_000], ['Ravi', 'Manager override', 0.5, 14_000],
  ]);
  assert.ok(lines.every(l => l.basis === 2_800_000));
  assert.deepEqual(commissionLines({ amount: 2_800_000, partner: null, owner, manager }, { deal_owner: { ratePct: 2, active: false } }), [], 'a rule that is off pays nothing');
  assert.deepEqual(commissionLines({ amount: 0, partner, owner, manager }, { deal_owner: { ratePct: 2, active: true } }), []);
  assert.deepEqual(commissionLines({ amount: 100, partner: { ...partner, pct: 0 }, owner: null, manager: null }, {}), []);
  assert.equal(commissionLines({ amount: 1000, partner: null, owner, manager: owner }, { deal_owner: { ratePct: 2, active: true }, owner_manager: { ratePct: 1, active: true } }).length, 1, 'nobody is paid twice as their own manager');
  assert.equal(commissionLines({ amount: 333.33, partner: { ...partner, pct: 7.5 }, owner: null, manager: null }, {})[0].amount, 25);
});

test('a commission is approved, then paid; a paid one is final', () => {
  assert.deepEqual(commissionMoves('accrued'), ['approve', 'cancel']);
  assert.deepEqual(commissionMoves('approved'), ['pay', 'cancel']);
  assert.deepEqual(commissionMoves('paid'), []);
  assert.deepEqual(commissionMoves('cancelled'), ['reopen']);
  assert.deepEqual(commissionTotals([{ status: 'accrued', amount: 100 }, { status: 'approved', amount: 50.5 }, { status: 'paid', amount: 30 }, { status: 'cancelled', amount: 999 }]),
    { accrued: 100, approved: 50.5, paid: 30, owed: 150.5 });
});

test('campaign codes and UTM tags are tidied', () => {
  assert.equal(campaignCode('  Hyderabad Principals Meet 2026! '), 'hyderabad-principals-meet-2026');
  assert.equal(campaignCode('cbse_q3-search'), 'cbse_q3-search');
  assert.equal(campaignCode(42), '');
  assert.deepEqual(utmFrom({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'CBSE-Q3', gclid: 'x' }), { source: 'google', medium: 'cpc', campaign: 'CBSE-Q3' });
  assert.deepEqual(utmFrom({ utm_source: ' ' }), null);
  assert.deepEqual(utmFrom({}), null);
});

test('a campaign\'s numbers: a lead that became a deal is counted once', () => {
  const spend = [{ campaignId: 'c1', amount: 60_000 }, { campaignId: 'c1', amount: 40_000 }, { campaignId: 'c2', amount: 5 }, { campaignId: null, amount: 9 }];
  const enquiries = [{ id: 'e1', campaignId: 'c1' }, { id: 'e2', campaignId: 'c1' }, { id: 'e3', campaignId: 'c1' }, { id: 'e9', campaignId: 'c2' }];
  const deals = [
    { campaignId: 'c1', enquiryId: 'e1', amount: 2_000_000, outcome: 'won' as const },     // from an enquiry of this campaign
    { campaignId: null, enquiryId: 'e2', amount: 500_000, outcome: 'open' as const },      // inherits the campaign through its enquiry
    { campaignId: 'c1', enquiryId: null, amount: 800_000, outcome: 'lost' as const },      // a deal with no enquiry: its own lead
    { campaignId: 'c2', enquiryId: null, amount: 1, outcome: 'won' as const },
  ];
  const s = campaignStats({ id: 'c1', budget: 200_000 }, spend, enquiries, deals);
  assert.deepEqual(s, { spend: 100_000, leads: 4, deals: 3, won: 1, wonValue: 2_000_000, costPerLead: 25_000, costPerWin: 100_000, returnMultiple: 20, budgetUsedPct: 50 });
  const empty = campaignStats({ id: 'c3', budget: null }, spend, enquiries, deals);
  assert.deepEqual([empty.spend, empty.leads, empty.costPerLead, empty.costPerWin, empty.returnMultiple, empty.budgetUsedPct], [0, 0, null, null, null, null]);
});

test('what one lead cost: direct spend plus an even share of its campaign', () => {
  assert.deepEqual(acquisitionCost(12_000, 100_000, 4), { direct: 12_000, share: 25_000, total: 37_000 });
  assert.deepEqual(acquisitionCost(0, 100_000, 0), { direct: 0, share: 0, total: 0 });
  assert.deepEqual(acquisitionCost(500.555, 0, 3), { direct: 500.56, share: 0, total: 500.56 });
});

test('who handles partners, commissions and marketing', () => {
  assert.ok(can('sales_rep', 'partners.read') && !can('sales_rep', 'partners.manage') && !can('sales_rep', 'commissions.manage'));
  assert.ok(can('finance', 'commissions.manage') && can('finance', 'marketing.manage') && !can('finance', 'partners.manage'));
  assert.ok(can('regional_lead', 'partners.manage') && can('regional_lead', 'marketing.manage') && !can('regional_lead', 'commissions.manage'));
  assert.ok(!can('support_agent', 'partners.read') && !can('engineer', 'marketing.read'));
});
