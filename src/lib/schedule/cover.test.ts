import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busyOn, candidatesFor, fairness, needsOn, regularLessons } from './cover';
import { agenda, findClashes, halfDaySplit, teacherLoad } from './engine';
import { balances, compOffDaysIn, overBalance, showBalance } from '@/lib/admin/leave';
import type { BellSchedule, Cover, ScheduleRows, Slot, StaffMember } from './types';

// A Monday: 2026-10-05. Bells: P1 8:20, P2 9:00, P3 9:40, lunch 10:20, P4 11:00, P5 11:40.
const P = (no: number, s: string, e: string) => ({ seq: no, label: `P${no}`, kind: 'period' as const, period_no: no, starts_at: s, ends_at: e });
const bells: BellSchedule[] = [{
  id: 'b', name: 'Regular', wing_id: null, kind: 'regular', weekdays: [1, 2, 3, 4, 5, 6],
  periods: [P(1, '08:20', '09:00'), P(2, '09:00', '09:40'), P(3, '09:40', '10:20'), { seq: 9, label: 'Lunch', kind: 'lunch', period_no: null, starts_at: '10:20', ends_at: '11:00' }, P(4, '11:00', '11:40'), P(5, '11:40', '12:20')],
}];
let n = 0;
const slot = (o: Partial<Slot>): Slot => ({ id: `sl${++n}`, version_id: 'v', class: 'Class 10-A', group_label: '', weekday: 1, period_no: 1, subject: 'Mathematics', teacher_id: 'maths', room_id: null, combined: false, staff_member_id: null, ...o });
const member = (o: Partial<StaffMember>): StaffMember => ({ id: 'm', user_id: null, name: 'Member', category: 'teaching', designation: '', wing_id: null, phone_e164: null, employee_code: null, joined_on: null, active: true, employment: 'permanent', contract_from: null, contract_to: null, whatsapp_opt_in: false, ...o });

function base(over: Partial<ScheduleRows> = {}): ScheduleRows {
  n = 0;
  return {
    schoolName: 'Test', wings: [], bells, rooms: [], events: [],
    versions: [{ id: 'v', session: '2026-27', name: 'TT', status: 'published', effective_from: '2026-09-01', source: 'manual', notes: null, published_at: '2026-09-01', created_at: '' }],
    slots: [
      slot({ period_no: 1 }), slot({ period_no: 4, class: 'Class 9-B' }),
      slot({ period_no: 1, teacher_id: 'sci', subject: 'Science', class: 'Class 9-B' }),
      slot({ period_no: 2, teacher_id: 'maths2', subject: 'Mathematics', class: 'Class 8-A' }),
      slot({ period_no: 3, teacher_id: 'eng', subject: 'English', class: 'Class 10-A' }),
    ],
    staff: [], studentClasses: [],
    people: [
      { id: 'maths', name: 'Priya Maths', role: 'teacher', email: null, assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }] },
      { id: 'maths2', name: 'Arjun Maths', role: 'teacher', email: null, assignments: [{ class: 'Class 8-A', subject: 'Mathematics' }] },
      { id: 'sci', name: 'Ravi Science', role: 'teacher', email: null, assignments: [{ class: 'Class 10-A', subject: 'Science' }] },
      { id: 'eng', name: 'Esha English', role: 'teacher', email: null },
      { id: 'office', name: 'Office Person', role: 'admin', email: null },
    ],
    leave: [], absences: [], covers: [], dutyPosts: [], roster: [], duties: [], visits: [], compOffs: [], missing: [],
    ...over,
  };
}
const absence = (who: string, o: Partial<ScheduleRows['absences'][number]> = {}) => ({
  id: `a-${who}`, user_id: who, staff_member_id: null, on_date: '2026-10-05', kind: 'absent' as const, portion: 'full' as const, period_nos: [], reason: null,
  status: 'confirmed' as const, source: 'office' as const, created_at: '', ...o,
});
const cover = (slotId: string, sub: string, o: Partial<Cover> = {}): Cover => ({
  id: `c-${slotId}`, on_date: '2026-10-05', slot_id: slotId, class: 'Class 10-A', period_no: 1, subject: 'Mathematics', absent_user_id: 'maths', absent_staff_member_id: null,
  reason: 'absent', status: 'assigned', sub_user_id: sub, sub_staff_member_id: null, flag_note: null, flagged_at: null, ...o,
});

