import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Access, ROLE_KEYS, type RoleKey } from './rbac';
import { workItems } from './work';

const desk = (role: RoleKey) => ({
  me: { id: 'me', access: new Access([role]) },
  workforce: { pendingLeave: [{ id: 'l1' }] },
  admissions: { applicants: [{ open: true, stage: 'offer' }], stale: [{ id: 'a1' }] },
  concessions: [{ status: 'pending', requestedBy: 'someone' }],
  dayBook: [{ day: '2026-10-01', receipts: 3, close: null }],
  fees: { families: [{ overdue: 100 }] },
  compliance: { flags: [{ tone: 'r' }] },
  filing: { status: 'draft', dueOn: '2026-11-30' },
}) as any;

test('every office role lands on work it can do, not only charts', () => {
  for (const role of ROLE_KEYS) {
    const items = workItems(desk(role), '2026-10-14');
    assert.ok(items.length > 0, `${role} has nothing to do on the dashboard`);
    assert.ok(items.every(i => i.actions.some(a => a.primary)), `${role}: every work card has a main action`);
  }
});

test('each role sees its own jobs', () => {
  const keys = (r: RoleKey) => workItems(desk(r), '2026-10-14').map(i => i.key);
  assert.deepEqual(keys('cashier'), ['counter']);
  assert.ok(keys('admissions_officer').includes('admissions'));
  assert.ok(keys('counsellor').includes('messages') && keys('counsellor').includes('safety'));
  assert.ok(keys('dpo').includes('consent'));
  assert.ok(keys('hr_manager').includes('leave') && keys('hr_manager').includes('hr') && keys('hr_manager').includes('payroll'));
  assert.ok(keys('academic_coordinator').includes('cover'));
  assert.ok(keys('finance_head').includes('concessions') && keys('finance_head').includes('daybook'));
  assert.ok(!keys('cashier').includes('daybook'), 'the cashier does not close the day');
  assert.deepEqual(keys('registrar'), ['register', 'certificates']);
  assert.deepEqual(keys('health_officer'), ['health']);
  assert.ok(keys('counsellor').includes('counselling'));
  assert.deepEqual(keys('safeguarding_lead'), ['safety', 'safeguarding']);
  assert.ok(keys('vice_principal').includes('discipline'));
});

test('whoever manages access is asked to assign a Safeguarding lead until one is', () => {
  const d = desk('school_admin');
  d.grants = [{ role: 'school_admin' }];
  assert.ok(workItems(d, '2026-10-24').some(i => i.key === 'dsl'));
  d.grants = [{ role: 'safeguarding_lead' }];
  assert.ok(!workItems(d, '2026-10-24').some(i => i.key === 'dsl'));
  assert.ok(!workItems(desk('principal'), '2026-10-24').some(i => i.key === 'dsl'), 'the principal does not manage access');
});

test('own concession requests are not "waiting for your approval"', () => {
  const d = desk('finance_head');
  d.concessions = [{ status: 'pending', requestedBy: 'me' }];
  assert.ok(!workItems(d, '2026-10-14').some(i => i.key === 'concessions'));
});
