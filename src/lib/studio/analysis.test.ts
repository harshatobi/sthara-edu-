import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, proposeRetest, retentionDate, type AMark, type AQuestion } from './analysis';

const q = (key: string, extra: Partial<AQuestion> = {}): AQuestion => ({ key, text: key, marks: 1, topic: null, competency: null, options: null, answer: null, bankId: null, ...extra });
const students = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));

test('facility, full marks and who missed', () => {
  const marks: AMark[] = students.map((s, i) => ({ studentId: s.id, key: 'a', score: i < 7 ? 2 : 0, max: 2, pick: null }));
  const a = analyse([q('a', { marks: 2 })], marks, students);
  assert.equal(a.questions[0].facility, 0.7);
  assert.equal(a.questions[0].full, 7);
  assert.deepEqual(a.questions[0].missed, ['s7', 's8', 's9']);
  assert.equal(a.marked, 10);
});

test('popular wrong option and distractor flag', () => {
  const picks = [1, 1, 1, 1, 1, 2, 2, 2, 0, 3];
  const marks = students.map((s, i) => ({ studentId: s.id, key: 'm', score: picks[i] === 2 ? 1 : 0, max: 1, pick: picks[i] }));
  const r = analyse([q('m', { options: ['a', 'b', 'c', 'd'], answer: 2 })], marks, students).questions[0];
  assert.deepEqual(r.picks, [1, 5, 3, 1]);
  assert.deepEqual(r.popularWrong, { option: 1, count: 5 });
  assert.ok(r.flags.includes('distractor'));
  assert.ok(r.flags.includes('hard'));
});

test('discrimination: a question the weak students get and strong ones miss is flagged reversed', () => {
  // Paper: question 'x' tracks ability; 'r' is the reverse.
  const marks: AMark[] = [];
  students.forEach((s, i) => {
    const strong = i < 5;
    marks.push({ studentId: s.id, key: 'x', score: strong ? 5 : 1, max: 5, pick: null });
    marks.push({ studentId: s.id, key: 'r', score: strong ? 0 : 1, max: 1, pick: null });
  });
  const a = analyse([q('x', { marks: 5 }), q('r')], marks, students);
  assert.ok(a.questions[0].discrimination! > 0.5);
  assert.ok(a.questions[1].flags.includes('reversed'));
});

test('topics and retest proposal: only weak topics, only students who missed them', () => {
  const qs = [q('a', { topic: 'Ohm' }), q('b', { topic: 'Ohm' }), q('c', { topic: 'Power' })];
  const marks: AMark[] = students.flatMap((s, i) => [
    { studentId: s.id, key: 'a', score: i < 4 ? 1 : 0, max: 1, pick: null },
    { studentId: s.id, key: 'b', score: i < 4 ? 1 : 0, max: 1, pick: null },
    { studentId: s.id, key: 'c', score: 1, max: 1, pick: null },
  ]);
  const a = analyse(qs, marks, students);
  assert.equal(a.topics[0].topic, 'Ohm');
  assert.equal(a.topics[0].facility, 0.4);
  const p = proposeRetest(a);
  assert.deepEqual(p.topics, ['Ohm']);
  assert.equal(p.students.length, 6);
  assert.deepEqual(p.students[0].topics, ['Ohm']);
});

test('marks for unknown questions and zero-mark rows are ignored', () => {
  const a = analyse([q('a')], [{ studentId: 's0', key: 'zzz', score: 1, max: 1, pick: null }, { studentId: 's0', key: 'a', score: 0, max: 0, pick: null }], students);
  assert.equal(a.questions[0].n, 0);
  assert.equal(a.questions[0].facility, null);
  assert.equal(a.marked, 0);
});

test('retention date: 17 days on, never a Sunday', () => {
  assert.equal(retentionDate('2026-11-02'), '2026-11-19');
  // 2026-11-05 + 17 = 2026-11-22, a Sunday -> Monday
  assert.equal(retentionDate('2026-11-05'), '2026-11-23');
});

test('retention pick: choice questions on taught topics, not ones already used, spread across topics', async () => {
  const { pickRetention } = await import('./analysis');
  const mk = (id: string, topic: string, qtype = 'mcq', competency = 'apply') => ({ id, topic, qtype, marks: 1, competency, check: { status: 'passed' } });
  const pool = [mk('a1', 'Ohm'), mk('a2', 'Ohm', 'mcq', 'remember_understand'), mk('a3', 'Ohm'), mk('b1', 'Power'), mk('b2', 'Power', 'short'), mk('c1', 'Magnets'), mk('used', 'Power')];
  const got = pickRetention(pool, ['Ohm', 'Power'], new Set(['used']));
  assert.deepEqual(got.map(x => x.id).sort(), ['a1', 'a2', 'a3', 'b1']);
  assert.equal(got[0].topic !== got[1].topic, true);
  assert.deepEqual(pickRetention(pool, ['Magnets'], new Set()), []);
});