test('needs: full-day absence, half day by lunch, release by period, leave', () => {
  let r = base({ absences: [absence('maths')] });
  assert.deepEqual(needsOn('2026-10-05', r).needs.map(x => [x.period_no, x.classes]), [[1, 'Class 10-A'], [4, 'Class 9-B']]);
  r = base({ absences: [absence('maths', { portion: 'am' })] });
  assert.deepEqual(needsOn('2026-10-05', r).needs.map(x => x.period_no), [1], 'morning is before lunch');
  r = base({ absences: [absence('maths', { portion: 'pm' })] });
  assert.deepEqual(needsOn('2026-10-05', r).needs.map(x => x.period_no), [4]);
  r = base({ absences: [absence('maths', { kind: 'release', portion: 'periods', period_nos: [4] })] });
  assert.deepEqual(needsOn('2026-10-05', r).needs.map(x => [x.period_no, x.reason]), [[4, 'release']]);
  r = base({ leave: [{ id: 'l', staff_id: 'maths', leave_type: 'casual', from_date: '2026-10-05', to_date: '2026-10-05', half_day: true, status: 'approved' }] });
  const needs = needsOn('2026-10-05', r).needs;
  assert.equal(needs.length, 2);
  assert.ok(needs.every(x => x.reason === 'leave' && x.unsureHalf), 'half-day leave: the office decides which half');
  assert.equal(needsOn('2026-10-05', base({ absences: [absence('maths', { status: 'reported' })] })).needs.length, 0, 'unconfirmed WhatsApp reports wait');
  assert.equal(halfDaySplit(bells[0]), 10 * 60 + 20);
});

test('needs: combined lessons group; cover state; stale covers', () => {
  const r = base({ absences: [absence('maths')] });
  r.slots.push(slot({ period_no: 5, combined: true, subject: 'PE', class: 'Class 10-A' }), slot({ period_no: 5, combined: true, subject: 'PE', class: 'Class 10-B' }));
  const pe = needsOn('2026-10-05', r).needs.find(x => x.subject === 'PE')!;
  assert.equal(pe.lessons.length, 2);
  assert.equal(pe.classes, 'Class 10-A, Class 10-B');
  r.covers = [cover(pe.lessons[0].slot.id!, 'eng'), cover(pe.lessons[1].slot.id!, 'eng'), cover('gone', 'sci')];
  const after = needsOn('2026-10-05', r);
  assert.equal(after.needs.find(x => x.subject === 'PE')!.state, 'assigned');
  assert.equal(after.needs.find(x => x.subject === 'PE')!.sub, 'eng');
  assert.deepEqual(after.stale.map(c => c.id), ['c-gone'], 'a cover whose lesson no longer needs one');
  r.covers = [cover(pe.lessons[0].slot.id!, 'eng')];
  assert.equal(needsOn('2026-10-05', r).needs.find(x => x.subject === 'PE')!.state, 'open', 'half a combined lesson is not covered');
});

