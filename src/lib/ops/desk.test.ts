import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLA, afterOperatorMessage, afterSchoolMessage, byUrgency, caseRef, dueText, expiresIn, inQueue, slaDue, slaState, taskDue, type Clocked,
} from './desk';
import { can } from './roles';

const T0 = Date.parse('2026-10-14T04:00:00Z'), MIN = 60_000, H = 60 * MIN;
const mk = (over: Partial<Clocked> & { priority?: 'urgent' | 'high' | 'normal' | 'low' } = {}): Clocked => {
  const { priority = 'normal', ...rest } = over;
  const d = slaDue(DEFAULT_SLA, priority, T0);
  return { status: 'new', createdAt: new Date(T0).toISOString(), firstResponseDue: d.firstResponseDue, resolveDue: d.resolveDue, firstRespondedAt: null, resolvedAt: null, ...rest };
};

test('deadlines come from the priority', () => {
  const d = slaDue(DEFAULT_SLA, 'urgent', T0);
  assert.equal(Date.parse(d.firstResponseDue) - T0, 30 * MIN);
  assert.equal(Date.parse(d.resolveDue) - T0, 4 * H);
  assert.equal(Date.parse(slaDue([], 'low', T0).resolveDue) - T0, 7 * 24 * H, 'falls back to the defaults');
  assert.equal(caseRef(1001), 'CASE-1001');
});

test('the first-response clock runs until a reply the school can see', () => {
  const c = mk();                                           // normal: 8 h first response
  assert.deepEqual([slaState(c, T0 + H).stage, slaState(c, T0 + H).level], ['first_response', 'ok']);
  assert.equal(slaState(c, T0 + 7 * H + 5 * MIN).level, 'soon', 'inside the last hour');
  assert.equal(slaState(c, T0 + 9 * H).level, 'breached');
  assert.equal(slaState(c, T0 + 9 * H).minutesLeft, -60);
});

test('once answered, the resolution clock takes over; waiting on the school shows as paused', () => {
  const c = mk({ status: 'open', firstRespondedAt: new Date(T0 + H).toISOString() });   // 72 h to resolve
  assert.deepEqual([slaState(c, T0 + 2 * H).stage, slaState(c, T0 + 2 * H).level], ['resolution', 'ok']);
  assert.equal(slaState(c, T0 + 71.5 * H).level, 'soon');
  assert.equal(slaState(c, T0 + 73 * H).level, 'breached');
  assert.equal(slaState({ ...c, status: 'waiting_school' }, T0 + 71.5 * H).level, 'paused');
  assert.equal(slaState({ ...c, status: 'waiting_school' }, T0 + 73 * H).level, 'breached', 'a missed deadline is never hidden');
});

test('a finished case is met or breached for good', () => {
  const onTime = mk({ status: 'resolved', firstRespondedAt: new Date(T0 + H).toISOString(), resolvedAt: new Date(T0 + 5 * H).toISOString() });
  assert.deepEqual([slaState(onTime, T0 + 500 * H).level, slaState(onTime, T0 + 500 * H).everBreached], ['met', false]);
  const lateReply = mk({ status: 'closed', firstRespondedAt: new Date(T0 + 9 * H).toISOString(), resolvedAt: new Date(T0 + 10 * H).toISOString() });
  assert.equal(slaState(lateReply, T0 + 500 * H).level, 'breached');
  const neverReplied = mk({ status: 'resolved', resolvedAt: new Date(T0 + 2 * H).toISOString() });
  assert.equal(slaState(neverReplied, T0 + 500 * H).level, 'met', 'resolved before the first reply fell due');
});

test('due text reads in the unit that fits', () => {
  assert.deepEqual([dueText(25), dueText(180), dueText(3 * 1440), dueText(-40), dueText(-300)], ['in 25 min', 'in 3 h', 'in 3 days', '40 min late', '5 h late']);
});

