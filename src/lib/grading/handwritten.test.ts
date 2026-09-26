import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, capturePath, gradeOf, gradingPrompt, parseGrade, pathBelongs } from './handwritten';
import type { Question } from '@/lib/teacher/questions';

const Q: Question[] = [
  { type: 'short', questionText: 'Solve x^2 - 5x + 6 = 0', marks: 3, why: 'Factorise (1), roots 2 and 3 (2)' },
  { type: 'short', questionText: 'State the quadratic formula', marks: 2 },
  { type: 'mcq', questionText: 'Discriminant of x^2+1', options: ['0', '-4', '4', '1'], answer: 1, marks: 1 },
];
const meta = { pages: 2, model: 'm', source: 'teacher_capture' as const, capturedBy: 't1', now: new Date('2026-09-26T00:00:00Z') };

test('parseGrade clamps marks, fills missing answers, keeps pages in range', () => {
  const g = parseGrade({
    questions: [
      { q: 1, attempted: true, page: 1, transcription: '(x-2)(x-3)=0 so x=2,3', awarded: 3.3, confidence: 'high', reasoning: 'All points' },
      { q: 2, attempted: true, page: 9, transcription: 'x = -b ± ...', awarded: 7, confidence: 'weird' },
    ],
    legibility: 'medium', summary: 'ok', feedback: 'good', flags: ['Page 3 seems missing', ''],
  }, Q, meta);
  assert.equal(g.questions.length, 3);
  assert.equal(g.questions[0].awarded, 3, 'rounded to half marks and clamped to max');
  assert.equal(g.questions[1].awarded, 2, 'clamped to max');
  assert.equal(g.questions[1].page, null, 'page outside the photographed range is dropped');
  assert.equal(g.questions[1].confidence, 'low', 'unknown confidence is treated as low');
  assert.equal(g.questions[2].attempted, false);
  assert.equal(g.questions[2].confidence, 'low');
  assert.match(g.questions[2].reasoning, /could not find/);
  assert.equal(g.suggestedTotal, 5);
  assert.equal(g.max, 6);
  assert.deepEqual(g.flags, ['Page 3 seems missing']);
  assert.equal(gradeOf(g)?.suggestedTotal, 5);
  assert.equal(gradeOf({ score: 4, questions: [] }), null, 'legacy results are not v2');
});

test('not attempted scores zero even if the model gives marks', () => {
  const g = parseGrade({ questions: [{ q: 1, attempted: false, awarded: 3 }] }, Q.slice(0, 1), meta);
  assert.equal(g.questions[0].awarded, 0);
});

test('work with no typed questions is one answer worth the total marks', () => {
  const g = parseGrade({ questions: [{ q: 1, awarded: 7.5, confidence: 'medium' }] }, [], { ...meta, totalMarks: 10 });
  assert.equal(g.questions.length, 1);
  assert.equal(g.max, 10);
  assert.equal(g.suggestedTotal, 7.5);
});

test('agreement counts the AI marks the teacher kept', () => {
  const g = parseGrade({ questions: [{ q: 1, awarded: 3 }, { q: 2, awarded: 1 }, { q: 3, awarded: 0 }] }, Q, meta);
  assert.deepEqual(agreement(g, [3, 2, 0]), { kept: 2, changed: 1 });
});

test('page paths are bound to school, assignment and student', () => {
  const p = capturePath('s-1', 'a-1', 'u-1', 2, 1790000000000);
  assert.ok(pathBelongs(p, 's-1', 'a-1', 'u-1'));
  assert.ok(!pathBelongs(p, 's-1', 'a-1', 'u-2'), 'another student');
  assert.ok(!pathBelongs('s-1/a-1/u-1/../../x.jpg', 's-1', 'a-1', 'u-1'), 'no traversal');
});

test('the prompt carries marks, marking points and the MCQ key', () => {
  const p = gradingPrompt({ title: 'Quadratics', subject: 'Mathematics', cls: 'Class 10-A', questions: Q, pages: 2, totalMarks: null });
  assert.match(p, /Q1 \(3 marks\)/);
  assert.match(p, /Marking points \/ model answer: Factorise/);
  assert.match(p, /Key: B/);
  assert.match(p, /2 pages/);
});
