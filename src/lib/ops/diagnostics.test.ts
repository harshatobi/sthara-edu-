import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInfo, loginVerdict, type LoginFacts } from './diagnostics';
import { during, isRateLimited, percentile, routeOf, speed } from '../debug/route';
import { SWITCH_KEYS, switchJournalLabel, switchesOff, withSwitch } from '../settings/switches';
import { schoolPolicy } from '../settings/registry';
import { can } from './roles';

const ok: LoginFacts = { role: 'teacher', hasLogin: true, confirmed: true, bannedUntil: null, lastSignIn: '2026-10-01T00:00:00Z', left: false, tempPassword: false, emailMatches: true, hasPassword: true, twoFactor: false };
const live = { active: true, trialExpired: false };

test('a healthy account can sign in, and the verdict says where else to look', () => {
  const v = loginVerdict(ok, live);
  assert.ok(v.canSignIn && !v.blockers.length);
  assert.match(v.notes[0], /school code or role tile/);
});

test('each thing that blocks sign-in is named', () => {
  assert.match(loginVerdict({ ...ok, hasLogin: false }, live).blockers[0], /no login/);
  assert.match(loginVerdict({ ...ok, left: true, bannedUntil: '2126-01-01' }, live).blockers[0], /left the school/);
  assert.equal(loginVerdict({ ...ok, left: true, bannedUntil: '2126-01-01' }, live).blockers.length, 1, 'the ban that comes with leaving is not reported twice');
  assert.match(loginVerdict({ ...ok, bannedUntil: '2126-01-01' }, live).blockers[0], /Re-sync/);
  assert.match(loginVerdict({ ...ok, bannedUntil: '2126-01-01' }, { active: false, trialExpired: false }).blockers[0], /suspended/);
  assert.match(loginVerdict(ok, { active: true, trialExpired: true }).blockers[0], /pilot has ended/);
  assert.match(loginVerdict({ ...ok, confirmed: false }, live).blockers[0], /never confirmed/);
  assert.equal(loginVerdict({ ...ok, tempPassword: true, lastSignIn: null }, live).canSignIn, true);
  assert.equal(loginVerdict({ ...ok, tempPassword: true, lastSignIn: null }, live).notes.length, 2);
});

test('every check has a title, and unknown ones still read', () => {
  assert.equal(checkInfo('duplicate_roll_numbers').fix, 'support');
  assert.equal(checkInfo('some_new_check').title, 'some new check');
});

test('routes drop ids and queries', () => {
  assert.equal(routeOf('/api/ops/schools/78adedcd-9834-4a17-b6a8-745903552fc0/support?x=1'), '/api/ops/schools/:id/support');
  assert.equal(routeOf('/api/student/homework/123456'), '/api/student/homework/:id');
  assert.equal(routeOf('/api/tutor/session'), '/api/tutor/session');
  assert.equal(routeOf(`/api/x/${'a'.repeat(60)}`), '/api/x/:id');
});

test('what happened during a request: same user, inside its span', () => {
  const req = { userId: 'u1', at: '2026-10-13T10:00:10.000Z', durationMs: 8000 };
  assert.ok(during(req, 'u1', '2026-10-13T10:00:05.000Z'));
  assert.ok(during(req, 'u1', '2026-10-13T10:00:10.500Z'), 'written just after the response');
  assert.equal(during(req, 'u1', '2026-10-13T10:00:00.000Z'), false, 'before it started');
  assert.equal(during(req, 'u2', '2026-10-13T10:00:05.000Z'), false);
  assert.equal(during({ ...req, userId: null }, null, '2026-10-13T10:00:05.000Z'), false);
});

test('speed bands, rate limits and percentiles', () => {
  assert.deepEqual([speed(200), speed(1500), speed(9000)], ['fast', 'slow', 'very_slow']);
  assert.ok(isRateLimited('got status: 429 Too Many Requests') && isRateLimited('RESOURCE_EXHAUSTED') && isRateLimited('You exceeded your current quota'));
  assert.equal(isRateLimited('fetch failed'), false);
  assert.equal(isRateLimited(null), false);
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
});

test('kill switches: everything on unless stored as off, and the stored value stays minimal', () => {
  assert.deepEqual(switchesOff({}), []);
  assert.deepEqual(switchesOff({ switches: { tutor: false, ask: true, bogus: false, whatsapp: 'no' } }), ['tutor']);
  assert.deepEqual(withSwitch({}, 'whatsapp', false), { whatsapp: false });
  assert.deepEqual(withSwitch({ switches: { tutor: false } }, 'ask', false), { tutor: false, ask: false });
  assert.equal(withSwitch({ switches: { tutor: false } }, 'tutor', true), null);
  assert.equal(switchJournalLabel('switch.tutor'), 'Switch: AI tutor');
  assert.equal(switchJournalLabel('plan'), null);
  const p = schoolPolicy({ id: 's', name: 'S', institution_type: 'school', trial_expires_at: null, settings: { plan: 'sthamba', switches: { teacherTools: false } } });
  assert.deepEqual(p.off, ['teacherTools']);
  assert.equal(SWITCH_KEYS.length, 5);
});

test('debug tools are for support, engineers and the director; only engineers and the director act', () => {
  assert.ok(can('support_agent', 'debug.read') && !can('support_agent', 'debug.manage') && !can('support_agent', 'schools.switches'));
  assert.ok(can('engineer', 'debug.manage') && can('engineer', 'schools.switches'));
  for (const r of ['sales_rep', 'finance', 'account_manager'] as const) assert.equal(can(r, 'debug.read'), false, r);
});
