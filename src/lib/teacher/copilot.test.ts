import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReply, restoreNames } from './copilot';

test('parseReply keeps valid parts and drops broken ones', () => {
  const r = parseReply({
    say: 'Here you go', suggestions: ['Make it easier', 5],
    ask: [{ id: 'q1', question: 'How many?', options: ['5', '10'] }, { question: 'bad', options: ['only one'] }],
    artifact: { kind: 'questions', purpose: 'quiz', title: 'Cells', questions: [{ type: 'mcq', questionText: 'Unit of life?', options: ['Cell', 'Atom'], answer: 0 }] },
  });
  assert.equal(r.ask.length, 1, 'a question needs at least two options');
  assert.deepEqual(r.suggestions, ['Make it easier']);
  assert.equal(r.artifact?.kind, 'questions');
  assert.equal(parseReply({ artifact: { kind: 'questions', questions: [{ type: 'mcq', questionText: 'x', options: ['a', ''], answer: 0 }] } }).artifact, null, 'invalid question sets are dropped, not posted');
  assert.equal(parseReply({ artifact: { kind: 'lesson', stages: [] } }).artifact, null);
});

test('restoreNames maps student tokens back, deeply, and leaves unknown tokens', () => {
  const names = new Map([['S1', 'Aarav Sharma'], ['S2', 'Diya Reddy']]);
  const out = restoreNames({ say: '[[S1]] and [[S2]] need help; [[S9]] unknown', list: ['[[S2]]'] }, names);
  assert.equal(out.say, 'Aarav Sharma and Diya Reddy need help; [[S9]] unknown');
  assert.deepEqual(out.list, ['Diya Reddy']);
});

test('every Studio type has a sample, and every sample is a valid artifact', async () => {
  const { STUDIO } = await import('./copilot');
  const { SAMPLES } = await import('./copilotSamples');
  for (const t of STUDIO) {
    assert.ok(SAMPLES[t.kind], `missing sample for ${t.kind}`);
    assert.ok(parseReply({ artifact: SAMPLES[t.kind] }).artifact, `sample for ${t.kind} doesn't survive sanitising`);
  }
  const lesson = SAMPLES.lesson;
  assert.ok(lesson.kind === 'lesson' && lesson.stages.reduce((n, s) => n + s.minutes, 0) === lesson.durationMin, 'sample lesson timings add up');
});
