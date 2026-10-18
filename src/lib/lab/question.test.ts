import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcqCorrect, sanitizeQuestions } from '@/lib/teacher/questions';
import { buildLabQuestion } from './question';

const lens = { engine: 'optics', params: { device: 'convex_lens', f: 10, u: 15, h: 2 }, prediction: 'image-nature' };

test('a lab question is rebuilt from the engine: a forged key, options or working never survive a save', () => {
  const real = buildLabQuestion(lens)!;
  const forged = (real.answer + 1) % real.options.length;
  const { questions, error } = sanitizeQuestions([{
    type: 'short', questionText: '', options: ['A', 'B'], answer: forged, why: 'trust me', marks: 9, lab: { ...lens, extra: 'x' },
  }]);
  assert.equal(error, null);
  const q = questions[0];
  assert.equal(q.type, 'mcq');
  assert.equal(q.marks, 1);
  assert.deepEqual(q.options, real.options);
  assert.equal(q.answer, real.answer);
  assert.equal(q.why, real.why);
  assert.equal(q.questionText, real.prompt, 'no wording given: the engine’s');
  assert.deepEqual(q.lab, { engine: 'optics', params: lens.params, prediction: 'image-nature' }, 'only the set-up is kept');
  assert.ok(mcqCorrect(q, real.answer) && !mcqCorrect(q, forged), 'graded against the engine’s answer');
});

test('the teacher may re-word a lab question, but not its set-up', () => {
  const { questions } = sanitizeQuestions([{ questionText: 'Why is this image real?', lab: lens }]);
  assert.equal(questions[0].questionText, 'Why is this image real?');
});

test('a set-up the simulation refuses rejects the save with the question number', () => {
  const bad = [
    { ...lens, params: { ...lens.params, u: 5000 } },
    { ...lens, engine: 'warp-drive' },
    { ...lens, prediction: 'not-a-question' },
    // The object at the focus forms no image, so "what kind of image" doesn't apply.
    { ...lens, params: { ...lens.params, u: 10 } },
    'optics',
  ];
  for (const lab of bad) {
    const { questions, error } = sanitizeQuestions([{ questionText: 'Ok', type: 'mcq', options: ['a', 'b'], answer: 0 }, { questionText: 'Q', lab }]);
    assert.equal(questions.length, 0);
    assert.match(error ?? '', /^Question 2: that lab set-up/);
  }
});

test('plain questions are untouched by the lab path', () => {
  const { questions, error } = sanitizeQuestions([{ type: 'mcq', questionText: 'Plane mirror focal length?', options: ['0', 'Infinite'], answer: 1 }]);
  assert.equal(error, null);
  assert.equal(questions[0].lab, undefined);
  assert.equal(questions[0].answer, 1);
});
