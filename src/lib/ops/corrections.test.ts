import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCorrectionsCsv, planCorrections, type RosterPerson } from './corrections';

const people: RosterPerson[] = [
  { id: 'a', role: 'student', name: 'Aarav Shah', email: 'aarav@x.in', student_class: '10-A', custom_student_id: '1001' },
  { id: 'd', role: 'student', name: 'Diya Reddy', email: 'diya@x.in', student_class: '10-A', custom_student_id: '1002' },
  { id: 't', role: 'teacher', name: 'Priya Menon', email: 'priya@x.in', student_class: null, custom_student_id: null },
  { id: 'o', role: 'superadmin', name: 'Ops', email: 'ops@x.in', student_class: null, custom_student_id: null },
];
const ctx = { people, classes: ['10-A', '9-B'], takenEmails: new Set(['taken@x.in']) };

test('csv: needs email plus a column to correct; blank cells mean unchanged', () => {
  assert.match(parseCorrectionsCsv('name\nX').error!, /email/);
  assert.match(parseCorrectionsCsv('email\na@x.in').error!, /at least one column/);
  const { rows } = parseCorrectionsCsv('Email,Name,New Email,Roll No,Class\nAARAV@x.in,,,1009,9b');
  assert.deepEqual(rows, [{ email: 'aarav@x.in', name: undefined, newEmail: undefined, rollNo: '1009', className: '9b' }]);
});

test('plan: changes are diffed against the account, class names are canonicalised', () => {
  const [p] = planCorrections([{ email: 'aarav@x.in', name: 'Aarav R. Shah', rollNo: '1009', className: '9b' }], ctx);
  assert.deepEqual(p.issues, []);
  assert.deepEqual(p.changes, [
    { field: 'name', from: 'Aarav Shah', to: 'Aarav R. Shah' },
    { field: 'rollNo', from: '1001', to: '1009' },
    { field: 'class', from: '10-A', to: '9-B' },
  ]);
});

test('plan: a row that already matches is skipped, not refused', () => {
  const [p] = planCorrections([{ email: 'aarav@x.in', name: 'Aarav Shah', className: '10a' }], ctx);
  assert.deepEqual(p.issues, []);
  assert.deepEqual(p.changes, []);
});

test('plan: refusals', () => {
  const plans = planCorrections([
    { email: 'nobody@x.in', name: 'N' },
    { email: 'ops@x.in', name: 'O' },
    { email: 'aarav@x.in', newEmail: 'taken@x.in' },
    { email: 'diya@x.in', rollNo: '1001' },
    { email: 'priya@x.in', className: '10-A' },
    { email: 'diya@x.in', className: '12-Z' },
  ], ctx);
  assert.match(plans[0].issues[0], /No account/);
  assert.match(plans[1].issues[0], /Operator/);
  assert.match(plans[2].issues[0], /already used/);
  assert.match(plans[3].issues[0], /belongs to another student/);
  assert.match(plans[4].issues[0], /students only/);
  assert.ok(plans[5].issues.some(i => /Same account as row 4/.test(i)));
  assert.ok(plans[5].issues.some(i => /isn't set up/.test(i)));
});

test('plan: two rows cannot claim the same new email or roll number', () => {
  const plans = planCorrections([
    { email: 'aarav@x.in', newEmail: 'new@x.in', rollNo: '2000' },
    { email: 'diya@x.in', newEmail: 'NEW@x.in', rollNo: '2000' },
  ], ctx);
  assert.deepEqual(plans[0].issues, []);
  assert.ok(plans[1].issues.some(i => /Same new email as row 1/.test(i)));
  assert.ok(plans[1].issues.some(i => /Same roll number as row 1/.test(i)));
});
