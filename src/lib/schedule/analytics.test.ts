import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffLoad } from './analytics';
import { DEFAULT_SOLVER_SETTINGS, suggestRequirements } from './solverInput';
import type { BellSchedule, Cover, ScheduleRows, Slot } from './types';

const P = (no: number, s: string, e: string) => ({ seq: no, label: `P${no}`, kind: 'period' as const, period_no: no, starts_at: s, ends_at: e });
const bells: BellSchedule[] = [{
  id: 'b', name: 'Regular', wing_id: null, kind: 'regular', weekdays: [1, 2, 3, 4, 5],
  periods: [P(1, '08:20', '09:00'), P(2, '09:00', '09:40'), P(3, '09:40', '10:20'), P(4, '10:20', '11:00')],
}];
let n = 0;
const slot = (o: Partial<Slot>): Slot => ({ id: `sl${++n}`, version_id: 'v', class: 'Class 10-A', group_label: '', weekday: 1, period_no: 1, subject: 'Mathematics', teacher_id: 'maths', room_id: null, combined: false, staff_member_id: null, ...o });

function rows(over: Partial<ScheduleRows> = {}): ScheduleRows {
  n = 0;
  const slots: Slot[] = [];
  // Priya: Mathematics, 4 periods a day Monday to Friday (20 a week). Esha: English, 1 a day (5 a week).
  for (let d = 1; d <= 5; d++) {
    for (let p = 1; p <= 4; p++) slots.push(slot({ weekday: d, period_no: p, class: p % 2 ? 'Class 10-A' : 'Class 9-B' }));
    slots.push(slot({ weekday: d, period_no: 2, teacher_id: 'eng', subject: 'English', class: 'Class 10-A' }));
  }
  return {
    schoolName: 'T', wings: [], bells, rooms: [], events: [],
    versions: [{ id: 'v', session: '2026-27', name: 'TT', status: 'published', effective_from: '2026-09-01', source: 'manual', notes: null, published_at: '2026-09-01', created_at: '' }],
    slots, staff: [], studentClasses: [],
    people: [
      { id: 'maths', name: 'Priya Maths', role: 'teacher', email: null, assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }] },
      { id: 'eng', name: 'Esha English', role: 'teacher', email: null, assignments: [{ class: 'Class 10-A', subject: 'English' }, { class: 'Class 9-B', subject: 'English' }] },
    ],
    leave: [], absences: [], covers: [], dutyPosts: [], roster: [], duties: [], visits: [], compOffs: [], missing: [],
    ...over,
  };
}

test('load: timetable against target, lessons taught, covers, duties, leave, flags', () => {
  const cover: Cover = {
    id: 'c1', on_date: '2026-10-05', slot_id: 'sl1', class: 'Class 10-A', period_no: 1, subject: 'Mathematics', absent_user_id: 'maths', absent_staff_member_id: null,
    reason: 'absent', status: 'assigned', sub_user_id: 'eng', sub_staff_member_id: null, flag_note: null, flagged_at: null,
  };
  const r = rows({
    absences: [{ id: 'a', user_id: 'maths', staff_member_id: null, on_date: '2026-10-05', kind: 'absent', portion: 'full', period_nos: [], reason: null, status: 'confirmed', source: 'office', created_at: '' }],
    covers: [cover],
    duties: [{ id: 'd', on_date: '2026-10-06', starts_at: '13:00', ends_at: '14:30', kind: 'invigilation', title: 'Hall', user_id: 'eng', staff_member_id: null, event_id: null, notes: null } as unknown as ScheduleRows['duties'][number]],
  });
  const s = staffLoad(r, [{ id: 'x', user_id: 'eng', staff_member_id: null, target_per_week: 20, max_per_day: null, max_per_week: null, max_consecutive: null, unavailable: [] }],
    { ...DEFAULT_SOLVER_SETTINGS, default_target_per_week: 18 }, { from: '2026-10-05', to: '2026-10-11' });
  const priya = s.people.find(p => p.key === 'maths')!, esha = s.people.find(p => p.key === 'eng')!;
  assert.equal(priya.timetable, 20);
  assert.equal(priya.target, 18);
  assert.ok(priya.flags.includes('over'), 'over the school default of 18');
  assert.equal(priya.coveredForThem, 4, 'Monday: her four lessons were covered for or needed cover');
  assert.equal(priya.taught, 16);
  assert.equal(esha.timetable, 5);
  assert.equal(esha.target, 20);
  assert.ok(esha.targetFromRule);
  assert.ok(esha.flags.includes('under'), 'well under her own target of 20');
  assert.equal(esha.covers, 1);
  assert.equal(esha.taught, 5);
  assert.equal(esha.invigilation, 1);
  assert.equal(esha.dutyHours, 1.5);
  assert.equal(esha.perWeek, 6);
  assert.deepEqual(s.departments.map(d => d.name).sort(), ['English', 'Mathematics']);
  assert.equal(s.counts.over, 1);
});

test('suggest: requirements from the timetable (periods, teacher, doubles), then assignments', () => {
  const r = rows();
  const sug = suggestRequirements(r, r.slots.filter(s => s.version_id === 'v'));
  const maths10 = sug.find(x => x.class === 'Class 10-A' && x.subject === 'Mathematics')!;
  assert.equal(maths10.periods_per_week, 10);
  assert.equal(maths10.teacher, 'maths');
  const eng = sug.find(x => x.class === 'Class 10-A' && x.subject === 'English')!;
  assert.equal(eng.periods_per_week, 5);
  // Esha is also assigned English in 9-B, which the timetable doesn't have: suggested with the default.
  const eng9 = sug.find(x => x.class === 'Class 9-B' && x.subject === 'English');
  assert.equal(eng9?.source, 'assignment');
  assert.equal(eng9?.periods_per_week, 5);
});
