import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM, courseChapters } from '../curriculum';
import { addDays, autoPace, buildCourse, daysBetween, defaultStages, expectedPct, paceOf, summarize, teachingDays, weekStart } from './course';

test('courseChapters puts Class 9 Science in NCERT order and numbers 1…n', () => {
  const sci = CURRICULUM.find(s => s.class === '9' && s.subject === 'Science')!;
  const chs = courseChapters(sci);
  assert.deepEqual(chs.map(c => c.number), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(chs.map(c => c.seq), chs.map((_, i) => i + 1));
  const sst = CURRICULUM.find(s => s.class === '10' && s.subject === 'Social Science')!;
  assert.equal(courseChapters(sst)[5].seq, 6, 'per-book numbering keeps document order, sequential seq');
});

test('date helpers are timezone-proof calendar math', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(daysBetween('2026-04-01', '2027-02-28'), 333);
  assert.equal(weekStart('2026-09-27'), '2026-09-21', 'Sunday belongs to the week starting Monday');
  assert.equal(teachingDays('2026-09-21', '2026-09-27'), 6);
});

test('autoPace fills the term contiguously, weighted by periods', () => {
  const w = autoPace([{ key: 'a', hours: 10, topics: [] }, { key: 'b', hours: 30, topics: [] }], '2026-04-01', '2026-04-30');
  assert.equal(w[0].plannedStart, '2026-04-01');
  assert.equal(w[1].plannedEnd, '2026-04-30');
  assert.equal(addDays(w[0].plannedEnd, 1), w[1].plannedStart, 'no gaps or overlaps');
  assert.ok(daysBetween(w[1].plannedStart, w[1].plannedEnd) > daysBetween(w[0].plannedStart, w[0].plannedEnd) * 2);
});

test('coverage, pace and summary from saved progress', () => {
  const progress = [
    { chapter_key: 'cell', topic: '', planned_start: '2026-09-01', planned_end: '2026-09-30' },
  ];
  const chapters = buildCourse('Class 9-B', 'Science', progress);
  const cell = chapters.find(c => c.key === 'cell')!;
  assert.equal(cell.pct, 0);
  assert.equal(expectedPct(cell, '2026-09-15'), 50);
  assert.equal(paceOf(cell, '2026-09-15'), 'behind');
  const taught = buildCourse('Class 9-B', 'Science', [...progress, ...cell.topics.slice(0, 4).map(t => ({ chapter_key: 'cell', topic: t.topic, status: 'taught', taught_on: '2026-09-10' }))]);
  const cell2 = taught.find(c => c.key === 'cell')!;
  assert.equal(paceOf(cell2, '2026-09-15'), 'on_track');
  const s = summarize(taught, new Set(), { termStart: '2026-04-01', termEnd: '2027-02-28', periodsPerWeek: 6, periodMinutes: 40, saved: true }, '2026-09-15');
  assert.equal(s.taught, 4);
  assert.equal(s.gapChapters, 1, 'taught but not assessed');
  assert.ok(s.projectedEnd, 'a pace gives a projection');
});

test('default lesson stages add up to the lesson length', () => {
  for (const d of [30, 40, 45, 80]) assert.equal(defaultStages(d).reduce((n, s) => n + s.minutes, 0), d);
});
