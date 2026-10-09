import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeSchoolAttendance, type SummaryRow } from './school';

const row = (o: Partial<SummaryRow>): SummaryRow => ({ bucket: 'student', student_id: null, class_name: null, key: null, present: 0, late: 0, absent: 0, excused: 0, ...o });
const students = [
  { id: 'a', name: 'Asha', cls: 'Class 9-A', grade: 9, rollNo: '1' },
  { id: 'b', name: 'Bala', cls: 'Class 9-A', grade: 9, rollNo: '2' },
  { id: 'c', name: 'Chitra', cls: 'Class 10-B', grade: 10, rollNo: '1' },
];

test('school attendance: per class today, session, under 75%, weekly trend with gaps', () => {
  const rows = [
    row({ bucket: 'student', student_id: 'a', present: 9, late: 1 }),
    row({ bucket: 'student', student_id: 'b', present: 5, absent: 5 }),
    row({ bucket: 'student_month', student_id: 'a', present: 2 }),
    row({ bucket: 'class_week', class_name: 'Class 9-A', key: '2026-09-28', present: 3, absent: 1 }),
    row({ bucket: 'class_week', class_name: 'Class 9-A', key: '2026-10-12', present: 2 }),
    row({ bucket: 'class_day', class_name: 'class 9a', key: '2026-10-13', present: 1, absent: 1 }),
  ];
  const s = shapeSchoolAttendance(rows, students, '2026-09-30', '2026-10-13');
  assert.equal(s.classes.length, 2);
  const nineA = s.classes[0];
  assert.equal(nineA.cls.replace(/\s/g, ''), 'Class9-A');
  assert.equal(nineA.onRoll, 2);
  assert.deepEqual(nineA.today && [nineA.today.marked, nineA.today.pct], [2, 50]);
  assert.equal(nineA.session.pct, 75);
  assert.equal(nineA.under, 1);
  assert.deepEqual(nineA.weeks.map(w => w.pct), [75, null, 100]);
  assert.equal(s.classes[1].today, null);
  assert.equal(s.classesMarked, 1);
  assert.deepEqual(s.under.map(u => u.id), ['b']);
  assert.deepEqual(s.grades.map(g => [g.grade, g.session.pct]), [[9, 75], [10, null]]);
  assert.equal(s.any, true);
  assert.equal(shapeSchoolAttendance([], students, '2026-09-30', '2026-10-13').any, false);
});
