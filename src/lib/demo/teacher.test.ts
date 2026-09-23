import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_DEMO, applyDemoAction, parseDemo, type ClassId } from './teacher';
import { canAccessRole, withTimeout } from '../auth/roles';
const at = '2026-09-22T01:00:00Z';

test('AI grades remain pending until teacher approval', () => {
  assert.ok(INITIAL_DEMO.grades.every(g => g.status === 'pending'));
  const next = applyDemoAction(INITIAL_DEMO, { type: 'grade', classId: '10A', studentId: 's1', score: 12, reason: '' }, 'Teacher', 'e1', at);
  assert.equal(next.grades[0].status, 'approved');
  assert.equal(next.events[0].before, 7);
  assert.equal(next.events[0].after, 12);
  assert.equal(next.events[0].actor, 'Teacher');
  assert.equal(INITIAL_DEMO.grades[0].status, 'pending');
});
test('amendments require a reason and retain original approval history', () => {
  const approved = applyDemoAction(INITIAL_DEMO, { type: 'grade', classId: '10A', studentId: 's1', score: 12, reason: '' }, 'Teacher', 'e1', at);
  assert.throws(() => applyDemoAction(approved, { type: 'grade', classId: '10A', studentId: 's1', score: 13, reason: ' ' }, 'Teacher', 'e2', at), /reason/);
  const changed = applyDemoAction(approved, { type: 'grade', classId: '10A', studentId: 's1', score: 13, reason: 'Method mark restored' }, 'Teacher', 'e2', at);
  assert.equal(changed.events.length, 2);
  assert.equal(changed.events[0].reason, 'Method mark restored');
  assert.equal(changed.events[0].before, 12);
  assert.equal(changed.events[1].after, 12);
});
test('rejects student access outside selected class and unassigned classes', () => {
  assert.throws(() => applyDemoAction(INITIAL_DEMO, { type: 'grade', classId: '10B', studentId: 's1', score: 10, reason: '' }, 'Teacher', 'e1', at), /outside/);
  assert.throws(() => applyDemoAction(INITIAL_DEMO, { type: 'task', classId: '11A' as ClassId, title: 'Test', kind: 'Quiz' }, 'Teacher', 'e1', at), /outside/);
});
test('rejects non-finite and out-of-range grades', () => {
  for (const score of [NaN, Infinity, -1, 16]) assert.throws(() => applyDemoAction(INITIAL_DEMO, { type: 'grade', classId: '10A', studentId: 's1', score, reason: '' }, 'Teacher', 'e1', at), /between/);
});
test('assignments remain scoped to the selected class', () => {
  const next = applyDemoAction(INITIAL_DEMO, { type: 'task', classId: '9D', title: '  Algebra  ', kind: 'Homework' }, 'Teacher', 'e1', at);
  assert.equal(next.tasks.at(-1)?.classId, '9D');
  assert.equal(next.tasks.at(-1)?.title, 'Algebra');
  assert.equal(next.events[0].classId, '9D');
});
test('wellness review cannot repeat or cross class boundaries', () => {
  const next = applyDemoAction(INITIAL_DEMO, { type: 'resolve', classId: '10A', studentId: 's2' }, 'Teacher', 'e1', at);
  assert.throws(() => applyDemoAction(next, { type: 'resolve', classId: '10A', studentId: 's2' }, 'Teacher', 'e2', at), /already/);
  assert.throws(() => applyDemoAction(next, { type: 'resolve', classId: '10B', studentId: 's2' }, 'Teacher', 'e3', at), /outside/);
});
test('restores valid storage and recovers safely from corrupt storage', () => {
  assert.deepEqual(parseDemo(JSON.stringify(INITIAL_DEMO)), INITIAL_DEMO);
  for (const raw of ['bad json', 'null', '{"version":1}', JSON.stringify({ ...INITIAL_DEMO, grades: [] }), JSON.stringify({ ...INITIAL_DEMO, events: [null] })]) assert.deepEqual(parseDemo(raw), INITIAL_DEMO);
});
test('role guards fail closed, including unknown and missing roles', () => {
  assert.equal(canAccessRole('teacher', 'Teacher'), true);
  for (const role of [null, '', 'admin', 'invalid']) assert.equal(canAccessRole(role, 'Teacher'), false);
});
test('auth timeout rejects stalled work and preserves settled responses', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /timed out/);
  assert.equal(await withTimeout(Promise.resolve('ready'), 100), 'ready');
});
