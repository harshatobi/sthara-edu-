import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, type SolverInput, type SolverRequirement } from './solver';
import { gridFor, toSlots } from './solverInput';
import { findClashes } from './engine';
import type { BellSchedule, Room } from './types';

// Monday to Saturday, 8 periods: a break after P3 and lunch after P5 (so P3-P4 and P5-P6 are not back to back).
const P = (seq: number, no: number | null, kind: 'period' | 'break' | 'lunch' = 'period') =>
  ({ seq, label: no ? `P${no}` : kind, kind, period_no: no, starts_at: '08:00', ends_at: '08:40' });
const bells: BellSchedule[] = [{
  id: 'b1', name: 'Regular', wing_id: null, kind: 'regular', weekdays: [1, 2, 3, 4, 5, 6],
  periods: [P(1, 1), P(2, 2), P(3, 3), P(4, null, 'break'), P(5, 4), P(6, 5), P(7, null, 'lunch'), P(8, 6), P(9, 7), P(10, 8)],
} as BellSchedule];
const rooms: Room[] = [
  { id: 'lab', name: 'Science lab', kind: 'lab', capacity: 40, home_class: null, active: true },
  { id: 'ground', name: 'Ground', kind: 'ground', capacity: null, home_class: null, active: true },
  ...['9-A', '9-B', '10-A', '10-B'].map(c => ({ id: `home-${c}`, name: `Room ${c}`, kind: 'classroom' as const, capacity: 40, home_class: `Class ${c}`, active: true })),
];
const SECTIONS = ['Class 9-A', 'Class 9-B', 'Class 10-A', 'Class 10-B'];

function school(): SolverInput {
  const reqs: SolverRequirement[] = [];
  let n = 0;
  const add = (cls: string, subject: string, teacher: string, periods: number, extra: Partial<SolverRequirement> = {}) =>
    reqs.push({ id: `r${n++}`, cls, subject, group: '', teacher, periods, doubles: 0, roomKind: null, roomId: null, maxPerDay: 1, combinedKey: null, ...extra });
  for (const cls of SECTIONS) {
    const nine = cls.includes('9');
    add(cls, 'Mathematics', nine ? 'T1' : 'T2', 7, { maxPerDay: 2 });
    add(cls, 'Science', nine ? 'T3' : 'T4', 6, { doubles: 1, roomKind: 'lab' });
    add(cls, 'English', 'T5', 5);
    add(cls, 'Hindi', 'T6', 5);
    add(cls, 'Social Science', 'T7', 5);
  }
  // PE for 9-A and 9-B together, on the ground.
  add('Class 9-A', 'Physical Education', 'T8', 2, { roomKind: 'ground', combinedKey: 'PE 9' });
  add('Class 9-B', 'Physical Education', 'T8', 2, { roomKind: 'ground', combinedKey: 'PE 9' });
  return {
    sections: SECTIONS.map((cls, i) => ({ cls, classTeacher: ['T1', 'T3', 'T2', 'T4'][i], days: gridFor(cls, { wings: [], bells }) })),
    requirements: reqs,
    rules: [{ person: 'T5', maxPerDay: 4, maxPerWeek: null, maxConsecutive: 3, unavailable: [{ weekday: 6, periods: [] }] }],
    defaults: { maxPerDay: 6, maxConsecutive: 4, classTeacherFirst: true, spread: true },
    rooms: rooms.map(r => ({ id: r.id, kind: r.kind, active: r.active, homeClass: r.home_class })),
    locked: [],
    seed: 7,
    timeLimitMs: 1500,
  };
}

