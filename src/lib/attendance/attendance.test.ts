import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, atLocal, dayOf, expectedOn, localOf, metresBetween, monthOf, parseLocalDateTime, parsePunchTable, peopleOf, weeksSince, type AttendanceRows, type Person, type Plan, type Punch } from './engine';

const T: Person = { key: 't1', name: 'Priya', kind: 'teacher', employeeCode: 'E1' };
const G: Person = { key: 's:g1', name: 'Guard', kind: 'register', employeeCode: 'G1' };
const plan = (o: Partial<Plan>): Plan => ({ user_id: null, staff_member_id: 'g1', mode: 'fixed', shift_id: 'morning', rotation: [], off_mode: 'fixed', off_days: [7], off_cycle: [], anchor_date: '2026-09-28', works_holidays: false, rules_exempt: false, grace_min: null, ...o });
const punch = (who: Person, date: string, t: string, o: Partial<Punch> = {}): Punch => ({
  user_id: who.key.startsWith('s:') ? null : who.key, staff_member_id: who.key.startsWith('s:') ? who.key.slice(2) : null, at: atLocal(date, t), direction: 'unknown', source: 'app', on_campus: true, ...o,
});
function rows(o: Partial<AttendanceRows> = {}): AttendanceRows {
  return {
    settings: { ...DEFAULT_SETTINGS }, workingDays: [1, 2, 3, 4, 5, 6],
    shifts: [{ id: 'morning', name: 'Morning', starts_at: '06:00', ends_at: '14:00', active: true }, { id: 'night', name: 'Night', starts_at: '22:00', ends_at: '06:00', active: true }],
    plans: [], overrides: [], punches: [], marks: [], leave: [], absences: [], events: [], ...o,
  };
}

test('local time (IST) round trip', () => {
  const ts = atLocal('2026-10-05', '07:50');
  assert.equal(ts, '2026-10-05T02:20:00.000Z');
  assert.deepEqual(localOf(ts), { date: '2026-10-05', min: 7 * 60 + 50 });
  assert.equal(weeksSince('2026-09-28', '2026-10-05'), 1);
  assert.equal(weeksSince('2026-09-28', '2026-09-27'), -1);
});

test('expected: teachers by school hours; register by plan; rotation; weekly off; holiday; override; leave', () => {
  const r = rows({ plans: [plan({})] });
  assert.deepEqual(expectedOn('2026-10-05', T, r), { kind: 'work', start: 465, end: 900, label: 'Teaching day', overnight: false });
  assert.equal(expectedOn('2026-10-04', T, r).kind, 'off', 'Sunday');
  assert.equal((expectedOn('2026-10-05', G, r) as any).label, 'Morning');
  assert.deepEqual(expectedOn('2026-10-04', G, r), { kind: 'off', why: 'weekly_off' });
  // Rotation week by week, and a rotating weekly off.
  const rot = rows({ plans: [plan({ mode: 'rotating', shift_id: null, rotation: ['morning', 'night'], off_mode: 'rotating', off_cycle: [2, 3] })] });
  assert.equal((expectedOn('2026-09-28', G, rot) as any).label, 'Morning');
  assert.equal((expectedOn('2026-10-05', G, rot) as any).label, 'Night');
  assert.equal((expectedOn('2026-10-05', G, rot) as any).overnight, true);
  assert.equal(expectedOn('2026-09-29', G, rot).kind, 'off', 'week 0 off on Tuesday');
  assert.equal(expectedOn('2026-10-07', G, rot).kind, 'off', 'week 1 off on Wednesday');
  // A holiday is off, unless the plan works holidays; an override beats both.
  const hol = { id: 'h', title: 'Holiday', kind: 'holiday' as const, starts_on: '2026-10-02', ends_on: '2026-10-02', wing_ids: null, bell_schedule_id: null, suspends_classes: true, staff_scope: 'none' as const, starts_at: null, ends_at: null, notes: null };
  assert.deepEqual(expectedOn('2026-10-02', T, rows({ events: [hol] })), { kind: 'off', why: 'holiday' });
  assert.equal(expectedOn('2026-10-02', G, rows({ events: [hol], plans: [plan({ works_holidays: true })] })).kind, 'work', 'security works holidays');
  assert.equal(expectedOn('2026-10-02', T, rows({ events: [hol], overrides: [{ user_id: 't1', staff_member_id: null, on_date: '2026-10-02', kind: 'work', shift_id: null, reason: 'Annual Day' }] })).kind, 'work');
  assert.deepEqual(expectedOn('2026-10-05', G, rows({ plans: [plan({})], overrides: [{ user_id: null, staff_member_id: 'g1', on_date: '2026-10-05', kind: 'shift', shift_id: 'night', reason: 'swap' }] })).kind, 'work');
  // Leave: accounts by staff_id, register staff by staff_member_id.
  assert.equal(expectedOn('2026-10-05', T, rows({ leave: [{ staff_id: 't1', leave_type: 'sick', from_date: '2026-10-05', to_date: '2026-10-05', half_day: false, status: 'approved' }] })).kind, 'leave');
  assert.equal(expectedOn('2026-10-05', G, rows({ plans: [plan({})], leave: [{ staff_id: null, staff_member_id: 'g1', leave_type: 'casual', from_date: '2026-10-05', to_date: '2026-10-05', half_day: false, status: 'approved' }] })).kind, 'leave');
});

