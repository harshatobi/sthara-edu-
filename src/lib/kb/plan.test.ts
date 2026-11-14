import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemCount, MARK_COLUMNS } from '@/lib/studio/blueprint';
import { COMPETENCIES } from '@/lib/studio/types';
import { apportion, asDifficulty, asKind, blueprintFor, chaptersNamed } from './plan';

const cells = (bp: ReturnType<typeof blueprintFor>) => COMPETENCIES.flatMap(c => MARK_COLUMNS.map(m => [c, m, bp.cells[c][m]] as const)).filter(x => x[2] > 0);

test('apportion splits exactly', () => {
  assert.deepEqual([...apportion(10, { a: 0.4, b: 0.35, c: 0.25 })].map(x => x[1]).reduce((s, v) => s + v, 0), 10);
  assert.deepEqual(Object.fromEntries(apportion(3, { x: 1, y: 1, z: 1 })), { x: 1, y: 1, z: 1 });
});

test('a quiz is all 1-mark choice questions, spread over thinking levels', () => {
  const bp = blueprintFor(10, 'mcq', 'medium');
  assert.equal(itemCount(bp), 10);
  assert.ok(cells(bp).every(([, m]) => m === 1));
  assert.deepEqual(cells(bp).map(([c, , n]) => [c, n]), [['remember_understand', 4], ['apply', 4], ['analyse_evaluate', 2]]);
});

test('easy has no analyse questions; long answers are 5 marks; mixed spans marks', () => {
  assert.ok(cells(blueprintFor(8, 'mixed', 'easy')).every(([c]) => c !== 'analyse_evaluate'));
  assert.ok(cells(blueprintFor(3, 'long', 'hard')).every(([, m]) => m === 5));
  const mixed = cells(blueprintFor(20, 'mixed', 'mixed'));
  assert.deepEqual([...new Set(mixed.map(([, m]) => m))].sort(), [1, 2, 3, 5]);
  assert.equal(itemCount(blueprintFor(99, 'mixed', 'mixed')), 30, 'capped at 30');
});

test('kinds and difficulties from each generator', () => {
  assert.deepEqual(['mcq', 'saq', 'laq', 'mixed', 'short', 'long', 'x'].map(asKind), ['mcq', 'short', 'long', 'mixed', 'short', 'long', 'mixed']);
  assert.deepEqual(['Easy', 'hard', 'mixed', undefined].map(asDifficulty), ['easy', 'hard', 'mixed', 'mixed']);
});

test('topics are matched to curriculum chapters', () => {
  const chapters = [
    { name: 'The Fundamental Unit of Life', topics: ['Cell membrane', 'Cell organelles', 'Plastids'] },
    { name: 'Tissues', topics: ['Plant tissues', 'Animal tissues'] },
    { name: 'Motion', topics: ['Distance and displacement', 'Velocity'] },
  ];
  const r = chaptersNamed(['fundamental unit of life', 'Tissues', 'cell organelles and plastids', 'photosynthesis'], chapters);
  assert.deepEqual(r.matched, ['The Fundamental Unit of Life', 'Tissues']);
  assert.deepEqual(r.unmatched, ['photosynthesis']);
});