test('grid: days and back-to-back pairs from the bells (no pair across a break or lunch)', () => {
  const g = gridFor('Class 9-A', { wings: [], bells });
  assert.equal(g.length, 6);
  assert.deepEqual(g[0].periods, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(g[0].pairs, [[1, 2], [2, 3], [4, 5], [6, 7], [7, 8]]);
});

test('solver: a clash-free week that follows every hard rule', () => {
  const input = school();
  const r = solve(input);
  assert.deepEqual(r.unplaced, [], JSON.stringify(r.unplaced));
  const slots = toSlots(r.lessons);
  assert.equal(findClashes(slots, rooms).length, 0, 'no clashes');
  // Every requirement gets its periods.
  for (const q of input.requirements) {
    const got = r.lessons.filter(l => l.cls === q.cls && l.subject === q.subject).length;
    assert.equal(got, q.periods, `${q.cls} ${q.subject}`);
  }
  // Science: one double, back to back without a break between, in the lab.
  for (const cls of SECTIONS) {
    const sci = r.lessons.filter(l => l.cls === cls && l.subject === 'Science');
    assert.ok(sci.every(l => l.roomId === 'lab'), `${cls} science in the lab`);
    const byDay = new Map<number, number[]>();
    for (const l of sci) byDay.set(l.weekday, [...(byDay.get(l.weekday) ?? []), l.period].sort((a, b) => a - b));
    const doubles = [...byDay.values()].filter(ps => ps.length === 2);
    assert.equal(doubles.length, 1, `${cls} has one double`);
    assert.ok([[1, 2], [2, 3], [4, 5], [6, 7], [7, 8]].some(([a, b]) => doubles[0][0] === a && doubles[0][1] === b), `${cls} double not across a break: ${doubles[0]}`);
    // At most once a day otherwise (a double counts once).
    assert.ok([...byDay.values()].every(ps => ps.length <= 2));
  }
  // Subjects capped at once a day stay once a day; Mathematics at most twice.
  for (const cls of SECTIONS) for (const subject of ['English', 'Hindi', 'Social Science', 'Mathematics']) {
    const perDay = new Map<number, number>();
    for (const l of r.lessons.filter(x => x.cls === cls && x.subject === subject)) perDay.set(l.weekday, (perDay.get(l.weekday) || 0) + 1);
    assert.ok([...perDay.values()].every(c => c <= (subject === 'Mathematics' ? 2 : 1)), `${cls} ${subject} per day`);
  }
  // The English teacher: never on Saturday, at most 4 a day, at most 3 in a row.
  const t5 = r.lessons.filter(l => l.teacher === 'T5');
  assert.ok(t5.every(l => l.weekday !== 6), 'T5 is off on Saturday');
  for (let d = 1; d <= 5; d++) {
    const ps = [...new Set(t5.filter(l => l.weekday === d).map(l => l.period))].sort((a, b) => a - b);
    assert.ok(ps.length <= 4, `T5 day ${d}: ${ps.length}`);
    let run = 1, best = ps.length ? 1 : 0;
    for (let i = 1; i < ps.length; i++) { run = ps[i] === ps[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
    assert.ok(best <= 3, `T5 in a row on day ${d}: ${best}`);
  }
  // PE is one lesson for 9-A and 9-B together, on the ground, marked combined.
  const pe = r.lessons.filter(l => l.subject === 'Physical Education');
  assert.equal(pe.length, 4);
  assert.ok(pe.every(l => l.combined && l.roomId === 'ground'));
  const cells = (cls: string) => pe.filter(l => l.cls === cls).map(l => `${l.weekday}|${l.period}`).sort();
  assert.deepEqual(cells('Class 9-A'), cells('Class 9-B'));
});

test('solver: the class teacher takes period 1 wherever they can', () => {
  const r = solve(school());
  // 9-A's class teacher (T1, Mathematics 7 a week) can take period 1 on all six days.
  const p1 = r.lessons.filter(l => l.cls === 'Class 9-A' && l.period === 1);
  assert.ok(p1.filter(l => l.teacher === 'T1').length >= 5, `T1 took period 1 on ${p1.filter(l => l.teacher === 'T1').length} days`);
});

test('solver: locked lessons stay put; repair keeps what still fits', () => {
  const first = solve(school());
  const keep = first.lessons.find(l => l.subject === 'Hindi' && l.cls === 'Class 10-B')!;
  const input = { ...school(), locked: [{ ...keep, locked: true }], start: first.lessons.filter(l => l !== keep), seed: 99 };
  const again = solve(input);
  assert.deepEqual(again.unplaced, []);
  assert.ok(again.lessons.some(l => l.locked && l.cls === keep.cls && l.subject === 'Hindi' && l.weekday === keep.weekday && l.period === keep.period), 'the locked lesson is where it was');
  assert.equal(again.lessons.filter(l => l.cls === 'Class 10-B' && l.subject === 'Hindi').length, 5, 'the locked lesson counts towards the five');
  assert.equal(findClashes(toSlots(again.lessons), rooms).length, 0);
});

test('solver: what cannot be placed is reported with a reason', () => {
  const input = school();
  // A teacher off all week except Monday can't fit 5 once-a-day lessons.
  input.rules.push({ person: 'T6', maxPerDay: null, maxPerWeek: null, maxConsecutive: null, unavailable: [2, 3, 4, 5, 6].map(weekday => ({ weekday, periods: [] })) });
  const r = solve({ ...input, timeLimitMs: 400 });
  const hindi = r.unplaced.filter(u => u.subject === 'Hindi');
  assert.equal(hindi.length, 4, 'every section is short of Hindi');
  assert.ok(hindi.every(u => u.periods === 4), 'one Hindi period a section fits (Monday)');
  assert.ok(hindi.every(u => /off|as often as allowed|elsewhere|busy|clashes/.test(u.reason)), hindi.map(u => u.reason).join(' | '));
  assert.equal(findClashes(toSlots(r.lessons), rooms).length, 0, 'still no clashes');
});

test('re-solving: one locked copy of a combined lesson keeps every copy; lessons the sheet lacks are kept, not dropped', async () => {
  const { keptLessons } = await import('./solverInput');
  const pe = (cls: string, locked: boolean) => ({ class: cls, group_label: '', weekday: 1, period_no: 3, subject: 'PE', teacher_id: 'T8', staff_member_id: null, room_id: 'ground', combined: true, locked });
  const art = { class: 'Class 8-A', group_label: '', weekday: 2, period_no: 1, subject: 'Art', teacher_id: 'T9', staff_member_id: null, room_id: null, combined: false, locked: false };
  const maths = { class: 'Class 9-A', group_label: '', weekday: 2, period_no: 2, subject: 'Mathematics', teacher_id: 'T1', staff_member_id: null, room_id: null, combined: false, locked: false };
  const slots = [pe('Class 9-A', true), pe('Class 9-B', false), art, maths];
  const reqs = [{ class: 'Class 9-A', subject: 'PE', group_label: '' }, { class: 'Class 9-B', subject: 'PE', group_label: '' }, { class: 'Class 9-A', subject: 'Mathematics', group_label: '' }];
  const kept = keptLessons(slots, reqs);
  assert.ok(kept.has(slots[0]) && kept.has(slots[1]), 'both copies of the locked combined PE');
  assert.ok(kept.has(art), 'Art has no row on the sheet: kept where it is');
  assert.ok(!kept.has(maths), 'Mathematics is on the sheet and unlocked: free to move');

  // Solving with both PE copies kept places no extra PE (the week's two periods: one kept, one new).
  const input = school();
  const peReqs = input.requirements.filter(r => r.subject === 'Physical Education');
  const r = solve({ ...input, locked: [
    { cls: 'Class 9-A', group: '', subject: 'Physical Education', weekday: 1, period: 3, teacher: 'T8', roomId: 'ground', combined: true, locked: true },
    { cls: 'Class 9-B', group: '', subject: 'Physical Education', weekday: 1, period: 3, teacher: 'T8', roomId: 'ground', combined: true, locked: true },
  ], timeLimitMs: 400 });
  for (const q of peReqs) assert.equal(r.lessons.filter(l => l.cls === q.cls && l.subject === 'Physical Education').length, 2, `${q.cls} PE stays at 2`);
});
