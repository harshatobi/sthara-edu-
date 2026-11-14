import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCode, readSheets, scoreSheet, sheetCodes, sheetPrefix } from './sheets';

const A = '7f3c2a10-1b2c-4d5e-8f90-123456789abc';

test('codes: same prefix per assignment, numbered in register order, unambiguous letters', () => {
  const c = sheetCodes(A, ['x', 'y', 'z']);
  assert.equal(c[0].code.split('-')[0], sheetPrefix(A));
  assert.deepEqual(c.map(r => r.code.split('-')[1]), ['1', '2', '3']);
  assert.match(sheetPrefix(A), /^[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(sheetPrefix(A), sheetPrefix('00000000-0000-0000-0000-000000000001'));
  for (const r of c) assert.match(r.code, /^[A-Z0-9]{4}-[0-9]{1,3}$/);
});

test('normCode maps common misreadings back', () => {
  assert.equal(normCode(' kq7j - 04 '), 'KQ7J-4');
  assert.equal(normCode('K07I-12'), 'KQ7J-12');
  assert.equal(normCode('nonsense'), null);
});

test('readSheets: known codes get their student, letters become options, double marks are unclear', () => {
  const codes = new Map([['KQ7J-1', { studentId: 's1', questions: 3, options: [4, 4, 4] }]]);
  const r = readSheets({ sheets: [
    { code: 'KQ7J-1', answers: { 1: 'B', 2: 'AB', 3: null, 4: 'C' } },
    { code: 'ZZZZ-9', answers: { 1: 'A' } },
  ] }, codes);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { code: 'KQ7J-1', studentId: 's1', picks: [1, null, null], unclear: [2] });
  assert.equal(r[1].studentId, null);
});

test('readSheets keeps the better reading of a sheet photographed twice', () => {
  const codes = new Map([['KQ7J-1', { studentId: 's1', questions: 2, options: [4, 4] }]]);
  const r = readSheets({ sheets: [{ code: 'KQ7J-1', answers: { 1: 'A' } }, { code: 'KQ7J-1', answers: { 1: 'A', 2: 'D' } }] }, codes);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].picks, [0, 3]);
});

test('scoreSheet marks choice questions against the key', () => {
  const qs = [{ type: 'mcq', questionText: 'a', options: ['1', '2'], answer: 1, marks: 1 }, { type: 'mcq', questionText: 'b', options: ['1', '2'], answer: 0, marks: 1 }] as any;
  assert.deepEqual(scoreSheet(qs, [1, 1]), { items: [{ question_index: 0, score: 1, max_score: 1 }, { question_index: 1, score: 0, max_score: 1 }], score: 1, max: 2 });
});
