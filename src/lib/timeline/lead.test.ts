import test from 'node:test';
import assert from 'node:assert/strict';
import { Access } from '@/lib/admin/rbac';
import { normClass } from '@/lib/teacher/scope';
import { emptyRows, monthSeries, officeLens, parentLens, shapeTimeline, studentLens, teacherLens, yearEvents, type Lens, type Rows } from './rules';
import { chaptersNow, leadOf } from './lead';

const rows = (over: Partial<Rows> = {}): Rows => emptyRows({
  today: '2026-11-06',
  enrolments: [{ session: '2026-27', class_name: 'Class 10-A', roll_no: '1', starts_on: '2026-04-01', ends_on: null, end_reason: null, outcome: null, published_at: null }],
  attendance: { months: [
    { month: '2026-08', present: 22, absent: 0, late: 0, excused: 0, marked: 22 },
    { month: '2026-09', present: 21, absent: 1, late: 0, excused: 0, marked: 22 },
    { month: '2026-10', present: 15, absent: 5, late: 0, excused: 0, marked: 20 },
  ], runs: [{ from: '2026-10-12', to: '2026-10-16', days: 5 }] },
  tml: [
    { subject: 'Social Science', topic_name: 'Nationalism in India', score: 21, computed_at: '2026-09-01T00:00:00Z' },
    { subject: 'Social Science', topic_name: 'Nationalism in India', score: 56, computed_at: '2026-11-06T00:00:00Z' },
    { subject: 'Mathematics', topic_name: 'Real Numbers', score: 70, computed_at: '2026-09-15T00:00:00Z' },
    { subject: 'Mathematics', topic_name: 'Real Numbers', score: 44, computed_at: '2026-11-01T00:00:00Z' },
  ],
  invoices: [{ id: 'i1', session: '2026-27', amount: 30000, concession: 0 }],
  payments: [{ invoice_id: 'i1', amount: 20000, paid_on: '2026-06-15', receipt_no: 'R1' }],
  tutor: [{ subject: 'Social Science', topic: 'Nationalism in India', depth_score: 100, completed_at: '2026-11-06T10:00:00Z', mode: 'standard' }],
  ...over,
});
const lead = (r: Rows, lens: Lens) => {
  const t = shapeTimeline(r, lens);
  const events = t.years.flatMap(y => yearEvents(r, lens, y.session));
  return leadOf(r, lens, events, monthSeries(r, lens));
};

test('chapters now: latest score and the score a month ago', () => {
  const c = chaptersNow(rows().tml, '2026-11-06');
  assert.deepEqual(c.find(x => x.topic === 'Nationalism in India'), { subject: 'Social Science', topic: 'Nationalism in India', score: 56, prev: 21 });
});

test('student: wins and one next step; no worry list', () => {
  const l = lead(rows(), studentLens());
  assert.equal(l.who, 'student');
  assert.ok(l.wins.some(w => w.title === 'You lifted Nationalism in India to 56%'));
  assert.deepEqual(l.next && [l.next.topic, l.next.score], ['Real Numbers', 44]);
  assert.ok(!l.attention.some(a => a.key === 'gap' || a.key === 'runs'), 'the student isn’t handed a worry list');
  assert.equal(l.fees, null);
});

test('parent: attention items come with how to help at home, and fees due', () => {
  const l = lead(rows(), parentLens());
  const att = l.attention.find(a => a.key === 'attendance')!;
  assert.equal(att.title, 'Attendance was 75% in October 2026');
  assert.ok(att.help);
  assert.ok(l.attention.find(a => a.key === 'gap')!.help!.includes('AI tutor'));
  assert.deepEqual(l.fees, { billed: 30000, paid: 20000, due: 10000 });
  assert.ok(l.attention.some(a => a.key === 'fees'));
});

test('teacher: slipping and improving chapters in scope, no fees', () => {
  const maths = teacherLens({ teacherClass: null, scope: [{ cls: 'Class 10-A', subject: 'Mathematics' }] }, 'Class 10-A', normClass)!;
  const l = lead(rows(), maths);
  assert.deepEqual(l.slipping.map(c => c.topic), ['Real Numbers']);
  assert.deepEqual(l.improving, [], 'Social Science is not this teacher’s subject');
  assert.equal(l.fees, null);
  assert.ok(!l.attention.some(a => a.key === 'fees'));
});

test('office: the role sets the focus and what leads the attention list', () => {
  assert.equal(officeLens(new Access(['principal']))!.focus, 'all');
  assert.equal(officeLens(new Access(['accountant']))!.focus, 'fees');
  assert.equal(officeLens(new Access(['counsellor']))?.focus, 'care');
  assert.equal(officeLens(new Access(['registrar']))!.focus, 'register');
  const l = lead(rows(), officeLens(new Access(['accountant']))!);
  assert.equal(l.focus, 'fees');
  assert.equal(l.attention[0].key, 'fees');
});