test('day: late with grace, precedence mark > biometric > app, not in yet, short, overnight', () => {
  let r = rows({ punches: [punch(T, '2026-10-05', '07:54', { direction: 'in' }), punch(T, '2026-10-05', '15:05', { direction: 'out' })] });
  let d = dayOf('2026-10-05', T, r, null);
  assert.equal(d.status, 'present', '9 minutes late is within 10 minutes grace');
  r = rows({ punches: [punch(T, '2026-10-05', '08:02'), punch(T, '2026-10-05', '15:10')] });
  d = dayOf('2026-10-05', T, r, null);
  assert.deepEqual([d.status, d.lateMin, d.hours], ['late', 17, 7 + 8 / 60]);
  // The biometric device beats the app.
  r = rows({ punches: [punch(T, '2026-10-05', '07:40', { source: 'app' }), punch(T, '2026-10-05', '08:05', { source: 'biometric' }), punch(T, '2026-10-05', '15:00', { source: 'biometric' })] });
  assert.equal(dayOf('2026-10-05', T, r, null).status, 'late');
  // A supervisor's mark beats every punch.
  r.marks = [{ user_id: 't1', staff_member_id: null, on_date: '2026-10-05', status: 'present', in_at: '07:40', out_at: '15:00', source: 'override', reason: 'Device was down' }];
  assert.deepEqual([dayOf('2026-10-05', T, r, null).status, dayOf('2026-10-05', T, r, null).source], ['present', 'override']);
  // Today before the day ends: not in yet; afterwards absent.
  assert.equal(dayOf('2026-10-05', T, rows(), 8 * 60).status, 'not_in');
  assert.equal(dayOf('2026-10-05', T, rows(), null).status, 'absent');
  // Short day.
  d = dayOf('2026-10-05', T, rows({ punches: [punch(T, '2026-10-05', '07:45'), punch(T, '2026-10-05', '11:00')] }), null);
  assert.ok(d.flags.includes('short') && d.flags.includes('early_out'));
  // Off campus.
  assert.ok(dayOf('2026-10-05', T, rows({ punches: [punch(T, '2026-10-05', '07:45', { on_campus: false })] }), null).flags.includes('off_campus'));
  // A night shift takes the next morning's check-out.
  const night = rows({ plans: [plan({ shift_id: 'night' })], punches: [punch(G, '2026-10-05', '21:58', { source: 'biometric' }), punch(G, '2026-10-06', '06:03', { source: 'biometric' })] });
  d = dayOf('2026-10-05', G, night, null);
  assert.deepEqual([d.status, d.outMin! - 1440, Math.round(d.hours! * 60)], ['present', 363, 485]);
});

test('month: proposals follow the switchable rules; exempt people propose nothing', () => {
  const p: Punch[] = [];
  for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) p.push(punch(T, d, '08:10'), punch(T, d, '15:00'));
  p.push(punch(T, '2026-10-08', '07:45'), punch(T, '2026-10-08', '10:00'));
  const r = rows({ punches: p });
  const m = monthOf('2026-10-01', T, r, '2026-10-10');
  assert.equal(m.late, 3);
  assert.ok(m.proposals.some(x => x.kind === 'lates' && x.days === 0.5));
  assert.ok(m.proposals.some(x => x.kind === 'short' && x.date === '2026-10-08'));
  // Oct 1, 2, 3 (Thu-Sat) and Oct 9 (Fri) have no punches: absent. Oct 4 is Sunday.
  assert.deepEqual(m.proposals.filter(x => x.kind === 'absent').map(x => x.date), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09']);
  assert.equal(m.lopProposed, 4 + 0.5 + 0.5);
  const off = rows({ punches: p, settings: { ...DEFAULT_SETTINGS, lates_rule: false, short_rule: false, absent_rule: false } });
  assert.equal(monthOf('2026-10-01', T, off, '2026-10-10').lopProposed, 0, '"just record": every rule off');
  const exempt = rows({ punches: p, plans: [plan({ user_id: 't1', staff_member_id: null, shift_id: 'morning' })] });
  exempt.plans[0].rules_exempt = true;
  assert.equal(monthOf('2026-10-01', T, exempt, '2026-10-10').lopProposed, 0);
});

test('biometric export parsing and geofence distance', () => {
  const { punches, problems } = parsePunchTable([
    ['Emp Code', 'Date', 'Time', 'In/Out'],
    ['G1', '05/10/2026', '06:02', 'In'],
    ['G1', '05/10/2026', '2:05 PM', 'Out'],
    ['', '05/10/2026', '06:02', 'In'],
  ]);
  assert.equal(punches.length, 2);
  assert.equal(problems.length, 1);
  assert.deepEqual(localOf(punches[1].at), { date: '2026-10-05', min: 14 * 60 + 5 });
  assert.equal(punches[1].direction, 'out');
  assert.equal(parseLocalDateTime('2026-10-05 08:03'), atLocal('2026-10-05', '08:03'));
  assert.equal(parseLocalDateTime('garbage'), null);
  const single = parsePunchTable([['UserID', 'Punch Time'], ['E1', '2026-10-05 07:59:31']]);
  assert.equal(single.punches.length, 1);
  assert.ok(Math.abs(metresBetween({ lat: 17.385, lng: 78.4867 }, { lat: 17.3859, lng: 78.4867 }) - 100) < 2);
});