test('candidates: free, ranked by subject, class, term covers, day load; cap; away', () => {
  const r = base({ absences: [absence('maths')] });
  const p1 = needsOn('2026-10-05', r).needs.find(x => x.period_no === 1)!;
  let c = candidatesFor(p1, '2026-10-05', r);
  assert.deepEqual(c.ranked.map(x => x.person), ['maths2', 'eng'], 'Science teaches P1; Arjun teaches maths; office accounts are not in the pool');
  assert.ok(c.ranked[0].sameSubject && !c.ranked[0].teachesClass);
  // Esha teaches 10-A? No — give her the class and more cover history for Arjun: subject still wins.
  r.covers = [cover('x1', 'maths2', { on_date: '2026-09-20' }), cover('x2', 'maths2', { on_date: '2026-09-21' })];
  c = candidatesFor(p1, '2026-10-05', r);
  assert.equal(c.ranked[0].person, 'maths2', 'subject beats fewer covers');
  assert.equal(c.ranked[0].coversTerm, 2);
  // At the day's cap.
  r.covers = [cover('y1', 'maths2', { period_no: 2 }), cover('y2', 'maths2', { period_no: 3 })];
  c = candidatesFor(p1, '2026-10-05', r);
  assert.deepEqual(c.atCap.map(x => x.person), ['maths2']);
  // Away people and people on a duty at that time are not free.
  r.covers = [];
  r.absences.push(absence('eng', { id: 'a-eng', portion: 'am' }));
  r.dutyPosts = [{ id: 'gate', name: 'Gate', kind: 'gate', weekdays: [1], starts_at: '08:15', ends_at: '08:45', location: null, needed: 1, active: true }];
  r.roster = [{ id: 'r1', post_id: 'gate', weekday: 1, user_id: 'maths2', staff_member_id: null }];
  assert.deepEqual(candidatesFor(p1, '2026-10-05', r).ranked, []);
  assert.ok((busyOn('2026-10-05', r).get('maths2') || []).some(b => b.what === 'Gate duty'));
});

test('candidates: register teaching staff in contract, never visiting specialists', () => {
  const r = base({ absences: [absence('maths')], staff: [
    member({ id: 'sub1', name: 'Sunita Relief', category: 'teaching', employment: 'contract', contract_from: '2026-09-01', contract_to: '2026-12-31' }),
    member({ id: 'old', name: 'Old Contract', category: 'teaching', employment: 'contract', contract_to: '2026-09-30' }),
    member({ id: 'dance', name: 'Dance Teacher', category: 'teaching', employment: 'visiting', contract_to: '2027-03-31' }),
    member({ id: 'drv', name: 'Driver', category: 'support' }),
  ] });
  const p1 = needsOn('2026-10-05', r).needs[0];
  assert.deepEqual(candidatesFor(p1, '2026-10-05', r).ranked.map(x => x.person).sort(), ['eng', 'maths2', 's:sub1']);
});

test('register teachers hold lessons: clashes, load, agenda within contract', () => {
  const r = base({ staff: [member({ id: 'dance', name: 'Dance Teacher', employment: 'visiting', contract_from: '2026-10-01', contract_to: '2026-10-31' })] });
  const d1 = slot({ teacher_id: null, staff_member_id: 'dance', subject: 'Dance', class: 'Class 6-A', period_no: 5 });
  const d2 = slot({ teacher_id: null, staff_member_id: 'dance', subject: 'Dance', class: 'Class 7-A', period_no: 5 });
  assert.deepEqual(findClashes([d1, d2]).map(c => [c.kind, c.key]), [['teacher', 's:dance']]);
  r.slots.push(d1);
  assert.equal(teacherLoad(r.slots).get('s:dance'), 1);
  const [inside] = agenda({ kind: 'teacher', userId: 's:dance' }, '2026-10-05', '2026-10-05', r);
  assert.equal(inside.items.filter(i => i.kind === 'lesson').length, 1);
  const [outside] = agenda({ kind: 'teacher', userId: 's:dance' }, '2026-11-02', '2026-11-02', r);
  assert.equal(outside.items.length, 0, 'nothing after the contract ends');
});

