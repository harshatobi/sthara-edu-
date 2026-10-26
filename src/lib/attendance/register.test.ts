import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AcademicEvent } from '@/lib/schedule/types';
import { absentStreak, addDay, belowMin, fmtDay, monthCsv, monthDays, parseRollList, recentSchoolDays, schoolDays, tally, type Mark } from './register';

const ev = (o: Partial<AcademicEvent>): AcademicEvent => ({
  id: 'e', title: 'Holiday', kind: 'holiday', starts_on: '2026-10-02', ends_on: '2026-10-02', wing_ids: null, bell_schedule_id: null,
  suspends_classes: true, staff_scope: 'none', starts_at: null, ends_at: null, notes: null, ...o,
});
const cal = { workingDays: [1, 2, 3, 4, 5, 6], events: [ev({ title: 'Gandhi Jayanti' })], wingId: null };

test('school days: Sundays, non-teaching weekdays and holidays are off', () => {
  // 2026-10-02 is a Friday (holiday), 10-04 a Sunday.
  const d = schoolDays(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], cal);
  assert.deepEqual(d.map(x => x.off?.why ?? null), [null, 'holiday', null, 'weekend']);
  assert.equal(d[1].off?.label, 'Gandhi Jayanti');
  const fiveDay = schoolDays(['2026-10-03'], { ...cal, workingDays: [1, 2, 3, 4, 5] });
  assert.equal(fiveDay[0].off?.why, 'weekend');
});

test('school days: a wing-only holiday applies to that wing alone', () => {
  const events = [ev({ wing_ids: ['w-pri'], title: 'Primary sports day', starts_on: '2026-10-05', ends_on: '2026-10-05' })];
  assert.equal(schoolDays(['2026-10-05'], { workingDays: [1, 2, 3, 4, 5, 6], events, wingId: 'w-pri' })[0].off?.why, 'holiday');
  assert.equal(schoolDays(['2026-10-05'], { workingDays: [1, 2, 3, 4, 5, 6], events, wingId: 'w-sen' })[0].off, null);
  // An event that doesn't suspend classes (an exam) is still a school day.
  assert.equal(schoolDays(['2026-10-05'], { workingDays: [1, 2, 3, 4, 5, 6], events: [ev({ starts_on: '2026-10-05', ends_on: '2026-10-05', suspends_classes: false })], wingId: null })[0].off, null);
});

test('recent school days skip the off days, newest first', () => {
  const d = recentSchoolDays('2026-10-05', 3, 10, cal);
  assert.deepEqual(d.map(x => x.date), ['2026-10-05', '2026-10-03', '2026-10-01']);
});

test('tally and percentage: present + late over days marked; unmarked days are left out', () => {
  const m: Record<string, Mark> = { a: 'present', b: 'late', c: 'absent', d: 'excused' };
  const t = tally(m);
  assert.deepEqual({ ...t }, { present: 1, absent: 1, late: 1, excused: 1, marked: 4, pct: 50 });
  assert.equal(belowMin(t), true);
  assert.equal(tally({}).pct, null);
  assert.equal(belowMin(tally({})), false);
  assert.equal(tally(m, ['a', 'b', 'z']).pct, 100);
});

test('absence streak counts back from the day over marked days', () => {
  const m: Record<string, Mark> = { '2026-10-01': 'present', '2026-10-03': 'absent', '2026-10-05': 'absent', '2026-10-06': 'present' };
  assert.equal(absentStreak(m, '2026-10-05'), 2);
  assert.equal(absentStreak(m, '2026-10-06'), 0);
});

test('roll list: numbers, ranges, prefixed roll numbers and typos', () => {
  const roster = [{ id: 'a', rollNo: '1' }, { id: 'b', rollNo: '2' }, { id: 'c', rollNo: '3' }, { id: 'd', rollNo: '9A-07' }, { id: 'e', rollNo: '' }];
  assert.deepEqual(parseRollList('1, 3', roster), { ids: ['a', 'c'], unknown: [] });
  assert.deepEqual(parseRollList('1-3', roster).ids, ['a', 'b', 'c']);
  assert.deepEqual(parseRollList('3 to 1', roster).ids, ['a', 'b', 'c']);
  assert.deepEqual(parseRollList('1 - 3', roster), { ids: ['a', 'b', 'c'], unknown: [] });
  assert.deepEqual(parseRollList('1 -3, 9a - 07', roster).ids, ['a', 'b', 'c', 'd']);
  assert.deepEqual(parseRollList('7', roster).ids, ['d']);
  assert.deepEqual(parseRollList('9a-07', roster).ids, ['d']);
  assert.deepEqual(parseRollList('2, 44', roster), { ids: ['b'], unknown: ['44'] });
  assert.deepEqual(parseRollList('   ', roster), { ids: [], unknown: [] });
});

test('month sheet CSV: one column per day, holidays as H, totals at the end', () => {
  const days = schoolDays(monthDays('2026-10-01').slice(0, 3), cal);
  const csv = monthCsv('2026-10', days, [{ id: 's', rollNo: '1', name: 'Asha' }], { s: { '2026-10-01': 'present', '2026-10-03': 'absent' } });
  assert.deepEqual(csv[1].slice(0, 5), ['Roll', 'Name', '01', '02', '03']);
  assert.deepEqual(csv[2], ['1', 'Asha', 'P', 'H', 'A', 1, 0, 1, 0, 2, 50]);
  assert.equal(monthDays('2026-02').length, 28);
});

test('weekly trend: pooled by Monday weeks, empty weeks are gaps, delta compares recent weeks', async () => {
  const { weeklyTrend, trendDelta } = await import('./register');
  // 2026-09-28 is a Monday.
  const a: Record<string, Mark> = { '2026-09-28': 'present', '2026-09-29': 'absent', '2026-10-12': 'late' };
  const b: Record<string, Mark> = { '2026-09-28': 'present', '2026-09-30': 'present' };
  const t = weeklyTrend([a, b], '2026-09-30', '2026-10-13');
  assert.deepEqual(t.map(p => [p.week, p.pct, p.marked]), [['2026-09-28', 75, 4], ['2026-10-05', null, 0], ['2026-10-12', 100, 1]]);
  const pts = [90, 90, 90, 70, 70, 70].map((pct, i) => ({ week: String(i), pct, marked: 5 }));
  assert.equal(trendDelta(pts), -20);
  assert.equal(trendDelta(pts.slice(0, 4)), null);
});

test('fmtDay: matches toLocaleDateString in UTC, cached per option set', () => {
  for (const o of [{ weekday: 'short', day: 'numeric', month: 'short' }, { weekday: 'narrow' }, { day: 'numeric', month: 'short' }] as Intl.DateTimeFormatOptions[]) {
    for (const d of ['2026-04-01', '2026-10-26', '2027-03-31']) {
      assert.equal(fmtDay(d, o), new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' }));
    }
  }
});

test('absent streak: prior streak + 1 equals the streak with the day marked absent', () => {
  const h: Record<string, Mark> = { '2026-10-20': 'present', '2026-10-21': 'absent', '2026-10-22': 'absent', '2026-10-24': 'late' };
  for (const day of ['2026-10-23', '2026-10-24', '2026-10-21']) {
    assert.equal(absentStreak({ ...h, [day]: 'absent' }, day), absentStreak(h, addDay(day, -1)) + 1);
  }
});
