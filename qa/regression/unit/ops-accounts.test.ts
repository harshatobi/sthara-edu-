/**
 * TE.040 OPS-PPL-01..04 (automated): how operators add people. Row checks, the bulk CSV, the
 * school's login requests, and temporary passwords.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePeople, parsePeopleCsv, CSV_TEMPLATE, tempPassword } from '@/lib/ops/people';
import { checkPeople } from '@/lib/ops/requests';

const classes = ['10-A', '10-B'];

test('the downloadable CSV example imports cleanly into a school with its classes', () => {
  const { rows, error } = parsePeopleCsv(CSV_TEMPLATE);
  assert.equal(error, undefined);
  assert.deepEqual(rows.map(r => r.role), ['admin', 'teacher', 'student', 'parent']);
  assert.deepEqual(validatePeople(rows, { classes }), []);
  assert.deepEqual(rows[1].subjects, [{ class: '10-A', subject: 'Mathematics' }, { class: '10-B', subject: 'Mathematics' }]);
  assert.deepEqual(rows[3].children, ['1042']);
});

test('the CSV needs a header with role, name and email; quoted cells keep their commas', () => {
  assert.match(parsePeopleCsv('role,name\nadmin,A').error!, /header must include role, name and email/);
  assert.match(parsePeopleCsv('role,name,email').error!, /at least one person/);
  const { rows } = parsePeopleCsv('Role,Name,Email\nadmin,"Rao, Sunita",S@X.IN');
  assert.equal(rows[0].name, 'Rao, Sunita');
  assert.equal(rows[0].email, 's@x.in');
});

test('every row problem is reported against its row and field', () => {
  const issues = validatePeople([
    { role: 'student', name: 'A', email: 'a@x.in', className: '9-C', rollNo: '1' },
    { role: 'student', name: 'B', email: 'a@x.in', className: '10-A', rollNo: '1' },
    { role: 'student', name: '', email: 'bad', className: '10-A' },
    { role: 'teacher', name: 'T', email: 't@x.in', subjects: [{ class: '12-Z', subject: 'Physics' }], classTeacherOf: '11-A' },
    { role: 'parent', name: 'P', email: 'p@x.in', children: ['999'] },
    { role: 'janitor' as never, name: 'J', email: 'j@x.in' },
  ], { classes, existingEmails: new Set(['t@x.in']), existingRollNos: new Set() });
  const got = issues.map(i => `${i.row}:${i.field}`);
  for (const want of ['1:class', '2:email', '3:name', '3:email', '3:rollNo', '4:email', '4:subjects', '4:classTeacherOf', '5:children', '6:role']) {
    assert.ok(got.includes(want), `expected an issue at ${want}; got ${got.join(', ')}`);
  }
});

test('a roll number used twice in a batch is refused on the second row', () => {
  const issues = validatePeople([
    { role: 'student', name: 'A', email: 'a@x.in', className: '10-A', rollNo: '7' },
    { role: 'student', name: 'B', email: 'b@x.in', className: '10-A', rollNo: '7' },
  ], { classes });
  assert.deepEqual(issues.map(i => `${i.row}:${i.field}`), ['2:rollNo']);
});

test('a parent can be linked to a child created in the same batch or already in the school', () => {
  const rows = [
    { role: 'student' as const, name: 'S', email: 's@x.in', className: '10-A', rollNo: '1042' },
    { role: 'parent' as const, name: 'P', email: 'p@x.in', children: ['1042', '2001'] },
  ];
  assert.deepEqual(validatePeople(rows, { classes, existingRollNos: new Set(['2001']) }), []);
});

test('a school’s login request: at least one and at most 100 people, each with a role, name and valid email', () => {
  assert.deepEqual(checkPeople([]), { error: 'Add at least one person.' });
  assert.deepEqual(checkPeople(Array.from({ length: 101 }, () => ({ role: 'teacher', name: 'T', email: 't@x.in' }))), { error: 'At most 100 people in one request.' });
  assert.deepEqual(checkPeople([{ role: 'boss', name: 'X', email: 'x@x.in' }]), { error: 'Row 1: pick a role.' });
  assert.deepEqual(checkPeople([{ role: 'teacher', name: ' ', email: 'x@x.in' }]), { error: 'Row 1: add their name.' });
  assert.deepEqual(checkPeople([{ role: 'teacher', name: 'T', email: 'nope' }]), { error: 'Row 1: add a valid email.' });
  const ok = checkPeople([{ role: 'teacher', name: ' Priya ', email: 'PRIYA@School.EDU.in' }]);
  assert.ok('people' in ok);
  assert.equal(ok.people[0].email, 'priya@school.edu.in');
});

test('temporary passwords: 12 characters, every class present, no look-alike characters', () => {
  for (let i = 0; i < 500; i++) {
    const p = tempPassword(n => Math.floor(Math.random() * n));
    assert.equal(p.length, 12);
    assert.match(p, /[a-z]/); assert.match(p, /[A-Z]/); assert.match(p, /[2-9]/); assert.match(p, /[@#%&*!?]/);
    assert.doesNotMatch(p, /[01oOlIi]/, p);
  }
});
