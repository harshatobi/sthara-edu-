import test from 'node:test';
import assert from 'node:assert/strict';
import { change, meanSeries, movers, rankOf, spread, studentTrend, weeksBack } from './masteryTrend';

const NOW = Date.parse('2026-11-07T12:00:00+05:30'); // a Saturday; its week starts Monday 2 Nov
const row = (topic: string, week: string, score: number) => ({ student_id: 's', subject: 'Science', topic_name: topic, week, score });

test('weeks: the last n India Mondays, oldest first, ending this week', () => {
  assert.deepEqual(weeksBack(3, NOW), ['2026-10-19', '2026-10-26', '2026-11-02']);
});

test('trend: a chapter score holds until new evidence moves it; weeks before any evidence are gaps', () => {
  const weeks = weeksBack(4, NOW); // 12 Oct .. 2 Nov
  const t = studentTrend([row('Ch 1 · Light', '2026-10-19', 50), row('light', '2026-11-02', 70), row('Heredity', '2026-10-26', 80.4)], weeks);
  assert.deepEqual(t.chapters.light, [null, 50, 50, 70], 'loose topic names join one chapter');
  assert.deepEqual(t.chapters.heredity, [null, null, 80, 80]);
  assert.deepEqual(t.subject, [null, 50, 65, 75], 'subject = mean of the chapters scored by then');
});

test('change: latest minus n weeks before, null when either side is missing', () => {
  assert.equal(change([40, 45, 50, 55, 62], 4), 22);
  assert.equal(change([null, 45, 50, 55, 62], 4), null);
  assert.equal(change([40, 50, 50, 55, null], 4), null);
});

test('class mean ignores gaps; spread and rank', () => {
  assert.deepEqual(meanSeries([[10, null], [20, 30], [null, null]], 2), [15, 30]);
  assert.deepEqual(spread([90, 10, 50, 70, 30]), { n: 5, avg: 50, min: 10, q1: 30, median: 50, q3: 70, max: 90 });
  assert.equal(spread([]), null);
  assert.equal(rankOf(70, [90, 70, 70, 10]), 2, 'ties share the better rank');
});

test('movers: biggest risers and fallers past the threshold', () => {
  const m = movers([{ id: 'a', change: 12 }, { id: 'b', change: -8 }, { id: 'c', change: 3 }, { id: 'd', change: null }, { id: 'e', change: 20 }]);
  assert.deepEqual(m.up.map(x => x.id), ['e', 'a']);
  assert.deepEqual(m.down.map(x => x.id), ['b']);
});
