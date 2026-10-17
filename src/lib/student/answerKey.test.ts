import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerKeyRelease, mcqKey } from './answerKey';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const past = '2026-10-10', future = '2026-10-30';

test('released when everyone has handed in and every grade is confirmed', () => {
  const r = answerKeyRelease({ roster: ['a', 'b'], submissions: [{ student_id: 'a', teacher_approved: true }, { student_id: 'b', teacher_approved: true }], dueDate: future, now: NOW });
  assert.deepEqual(r, { released: true, reason: 'released' });
});

test('held while any grade is waiting for the teacher, even after the due date', () => {
  const r = answerKeyRelease({ roster: ['a', 'b'], submissions: [{ student_id: 'a', teacher_approved: true }, { student_id: 'b', teacher_approved: null }], dueDate: past, now: NOW });
  assert.equal(r.reason, 'awaiting-review');
});

test('held before the due date while someone has not handed in; released after it', () => {
  const subs = [{ student_id: 'a', teacher_approved: true }];
  assert.equal(answerKeyRelease({ roster: ['a', 'b'], submissions: subs, dueDate: future, now: NOW }).reason, 'not-everyone-in');
  assert.equal(answerKeyRelease({ roster: ['a', 'b'], submissions: subs, dueDate: past, now: NOW }).released, true);
  assert.equal(answerKeyRelease({ roster: ['a', 'b'], submissions: subs, dueDate: null, now: NOW }).released, false);
});

test('submissions from students no longer on the roster do not hold the key', () => {
  const r = answerKeyRelease({ roster: ['a'], submissions: [{ student_id: 'a', teacher_approved: true }, { student_id: 'gone', teacher_approved: null }], dueDate: future, now: NOW });
  assert.equal(r.released, true);
});

test('mcqKey reads numeric and text keys, MCQs only', () => {
  assert.deepEqual(mcqKey([{ type: 'mcq', answer: 2 }, { type: 'short', answer: 1 }, { type: 'mcq', answer: '0' }, { type: 'mcq' }]), { 0: 2, 2: 0 });
});