test('agenda: cover for the substitute, covered-by for the absent teacher, duties', () => {
  const r = base({ absences: [absence('maths')] });
  const p1 = r.slots[0];
  r.covers = [cover(p1.id!, 'eng')];
  r.dutyPosts = [{ id: 'bus', name: 'Bus loading', kind: 'bus', weekdays: [1, 2, 3, 4, 5], starts_at: '14:30', ends_at: '15:00', location: 'Bay 2', needed: 1, active: true }];
  r.roster = [{ id: 'r', post_id: 'bus', weekday: 1, user_id: 'eng', staff_member_id: null }];
  r.duties = [{ id: 'd', on_date: '2026-10-05', starts_at: '12:30', ends_at: '13:30', kind: 'invigilation', title: 'Invigilation · Hall', event_id: null, room_id: null, user_id: 'eng', staff_member_id: null, note: null }];
  const [eng] = agenda({ kind: 'teacher', userId: 'eng' }, '2026-10-05', '2026-10-05', r);
  const coverItem = eng.items.find(i => i.kind === 'lesson' && i.coverFor) as any;
  assert.equal(coverItem.coverFor, 'Priya Maths');
  assert.deepEqual(eng.items.filter(i => i.kind === 'duty').map(i => (i as any).title), ['Invigilation · Hall', 'Bus loading']);
  const [maths] = agenda({ kind: 'teacher', userId: 'maths' }, '2026-10-05', '2026-10-05', r);
  const own = maths.items.filter(i => i.kind === 'lesson') as any[];
  assert.ok(own.every(l => l.covered));
  assert.equal(own.find(l => l.slot.id === p1.id).coveredBy, 'Esha English');
  assert.equal(maths.items[0].kind, 'leave');
  // A whole-school holiday switches the roster off.
  r.events = [{ id: 'h', title: 'Holiday', kind: 'holiday', starts_on: '2026-10-05', ends_on: '2026-10-05', wing_ids: null, bell_schedule_id: null, suspends_classes: true, staff_scope: 'none', starts_at: null, ends_at: null, notes: null }];
  const [off] = agenda({ kind: 'teacher', userId: 'eng' }, '2026-10-05', '2026-10-05', r);
  assert.ok(!off.items.some(i => i.kind === 'duty' && (i as any).title === 'Bus loading'));
});

test('weekly roster uses regular bells; fairness counts', () => {
  const r = base();
  assert.equal(regularLessons(r, 1, '2026-10-05').length, 5);
  r.covers = [cover('a', 'eng'), cover('b', 'eng', { on_date: '2026-09-10' }), cover('c', 'sci', { status: 'not_needed', sub_user_id: null })];
  r.dutyPosts = [{ id: 'g', name: 'Gate', kind: 'gate', weekdays: [1, 2], starts_at: '07:30', ends_at: '08:00', location: null, needed: 1, active: true }];
  r.roster = [{ id: 'r1', post_id: 'g', weekday: 1, user_id: 'eng', staff_member_id: null }, { id: 'r2', post_id: 'g', weekday: 2, user_id: 'eng', staff_member_id: null }];
  r.compOffs = [{ id: 'co', user_id: 'eng', staff_member_id: null, days: 1, duty_on: '2026-10-04', source: 'other', source_id: null, note: 'Sunday', granted_at: '', revoked_at: null }];
  const f = fairness(r, '2026-04-01', '2026-10-05');
  const eng = f.find(x => x.person === 'eng')!;
  assert.deepEqual([eng.covers, eng.rosterPerWeek, eng.compOffDays, eng.periodsPerWeek], [2, 2, 1, 1]);
  assert.equal(f[0].person, 'eng', 'most loaded first');
});

test('compensatory leave is capped at granted comp-off days', () => {
  const grants = [{ user_id: 't', days: 1, duty_on: '2026-10-04', revoked_at: null }, { user_id: 't', days: 0.5, duty_on: '2026-10-11', revoked_at: null }, { user_id: 't', days: 1, duty_on: '2026-10-12', revoked_at: '2026-10-13' }];
  const days = compOffDaysIn(grants, 't', '2026-27');
  assert.equal(days, 1.5);
  const b = balances([], [], 't', '2026-27', days).find(x => x.type === 'compensatory')!;
  assert.deepEqual([b.entitled, b.left], [1.5, 1.5]);
  assert.match(overBalance([], [], 't', '2026-27', 'compensatory', 2, undefined, days)!, /only 1.5 are left/);
  assert.equal(overBalance([], [], 't', '2026-27', 'compensatory', 1, undefined, days), null);
  assert.match(overBalance([], [], 't', '2026-27', 'compensatory', 1)!, /only 0 are left/, 'nothing granted, nothing to take');
  assert.equal(showBalance(balances([], [], 't', '2026-27').find(x => x.type === 'compensatory')!), false, 'hidden when nothing granted');
});
