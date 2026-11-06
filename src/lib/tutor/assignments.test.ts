import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completes, inCriticalGap, latestScores, planCriticalGaps, type OpenAssignment } from './assignments';

const NOW = Date.parse('2026-11-07T10:00:00Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

test('Critical Gap is 35 to under 50, and needs more than insufficient data', () => {
  assert.equal(inCriticalGap(35, 'provisional'), true);
  assert.equal(inCriticalGap(49.99, 'firm'), true);
  assert.equal(inCriticalGap(50, 'firm'), false);
  assert.equal(inCriticalGap(34.9, 'firm'), false);
  assert.equal(inCriticalGap(40, 'insufficient'), false);
});

test('latest snapshot wins per student, subject and topic (case and spacing ignored)', () => {
  const l = latestScores([
    { student_id: 's1', subject: 'Science', topic_name: 'Light', score: 70, computed_at: ago(5) },
    { student_id: 's1', subject: 'science', topic_name: ' light ', score: '42.5', computed_at: ago(1), confidence_band: 'provisional' },
    { student_id: 's2', subject: 'Science', topic_name: 'Light', score: 30, computed_at: ago(1) },
  ]);
  assert.equal(l.length, 2);
  assert.deepEqual(l.find(x => x.studentId === 's1'), { studentId: 's1', subject: 'science', topic: ' light ', score: 42.5, confidence: 'provisional' });
});

test('assigns new gaps, skips ones already open or cooling down, clears recovered ones', () => {
  const open: OpenAssignment[] = [
    { id: 'a1', studentId: 's1', subject: 'Maths', topic: 'Polynomials', source: 'critical_gap', mode: 'standard' },
    { id: 'a2', studentId: 's1', subject: 'Maths', topic: 'Real Numbers', source: 'critical_gap', mode: 'standard' },
    { id: 'a3', studentId: 's1', subject: 'Maths', topic: 'Circles', source: 'teacher', mode: 'standard' },
  ];
  const plan = planCriticalGaps([
    { studentId: 's1', subject: 'Maths', topic: 'Polynomials', score: 44 }, // still open: nothing
    { studentId: 's1', subject: 'Maths', topic: 'Real Numbers', score: 55 }, // recovered: clear
    { studentId: 's1', subject: 'Maths', topic: 'Circles', score: 41 }, // teacher already assigned: nothing
    { studentId: 's1', subject: 'Maths', topic: 'Triangles', score: 38 }, // new: create
    { studentId: 's1', subject: 'Maths', topic: 'Statistics', score: 40 }, // cooling down: nothing
    { studentId: 's1', subject: 'Maths', topic: 'Probability', score: 20 }, // Severe Need: not this rule
  ], open, [{ studentId: 's1', subject: 'maths', topic: 'statistics', closedAt: ago(2) }, { studentId: 's1', subject: 'Maths', topic: 'Triangles', closedAt: ago(9) }], NOW);
  assert.deepEqual(plan.create.map(c => c.topic), ['Triangles']);
  assert.deepEqual(plan.clear, [{ id: 'a2', score: 55 }]);
});

test('a teacher assignment is never cleared by the score rule', () => {
  const plan = planCriticalGaps([{ studentId: 's1', subject: 'Maths', topic: 'Circles', score: 80 }],
    [{ id: 't1', studentId: 's1', subject: 'Maths', topic: 'Circles', source: 'teacher', mode: 'standard' }], [], NOW);
  assert.deepEqual(plan.clear, []);
});

test('a session completes an assignment only on the same chapter and mode, finished in full', () => {
  const a = { subject: 'Mathematics', topic: 'Real Numbers', mode: 'standard' as const };
  assert.equal(completes(a, { subject: 'mathematics', topic: 'real numbers', mode: 'standard', early: false }), true);
  assert.equal(completes(a, { subject: 'Mathematics', topic: 'Real Numbers', mode: 'standard', early: true }), false);
  assert.equal(completes(a, { subject: 'Mathematics', topic: 'Real Numbers', mode: 'hots', early: false }), false);
  assert.equal(completes(a, { subject: 'Mathematics', topic: 'Polynomials', mode: 'standard', early: false }), false);
});
