import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentOf, checkAssessmentRules, checkScore, DEFAULT_ASSESSMENT, meritList, meritOf, openSlots } from './merit';

test('assessment rules: defaults, the school’s own, and what is refused', () => {
  assert.deepEqual(assessmentOf(null), DEFAULT_ASSESSMENT);
  assert.deepEqual(assessmentOf({ admissions: { assessment: { maxScore: 50, familyBooking: true, siblingPoints: 5, staffPoints: 'x' } } }),
    { maxScore: 50, familyBooking: true, siblingPoints: 5, staffPoints: 0 });
  assert.ok('error' in checkAssessmentRules({ maxScore: 0 }));
  assert.ok('error' in checkAssessmentRules({ maxScore: 50, siblingPoints: 60 }), 'points above the highest score');
  const ok = checkAssessmentRules({ maxScore: '100', siblingPoints: '2.5', staffPoints: '' });
  assert.ok('value' in ok && ok.value.siblingPoints === 2.5 && ok.value.staffPoints === 0);
  assert.deepEqual(checkScore('', 100), { value: null });
  assert.deepEqual(checkScore('72.456', 100), { value: 72.46 });
  assert.ok('error' in checkScore(101, 100));
  assert.ok('error' in checkScore(-1, 100));
});

test('merit: score plus sibling and staff points, highest first, earlier application on a tie', () => {
  const r = { ...DEFAULT_ASSESSMENT, siblingPoints: 5, staffPoints: 3 };
  assert.equal(meritOf({ score: 70, sibling: true, staff: true }, r), 78);
  assert.equal(meritOf({ score: null, sibling: true, staff: false }, r), null, 'no score, no merit');
  const a = (id: string, score: number | null, appliedOn: string, sibling = false, staff = false) => ({ id, name: id, score, sibling, staff, appliedOn, createdAt: `${appliedOn}T00:00:00Z` });
  const list = meritList([a('low', 60, '2026-11-01'), a('sib', 76, '2026-11-03', true), a('top', 80, '2026-11-02'), a('tieLate', 80, '2026-11-05'), a('none', null, '2026-10-30'), a('twin', 80, '2026-11-02')], r);
  assert.deepEqual(list.map(l => l.id), ['sib', 'top', 'twin', 'tieLate', 'low', 'none']);
  assert.deepEqual(list.map(l => l.rank), [1, 2, 2, 4, 5, null], 'same merit and date share a rank');
  assert.equal(list[0].bonus, 5);
});

test('open slots: for the class, ahead, not cancelled, not full', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const s = (id: string, grade: number | null, at: string, booked = 0, cancelled: string | null = null) => ({ id, grade, starts_at: at, minutes: 60, capacity: 2, booked, cancelled_at: cancelled });
  const got = openSlots([s('later', null, '2026-11-09T04:30:00Z'), s('past', 1, '2026-10-30T04:30:00Z'), s('full', 1, '2026-11-05T04:30:00Z', 2),
    s('other', 2, '2026-11-05T04:30:00Z'), s('gone', 1, '2026-11-05T04:30:00Z', 0, '2026-10-31'), s('soon', 1, '2026-11-03T04:30:00Z')], 1, now);
  assert.deepEqual(got.map(x => x.id), ['soon', 'later']);
});
