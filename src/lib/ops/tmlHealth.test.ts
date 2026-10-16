import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleTmlStudents } from './tmlHealth';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

test('graded work with no snapshot, or newer than the snapshot, is stale', () => {
  const out = staleTmlStudents(
    [{ student_id: 'a', at: ago(300) }, { student_id: 'b', at: ago(300) }, { student_id: 'c', at: ago(300) }],
    [{ student_id: 'b', computed_at: ago(600) }, { student_id: 'c', computed_at: ago(100) }],
    NOW,
  );
  assert.deepEqual(out.sort(), ['a', 'b']);
});

test('fresh work inside the grace period is not flagged, and missing dates are ignored', () => {
  assert.deepEqual(staleTmlStudents([{ student_id: 'a', at: ago(5) }, { student_id: 'b', at: null }], [], NOW), []);
});
