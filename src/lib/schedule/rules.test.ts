import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, type SolverInput, type SolverRequirement } from './solver';
import { gridFor, toSlots } from './solverInput';
import { precheck } from './precheck';
import { timetableQuality } from './quality';
import { changedLessons, moveOptions, swapped } from './moves';
import { findClashes, periodClock } from './engine';
import type { BellSchedule, Room, Slot } from './types';

// Monday to Friday, 6 periods on the clock, a break after P3.
let at = 8 * 60;
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const P = (seq: number, no: number | null, len = 40) => { const a = at; at += len; return { seq, label: no ? `P${no}` : 'Break', kind: no ? 'period' as const : 'break' as const, period_no: no, starts_at: hm(a), ends_at: hm(at) }; };
const bells: BellSchedule[] = [{ id: 'b', name: 'Regular', wing_id: null, kind: 'regular', weekdays: [1, 2, 3, 4, 5], periods: [P(1, 1), P(2, 2), P(3, 3), P(4, null, 20), P(5, 4), P(6, 5), P(7, 6)] }];
const rooms: Room[] = ['7-A', '7-B'].map(c => ({ id: `h${c}`, name: `Room ${c}`, kind: 'classroom' as const, capacity: 40, home_class: `Class ${c}`, active: true }));
const req = (id: string, cls: string, subject: string, teacher: string, periods: number, extra: Partial<SolverRequirement> = {}): SolverRequirement =>
  ({ id, cls, subject, group: '', teacher, periods, doubles: 0, roomKind: null, roomId: null, maxPerDay: 1, combinedKey: null, ...extra });
const input = (requirements: SolverRequirement[], extra: Partial<SolverInput> = {}): SolverInput => ({
  sections: ['Class 7-A', 'Class 7-B'].map(cls => ({ cls, classTeacher: null, days: gridFor(cls, { wings: [], bells }) })),
  requirements, rules: [], defaults: { maxPerDay: 6, maxConsecutive: 6, classTeacherFirst: false, spread: true },
  rooms: rooms.map(r => ({ id: r.id, kind: r.kind, active: r.active, homeClass: r.home_class })), locked: [], seed: 3, timeLimitMs: 600, ...extra,
});

test('solver: a subject that may never be last is never in the last period', () => {
  const r = solve(input([req('a', 'Class 7-A', 'Art', 'T1', 5, { neverLast: true }), req('m', 'Class 7-A', 'Mathematics', 'T2', 5), req('e', 'Class 7-A', 'English', 'T3', 5)]));
  assert.deepEqual(r.unplaced, []);
  assert.equal(r.lessons.filter(l => l.subject === 'Art' && l.period === 6).length, 0);
  assert.equal(r.engine, 'local');
});

test('solver: a teacher is in school on no more days than their cap', () => {
  const r = solve(input([req('m', 'Class 7-A', 'Music', 'V', 3, { maxPerDay: 2 }), req('n', 'Class 7-B', 'Music', 'V', 3, { maxPerDay: 2 })], {
    rules: [{ person: 'V', maxPerDay: null, maxPerWeek: null, maxConsecutive: null, unavailable: [], maxDays: 2 }],
  }));
  assert.deepEqual(r.unplaced, []);
  assert.ok(new Set(r.lessons.map(l => l.weekday)).size <= 2);
});

test('solver: a morning subject lands in the first half of the day when it can', () => {
  const r = solve(input([req('m', 'Class 7-A', 'Mathematics', 'T2', 5, { timePref: 'morning' }), req('e', 'Class 7-A', 'English', 'T3', 5)], { timeLimitMs: 900 }));
  assert.ok(r.lessons.filter(l => l.subject === 'Mathematics').every(l => l.period <= 3), JSON.stringify(r.lessons.filter(l => l.subject === 'Mathematics')));
  assert.equal(timetableQuality(input([req('m', 'Class 7-A', 'Mathematics', 'T2', 5, { timePref: 'morning' })]), r).prefsMissed, 0);
});

