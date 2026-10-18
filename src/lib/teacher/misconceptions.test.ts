import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMisconceptions, misconceptionBrief } from './misconceptions';

const quiz = {
  id: 'a1', title: 'Light quiz', class: 'Class 10-A', subject: 'Science', units: ['Light - Reflection and Refraction'],
  questions: [
    { type: 'mcq', questionText: 'A concave mirror forms a real image when the object is…', options: ['Inside F', 'Beyond F', 'At the pole', 'Anywhere'], answer: 1 },
    { type: 'mcq', questionText: 'Focal length of a plane mirror?', options: ['0', 'Infinite', '1 m', 'Depends'], answer: 1 },
    { type: 'short', questionText: 'Explain refraction.' },
  ],
};
const roster = new Set(['s1', 's2', 's3', 's4', 's5', 's6']);

test('a wrong option chosen by several students is reported with exactly who chose it', () => {
  const subs = [
    { assignment_id: 'a1', student_id: 's1', answers: { 0: 0, 1: 1 }, ai_result: null },
    { assignment_id: 'a1', student_id: 's2', answers: { 0: 0, 1: 1 }, ai_result: null },
    { assignment_id: 'a1', student_id: 's3', answers: { 0: 0, 1: 0 }, ai_result: null },
    { assignment_id: 'a1', student_id: 's4', answers: { 0: 1, 1: 1 }, ai_result: null },
    { assignment_id: 'a1', student_id: 's5', answers: {}, ai_result: null },
    { assignment_id: 'a1', student_id: 'outsider', answers: { 0: 0 }, ai_result: null },
  ];
  const m = findMisconceptions({ cls: '10-A', subject: 'science', roster, assignments: [quiz], submissions: subs, tutor: [] });
  assert.equal(m.wrongOptions.length, 1, 'Q2 has only one wrong pick: not a shared misconception');
  const w = m.wrongOptions[0];
  assert.equal(w.q, 1); assert.equal(w.chosen, 'Inside F'); assert.equal(w.correct, 'Beyond F');
  assert.deepEqual(w.students, ['s1', 's2', 's3']); assert.equal(w.answered, 4, 'empty answers and other classes are not counted');
});

test('photographed work: a question most students lost marks on, with the grader notes', () => {
  const graded = (id: string, got: number, toFix: string) => ({ assignment_id: 'a1', student_id: id, answers: {}, ai_result: { questions: [{ index: 2, max: 3, awarded: got, toFix }] } });
  const m = findMisconceptions({
    cls: '10-A', subject: 'Science', roster, assignments: [quiz], tutor: [],
    submissions: [graded('s1', 1, 'Mixed up refraction with reflection.'), graded('s2', 0, 'Said light speeds up in glass.'), graded('s3', 3, 'No improvements needed for this question.')],
  });
  assert.equal(m.weakQuestions.length, 1);
  assert.equal(m.weakQuestions[0].q, 3); assert.equal(m.weakQuestions[0].avgPct, 44);
  assert.deepEqual(m.weakQuestions[0].notes, ['Mixed up refraction with reflection.', 'Said light speeds up in glass.']);
});

test('tutor: chapters where students needed the answer revealed or the deepest hints', () => {
  const t = (id: string, depth: number, revealed: boolean, topic = 'Electricity') => ({ student_id: id, subject: 'Science', topic, micro_topic: null, hint_depth: depth, answer_revealed: revealed });
  const m = findMisconceptions({
    cls: '10-A', subject: 'Science', roster, assignments: [], submissions: [],
    tutor: [t('s1', 4, true), t('s2', 3, false), t('s3', 1, false), t('s4', 4, true, 'Sound'), { ...t('s5', 4, true), subject: 'Maths' }],
  });
  assert.deepEqual(m.stuckTopics.map(x => x.topic), ['Electricity'], 'one student alone, a light hint, or another subject is not a pattern');
  assert.equal(m.stuckTopics[0].revealed, 1); assert.equal(m.stuckTopics[0].deepHints, 2);
});

test('the brief names students only by token, and is empty when nothing stands out', () => {
  const m = findMisconceptions({
    cls: '10-A', subject: 'Science', roster, assignments: [quiz], tutor: [],
    submissions: ['s1', 's2'].map(id => ({ assignment_id: 'a1', student_id: id, answers: { 0: 0 }, ai_result: null })),
  });
  const brief = misconceptionBrief(m, id => `S${id.slice(1)}`);
  assert.match(brief, /2 of 2 chose "Inside F": \[\[S1\]\] \[\[S2\]\]/);
  assert.equal(misconceptionBrief({ wrongOptions: [], weakQuestions: [], stuckTopics: [], classPredictions: [] }, id => id), '');
});