test('queues', () => {
  const mine = { ...mk({ status: 'open', firstRespondedAt: new Date(T0).toISOString() }), ownerId: 'me' };
  const loose = { ...mk(), ownerId: null };
  const done = { ...mk({ status: 'resolved', resolvedAt: new Date(T0 + H).toISOString() }), ownerId: 'me' };
  const now = T0 + 2 * H;
  assert.ok(inQueue(mine, 'mine', 'me', now) && !inQueue(mine, 'mine', 'you', now) && !inQueue(done, 'mine', 'me', now));
  assert.ok(inQueue(loose, 'unassigned', 'me', now) && !inQueue(mine, 'unassigned', 'me', now));
  assert.ok(inQueue(loose, 'breaching', 'me', T0 + 9 * H) && !inQueue(loose, 'breaching', 'me', now));
  assert.ok(inQueue(done, 'resolved', 'me', now) && !inQueue(done, 'open', 'me', now) && inQueue(done, 'all', 'me', now));
});

test('the list puts late cases first, then nearly late, then by deadline; finished last', () => {
  const now = T0 + 9 * H;
  const late = mk(), fine = mk({ priority: 'low' }), done = mk({ status: 'resolved', resolvedAt: new Date(T0 + H).toISOString() });
  const urgentSoon = { ...mk({ priority: 'high', status: 'open', firstRespondedAt: new Date(T0).toISOString() }), resolveDue: new Date(now + 30 * MIN).toISOString() };
  const sorted = [done, fine, urgentSoon, late].sort(byUrgency(now));
  assert.deepEqual(sorted, [late, urgentSoon, fine, done]);
});

test('an operator reply answers the first-response clock; an internal note does not', () => {
  const at = '2026-10-14T05:00:00.000Z', fresh = { status: 'new' as const, firstRespondedAt: null };
  assert.deepEqual(afterOperatorMessage(fresh, false, 'none', at), { firstRespondedAt: at, status: 'open' });
  assert.deepEqual(afterOperatorMessage(fresh, true, 'none', at), { status: 'open' });
  assert.deepEqual(afterOperatorMessage(fresh, true, 'resolve', at), { status: 'open' }, 'an internal note cannot resolve a case');
  assert.deepEqual(afterOperatorMessage(fresh, false, 'wait', at), { firstRespondedAt: at, status: 'waiting_school', resolvedAt: null });
  assert.deepEqual(afterOperatorMessage({ status: 'open', firstRespondedAt: at }, false, 'resolve', at), { status: 'resolved', resolvedAt: at });
  assert.deepEqual(afterOperatorMessage({ status: 'closed', firstRespondedAt: at }, false, 'resolve', at), {});
});

test('a school reply brings the case back, reopens a resolved one, and a closed one takes none', () => {
  assert.deepEqual(afterSchoolMessage({ status: 'waiting_school', reopened: 0 }), { ok: true, status: 'open', reopened: 0 });
  assert.deepEqual(afterSchoolMessage({ status: 'new', reopened: 0 }), { ok: true, status: 'new', reopened: 0 });
  assert.deepEqual(afterSchoolMessage({ status: 'resolved', reopened: 1 }), { ok: true, status: 'open', reopened: 2, resolvedAt: null });
  assert.equal(afterSchoolMessage({ status: 'closed', reopened: 0 }).ok, false);
});

test('tasks and document expiry against today', () => {
  assert.deepEqual([taskDue(null, '2026-10-14'), taskDue('2026-10-13', '2026-10-14'), taskDue('2026-10-14', '2026-10-14'), taskDue('2026-11-01', '2026-10-14')], ['no_date', 'overdue', 'today', 'upcoming']);
  assert.deepEqual([expiresIn(null, '2026-10-14'), expiresIn('2026-10-24', '2026-10-14'), expiresIn('2026-10-10', '2026-10-14')], [null, 10, -4]);
});

test('who works the desk and the relationship', () => {
  assert.ok(can('support_agent', 'desk.work') && can('account_manager', 'desk.work') && can('engineer', 'desk.work'));
  assert.ok(!can('sales_rep', 'desk.read') && !can('finance', 'desk.read'));
  assert.ok(can('sales_rep', 'crm.write') && can('finance', 'crm.read') && !can('finance', 'crm.write') && !can('engineer', 'crm.write'));
  for (const r of ['regional_lead', 'support_agent', 'account_manager', 'engineer', 'sales_rep', 'finance'] as const) assert.equal(can(r, 'desk.admin'), false, r);
});