test('precheck: an overfull section, an overloaded teacher, a missing lab, and too few days', () => {
  const f = precheck(input([
    req('a', 'Class 7-A', 'Mathematics', 'T1', 20, { maxPerDay: 4 }), req('b', 'Class 7-A', 'English', 'T2', 14, { maxPerDay: 4 }),
    req('c', 'Class 7-B', 'Mathematics', 'T1', 15, { maxPerDay: 3 }),
    req('d', 'Class 7-B', 'Science', 'T3', 4, { roomKind: 'lab' }),
    req('e', 'Class 7-B', 'Hindi', 'T4', 7),
  ], { rules: [{ person: 'T1', maxPerDay: 6, maxPerWeek: 30, maxConsecutive: null, unavailable: [] }] }), new Map([['T1', 'Asha Rao']]));
  const titles = f.map(x => x.title);
  assert.ok(titles.includes('Class 7-A is asked for more periods than its week has'));
  assert.ok(titles.includes('Asha Rao is asked for more periods than they can teach'));
  assert.ok(titles.includes('No lab is set up'));
  assert.ok(titles.includes("Class 7-B Hindi can't fit its days"));
  assert.equal(f.find(x => x.about.kind === 'teacher')!.short, 5);   // 35 asked, 30 a week
  assert.ok(f.every((x, i) => i === 0 || x.level !== 'block' || f[i - 1].level === 'block'), 'blockers first');
});

test('precheck: a clean sheet has nothing to say, and times off count', () => {
  const clean = [req('a', 'Class 7-A', 'Mathematics', 'T1', 5), req('b', 'Class 7-B', 'Mathematics', 'T1', 5)];
  assert.deepEqual(precheck(input(clean)), []);
  // Off three whole days: 2 days x 6 periods = 12 reachable, 10 asked: fine. Off four: 6 reachable.
  const off = (days: number[]) => [{ person: 'T1', maxPerDay: null, maxPerWeek: null, maxConsecutive: null, unavailable: days.map(weekday => ({ weekday, periods: [] })) }];
  assert.deepEqual(precheck(input(clean, { rules: off([1, 2, 3]) })), []);
  assert.equal(precheck(input(clean, { rules: off([1, 2, 3, 4]) }))[0].short, 4);
});

test('quality: gaps, bunching and who opens the day', () => {
  const inp = input([req('m', 'Class 7-A', 'Mathematics', 'T1', 2), req('e', 'Class 7-A', 'English', 'T2', 1)]);
  inp.sections[0].classTeacher = 'T1';
  const lesson = (subject: string, teacher: string, weekday: number, period: number) => ({ cls: 'Class 7-A', group: '', subject, weekday, period, teacher, roomId: null, combined: false });
  // Mathematics twice on Monday with a hole between (a teacher gap and a student gap), nothing else all week.
  const q = timetableQuality(inp, { lessons: [lesson('Mathematics', 'T1', 1, 1), lesson('Mathematics', 'T1', 1, 3), lesson('English', 'T2', 2, 2)], unplaced: [] });
  assert.equal(q.teacherGaps, 1);
  assert.equal(q.bunched, 1);
  assert.deepEqual(q.classTeacherFirst, { met: 1, of: 5 });
  assert.equal(q.studentGaps, 2);          // Monday P2, Tuesday P1
  const better = timetableQuality(inp, { lessons: [lesson('Mathematics', 'T1', 1, 1), lesson('Mathematics', 'T1', 2, 1), lesson('English', 'T2', 1, 2)], unplaced: [] });
  assert.ok(better.cost < q.cost);
});

test('moves: free, swap and blocked periods, and what a swap changes', () => {
  const slot = (cls: string, subject: string, teacher: string, weekday: number, period_no: number, extra: Partial<Slot> = {}): Slot =>
    ({ class: cls, group_label: '', weekday, period_no, subject, teacher_id: teacher, room_id: null, combined: false, ...extra });
  const slots = [slot('Class 7-A', 'Mathematics', 'T1', 1, 1), slot('Class 7-A', 'English', 'T2', 1, 2), slot('Class 7-B', 'Mathematics', 'T1', 1, 3), slot('Class 7-B', 'English', 'T2', 1, 1)];
  const cells = [1, 2, 3, 4].map(period_no => ({ weekday: 1, period_no }));
  const o = moveOptions('Class 7-A', { weekday: 1, period_no: 1 }, slots, cells, rooms, periodClock({ wings: [], bells }), new Map([['T1', 'Asha Rao']]));
  assert.equal(o.get('1|1')!.mark, 'pick');
  assert.equal(o.get('1|4')!.mark, 'can');
  assert.equal(o.get('1|3')!.mark, 'cant');                 // T1 is with 7-B then
  assert.match(o.get('1|3')!.why!, /Asha Rao is teaching Class 7-B/);
  assert.equal(o.get('1|2')!.mark, 'cant');                 // swapping would put T2 in 7-A P1 against 7-B P1
  const { next } = swapped('Class 7-A', { weekday: 1, period_no: 1 }, { weekday: 1, period_no: 4 }, slots);
  assert.equal(findClashes(next, rooms, periodClock({ wings: [], bells })).length, 0);
  assert.equal(changedLessons(slots, next).length, 1);
  assert.equal(toSlots([]).length, 0);
});
