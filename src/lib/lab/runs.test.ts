import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from './registry';
import { answered, buildRunResults, MAX_HANDS } from './runs';
import { classPredictions, misconceptionBrief } from '@/lib/teacher/misconceptions';

const scene = validateScene({
  engine: 'optics', params: { device: 'convex_lens', f: 10, u: 15, h: 2 }, title: 'Lens',
  predictions: [{ id: 'image-position' }, { id: 'image-nature' }, { id: 'image-size' }], answer: 'hands',
})!;

test('a run keeps what the class did; the question, options and key come from the engine', () => {
  const r = buildRunResults(scene, {
    'image-position': { mode: 'hands', tally: [3, 12, 9999, -4, 'x'], correct: 0, options: ['forged'] },
    'image-nature': { mode: 'class', pick: 1 },
    'image-size': { mode: 'think', tally: [5] },
    'not-in-scene': { mode: 'hands', tally: [1] },
  });
  assert.deepEqual(r.map(x => x.id), ['image-position', 'image-nature', 'image-size']);
  const pos = r[0];
  assert.equal(pos.options.length, pos.tally!.length, 'one count per real option');
  assert.ok(!pos.options.includes('forged'));
  assert.equal(pos.prompt.length > 0, true);
  assert.equal(pos.tally![2] <= MAX_HANDS, true, 'counts are capped');
  assert.ok(pos.tally!.every(n => Number.isInteger(n) && n >= 0), 'bad counts become 0');
  assert.equal(pos.topic, 'Refraction by spherical lenses; images formed by lenses');
  assert.equal(r[1].pick, 1);
  assert.equal(r[2].tally, null, 'think mode stores no counts');
  assert.equal(answered(r[2]), false);
});

test('unknown modes, out-of-range class answers and questions not reached are dropped or emptied', () => {
  const r = buildRunResults(scene, { 'image-position': { mode: 'vote' }, 'image-nature': { mode: 'class', pick: 7 } });
  assert.deepEqual(r.map(x => x.id), ['image-nature']);
  assert.equal(r[0].pick, null);
  assert.equal(answered(r[0]), false);
  assert.deepEqual(buildRunResults(scene, null), []);
});

const run = (cls: string, at: string, answers: Record<string, unknown>) =>
  ({ class: cls, subject: 'Science', updated_at: at, results: buildRunResults(scene, answers) });

test('a wrong option with enough of the hands is class-level evidence, with counts and no names', () => {
  const pos = buildRunResults(scene, { 'image-position': { mode: 'hands', tally: [0, 0, 0, 0, 0] } })[0];
  const wrong = pos.options.findIndex((_, k) => k !== pos.correct);
  const tally = pos.options.map((_, k) => (k === pos.correct ? 20 : k === wrong ? 8 : 1));
  const m = classPredictions([run('Class 10-A', '2026-10-17T10:00:00Z', { 'image-position': { mode: 'hands', tally } })], '10-A', 'science');
  assert.equal(m.length, 1);
  assert.equal(m[0].chosen, pos.options[wrong]);
  assert.equal(m[0].hands, 8);
  assert.equal(m[0].counted, tally.reduce((a, b) => a + b, 0));
  assert.equal(m[0].mode, 'hands');
  assert.ok(!('students' in m[0]));
});

test('a few stray hands, other classes and a later right answer do not count as a misconception', () => {
  const pos = buildRunResults(scene, { 'image-position': { mode: 'hands', tally: [0, 0, 0, 0, 0] } })[0];
  const wrong = pos.options.findIndex((_, k) => k !== pos.correct);
  const stray = pos.options.map((_, k) => (k === pos.correct ? 30 : k === wrong ? 2 : 0));
  assert.equal(classPredictions([run('Class 10-A', '2026-10-17T10:00:00Z', { 'image-position': { mode: 'hands', tally: stray } })], '10-A', 'Science').length, 0);

  const nature = buildRunResults(scene, { 'image-nature': { mode: 'class', pick: 0 } })[0];
  const missed = run('Class 10-A', '2026-10-10T10:00:00Z', { 'image-nature': { mode: 'class', pick: (nature.correct + 1) % nature.options.length } });
  assert.equal(classPredictions([missed], '10-A', 'Science').length, 1, 'a wrong class answer counts');
  assert.equal(classPredictions([missed], '10-B', 'Science').length, 0, 'other sections are not this class');
  const later = run('Class 10-A', '2026-10-17T10:00:00Z', { 'image-nature': { mode: 'class', pick: nature.correct } });
  assert.equal(classPredictions([missed, later], '10-A', 'Science').length, 0, 'the latest run decides');
});

test('the Copilot brief says a class prediction is the whole class, with no student tokens', () => {
  const nature = buildRunResults(scene, { 'image-nature': { mode: 'class', pick: 0 } })[0];
  const r = run('Class 10-A', '2026-10-17T10:00:00Z', { 'image-nature': { mode: 'class', pick: (nature.correct + 1) % nature.options.length } });
  const brief = misconceptionBrief({ wrongOptions: [], weakQuestions: [], stuckTopics: [], classPredictions: classPredictions([r], '10-A', 'Science') }, id => id);
  assert.match(brief, /Live Lab prediction/);
  assert.match(brief, /the class agreed on/);
  assert.doesNotMatch(brief, /\[\[/);
});
