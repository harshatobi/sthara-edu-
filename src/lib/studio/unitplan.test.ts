import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behindBy, periodsFor, planUnit, repace, revisionPlan, teachingPeriods, weekdayOf } from './unitplan';

test('weekday: Monday is 1, Sunday is 7', () => {
  assert.equal(weekdayOf('2026-11-16'), 1);
  assert.equal(weekdayOf('2026-11-22'), 7);
});

test('teaching periods follow the timetable and skip holidays, exam days and taken periods', () => {
  const slots = [{ weekday: 1, period_no: 3 }, { weekday: 3, period_no: 1 }, { weekday: 3, period_no: 5 }];
  const events = [{ kind: 'holiday', starts_on: '2026-11-18', ends_on: '2026-11-18', suspends_classes: true }];
  const p = teachingPeriods('2026-11-16', '2026-11-25', slots, events, new Set(['2026-11-23|3']));
  assert.deepEqual(p, [{ date: '2026-11-16', period: 3 }, { date: '2026-11-25', period: 1 }, { date: '2026-11-25', period: 5 }]);
});

test('periods for a chapter: hours when published, else topics', () => {
  assert.equal(periodsFor({ hours: 10, topics: ['a', 'b', 'c'] }, 40), 15);
  assert.equal(periodsFor({ hours: null, topics: ['a', 'b', 'c', 'd'] }), 7);
});

test('unit plan: every topic taught in order, practice inserted, check last', () => {
  const topics = ['t1', 't2', 't3', 't4'];
  const u = planUnit(topics, 14);
  assert.equal(u.length, 14);
  assert.equal(u[u.length - 1].kind, 'check');
  assert.ok(u.some(x => x.kind === 'practice'));
  const taught = u.filter(x => x.kind === 'teach').flatMap(x => x.topics);
  assert.deepEqual([...new Set(taught)], topics);
  const small = planUnit(['a', 'b', 'c', 'd', 'e'], 3);
  assert.deepEqual(small.map(x => x.kind), ['teach', 'teach', 'check']);
  assert.deepEqual(small.filter(x => x.kind === 'teach').flatMap(x => x.topics), ['a', 'b', 'c', 'd', 'e']);
});

test('repace moves untaught lessons onto the next free periods, in order', () => {
  const lessons = [
    { id: 'a', date: '2026-11-10', period: 2, taught: true },
    { id: 'b', date: '2026-11-11', period: 2, taught: false },
    { id: 'c', date: '2026-11-17', period: 2, taught: false },
  ];
  const periods = [{ date: '2026-11-16', period: 3 }, { date: '2026-11-17', period: 2 }];
  assert.deepEqual(repace(lessons, periods), [{ id: 'b', date: '2026-11-16', period: 3 }]);
  assert.equal(behindBy(lessons, '2026-11-13'), 1);
});

test('revision plan ranks by marks x gap and shares out the periods', () => {
  const r = revisionPlan([
    { chapter: 'Light', marks: 12, score: 40 },
    { chapter: 'Acids', marks: 8, score: 85 },
    { chapter: 'Electricity', marks: 10, score: null },
    { chapter: 'Project', marks: 0, score: 10 },
  ], 10);
  assert.deepEqual(r.map(x => x.chapter), ['Light', 'Electricity', 'Acids']);
  assert.equal(r.reduce((n, x) => n + x.periods, 0), 10);
  assert.ok(r[0].periods > r[2].periods);
  assert.ok(r.every(x => x.periods >= 1));
});