test('month: days before the school started keeping attendance, or before someone joined, are not absences', () => {
  const p = [punch(T, '2026-10-07', '07:40'), punch(T, '2026-10-07', '15:00')];
  // The school's first record is Oct 7: Oct 1-6 are not tracked, Oct 8 and 9 (no punches) are absences.
  let m = monthOf('2026-10-01', T, rows({ punches: p, trackedFrom: '2026-10-07' }), '2026-10-10');
  assert.equal(m.untracked, 5, 'Oct 1, 2, 3, 5, 6 (Oct 4 is Sunday)');
  assert.deepEqual(m.proposals.map(x => x.date), ['2026-10-08', '2026-10-09']);
  assert.equal(m.workDays, 3, 'Oct 7, 8, 9');
  // Nothing ever recorded: nothing is proposed.
  m = monthOf('2026-10-01', T, rows({ trackedFrom: null }), '2026-10-10');
  assert.equal(m.lopProposed, 0);
  // Joined on Oct 9: only Oct 9 counts, even though the school has kept attendance since Oct 1.
  m = monthOf('2026-10-01', { ...T, since: '2026-10-09' }, rows({ trackedFrom: '2026-10-01' }), '2026-10-10');
  assert.deepEqual(m.proposals.map(x => x.date), ['2026-10-09']);
  // A register mark before the start still counts (HR recorded it).
  m = monthOf('2026-10-01', T, rows({ trackedFrom: '2026-10-07', marks: [{ user_id: 't1', staff_member_id: null, on_date: '2026-10-02', status: 'absent', in_at: null, out_at: null, source: 'register', reason: null }] }), '2026-10-10');
  assert.ok(m.proposals.some(x => x.date === '2026-10-02'));
  assert.equal(dayOf('2026-10-02', T, rows({ trackedFrom: '2026-10-07' }), null).status, 'untracked');
});

test('people: joining day from the contract start, else when they were added', () => {
  const ps = peopleOf([{ id: 't1', name: 'Priya', role: 'teacher', created_at: '2026-09-23T18:44:06Z' }],
    [{ id: 'g1', user_id: null, name: 'Guard', active: true, employee_code: 'G1', contract_from: '2026-06-01', created_at: '2026-09-24T10:00:00Z' }]);
  assert.deepEqual(ps.map(p => p.since), ['2026-06-01', '2026-09-24']);
});

test('people: accounts and register staff, linked register rows not repeated', () => {
  const ps = peopleOf([{ id: 't1', name: 'Priya', role: 'teacher' }, { id: 'a1', name: 'Asha', role: 'admin' }, { id: 'p1', name: 'Parent', role: 'parent' }],
    [{ id: 'x', user_id: 't1', name: 'Priya', active: true, employee_code: 'E1' }, { id: 'g1', user_id: null, name: 'Guard', active: true, employee_code: 'G1' }, { id: 'g2', user_id: null, name: 'Left', active: false, employee_code: null }]);
  assert.deepEqual(ps.map(p => [p.key, p.kind, p.employeeCode]), [['a1', 'office', null], ['s:g1', 'register', 'G1'], ['t1', 'teacher', 'E1']]);
});

import { parseAttendanceWord, parseDateWord, parseLeaveWord } from './commands';

test('WhatsApp words: IN, OUT, LEAVE with dates', () => {
  assert.deepEqual(parseAttendanceWord('IN'), { kind: 'check_in' });
  assert.deepEqual(parseAttendanceWord("I'm in"), { kind: 'check_in' });
  assert.deepEqual(parseAttendanceWord('leaving.'), { kind: 'check_out' });
  assert.equal(parseAttendanceWord('in the lab'), null);
  assert.equal(parseDateWord('12 Oct', '2026-09-28'), '2026-10-12');
  assert.equal(parseDateWord('5/1', '2026-09-28'), '2027-01-05', 'a past day this year means next year');
  assert.equal(parseDateWord('31/2', '2026-09-28'), null);
  assert.deepEqual(parseLeaveWord('LEAVE 12 Oct to 14 Oct sister\'s wedding', '2026-09-28'), { kind: 'leave', from: '2026-10-12', to: '2026-10-14', reason: 'sister\'s wedding' });
  assert.deepEqual(parseLeaveWord('leave tomorrow - fever', '2026-09-28'), { kind: 'leave', from: '2026-09-29', to: '2026-09-29', reason: 'fever' });
  assert.deepEqual(parseLeaveWord('leave 12 oct', '2026-09-28'), { kind: 'leave_help' }, 'a reason is needed');
  assert.equal(parseLeaveWord('leaves are falling', '2026-09-28'), null);
});
