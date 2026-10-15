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

test('a Live Lab demo passes only when the engine accepts every value; answers never come from the model', () => {
  const ok = parseReply({ artifact: { kind: 'lab', engine: 'optics', params: { device: 'convex_lens', f: 10, u: 15 }, title: 'Image by a lens', predictions: ['image-distance', 'made-up'], narration: 'Watch the screen.' } });
  assert.equal(ok.artifact?.kind, 'lab');
  if (ok.artifact?.kind === 'lab') {
    assert.deepEqual(ok.artifact.scene.predictions.map(p => p.id), ['image-distance'], 'unknown question ids are dropped');
    assert.equal(ok.artifact.scene.answer, 'hands');
  }
  assert.equal(parseReply({ artifact: { kind: 'lab', engine: 'optics', params: { f: 500 } } }).artifact, null, 'out of range: no demo');
  assert.equal(parseReply({ artifact: { kind: 'lab', engine: 'cold-fusion', params: {} } }).artifact, null, 'unknown engine: no demo');
  // The nested shape the model sees in the conversation history is accepted too.
  const nested = parseReply({ artifact: { kind: 'lab', title: 'Again', scene: { engine: 'sound', params: { f: 880 }, predictions: [{ id: 'wavelength' }] } } });
  assert.equal(nested.artifact?.kind === 'lab' && nested.artifact.scene.params.f, 880);
});

test('a lesson bundle keeps its valid parts, drops broken ones, and never nests', () => {
  const lesson = { kind: 'lesson', title: 'Ohm’s law', stages: [{ name: 'Hook', minutes: 5 }, { name: 'Explore', minutes: 30 }] };
  const exit = { kind: 'questions', purpose: 'exit_tickets', title: 'Exit', questions: [{ type: 'mcq', questionText: 'R = ?', options: ['V/I', 'VI'], answer: 0 }] };
  const lab = { kind: 'lab', engine: 'circuits', params: { v: 12 }, title: 'Demo' };
  const r = parseReply({ artifact: { kind: 'bundle', title: 'Period 3', parts: [lesson, lab, exit, { kind: 'lab', engine: 'circuits', params: { v: 99 } }, { kind: 'bundle', parts: [lesson, exit] }] } });
  assert.equal(r.artifact?.kind, 'bundle');
  if (r.artifact?.kind === 'bundle') assert.deepEqual(r.artifact.parts.map(p => p.kind), ['lesson', 'lab', 'questions'], 'out-of-range demo and nested bundle dropped');
  const one = parseReply({ artifact: { kind: 'bundle', title: 'x', parts: [lesson, { kind: 'rubric', criteria: [] }] } });
  assert.equal(one.artifact?.kind, 'lesson', 'a bundle left with one part becomes that part');
});
