import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admKey, cell, DATASETS, datasetOf, parseGrade, sheetKey, type Lookups } from './datasets';
import { checkTable, chunks, readHeader, receiptFloors, template } from './engine';
import { readTable } from './parse';
import { writeXlsx } from './xlsx';

const look: Lookups = {
  students: new Map([[admKey('A001'), { id: 's1', name: 'Asha' }], [admKey('A002'), { id: 's2', name: 'Ravi' }]]),
  classes: new Map([['10a', '10-A']]),
  sheets: new Map([
    [sheetKey('PT1', '10-A', 'Mathematics'), { id: 'sh1', max: 40, status: 'open' }],
    [sheetKey('Periodic Test 1', '10-A', 'Mathematics'), { id: 'sh1', max: 40, status: 'open' }],
  ]),
};
const d = (k: string) => datasetOf(k)!;

test('every dataset has a unique key, a writer and a guide for each column', () => {
  assert.equal(new Set(DATASETS.map(x => x.key)).size, DATASETS.length);
  for (const x of DATASETS) {
    assert.match(x.writer, /^import_[a-z_]+$/);
    assert.equal(x.writer, `import_${x.key}`);
    for (const c of x.columns) assert.ok(c.key && /^[a-z][a-z_0-9]*$/.test(c.key), `${x.key}.${c.key}`);
    assert.equal(new Set(x.columns.map(c => c.key)).size, x.columns.length, `${x.key} has repeated columns`);
  }
});

test('header: aliases, unknown columns, repeats and missing required ones', () => {
  const ok = readHeader(d('attendance'), ['Admission No', 'Class', 'Day', 'Status', 'Remarks']);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.at.get('date'), 2);
  assert.equal(ok.at.get('note'), 4);
  const bad = readHeader(d('attendance'), ['admission_no', 'admn_no', 'class', 'status', 'colour']);
  assert.equal(bad.problems.length, 3, bad.problems.join(' | '));
  assert.ok(bad.problems.some(p => /colour/.test(p)));
  assert.ok(bad.problems.some(p => /Two columns mean admission_no/.test(p)));
  assert.ok(bad.problems.some(p => /no date column/.test(p)));
});

test('attendance: clean rows resolve to ids, problems name the row and column', () => {
  const r = checkTable(d('attendance'), [
    ['admission_no', 'class', 'date', 'status', 'note'],
    ['a001', 'Class 10 A', '05-06-2024', 'P', ''],
    ['A002', '10-A', '05-06-2024', 'absent', 'fever'],
    ['A003', '10-A', '05-06-2024', 'present', ''],
    ['A001', '9-B', '06-06-2024', 'present', ''],
    ['A001', '10-A', '03/04/2024', 'present', ''],
    ['A001', '10-A', '05-06-2024', 'L', ''],
    ['A002', '10-A', '07-06-2024', 'maybe', ''],
  ], look, false);
  assert.deepEqual(r.fileProblems, []);
  assert.deepEqual(r.rows.map(x => x.row), [
    { student_id: 's1', class_name: '10-A', day: '2024-06-05', status: 'present', note: null },
    { student_id: 's2', class_name: '10-A', day: '2024-06-05', status: 'absent', note: 'fever' },
  ]);
  assert.deepEqual(r.problems.map(p => [p.n, p.column ?? null]), [[4, 'admission_no'], [5, 'class'], [6, 'date'], [7, null], [8, 'status']]);
  assert.match(r.problems[3].error, /Same record as row 2/);
  assert.equal(r.problemCount, 5);
  assert.equal(r.total, 7);
});

test('exam marks: sheet found by code or name, max enforced, empty rows skipped', () => {
  const r = checkTable(d('exam_marks'), [
    ['admission_no', 'class', 'assessment', 'subject', 'marks', 'code'],
    ['A001', '10-A', 'pt1', 'mathematics', '36.5', ''],
    ['A002', '10-A', 'Periodic Test 1', 'Mathematics', '', 'absent'],
    ['A001', '10-A', 'PT2', 'Mathematics', '30', ''],
    ['A002', '10-A', 'PT1', 'Mathematics', '', ''],
  ], look, false);
  assert.deepEqual(r.rows.map(x => x.row), [
    { sheet_id: 'sh1', student_id: 's1', marks: 36.5, code: null },
    { sheet_id: 'sh1', student_id: 's2', marks: null, code: 'AB' },
  ]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0].error, /No PT2 marks sheet/);
  // A002 + PT1 is a repeat of row 3 (same sheet), even though it is empty.
  assert.equal(r.problemCount + r.skipped, 2);
});

test('fee structures: instalments become an even schedule inside the session', () => {
  const r = checkTable(d('fee_structures'), [['session', 'grade', 'annual_fee', 'instalments'], ['2026-27', 'Class X', '₹60,000', '4']], look, false);
  assert.deepEqual(r.problems, []);
  const row = r.rows[0].row as { grade: number; annual_fee: number; schedule: { no: number; due_on: string; share: number }[] };
  assert.equal(row.grade, 10);
  assert.equal(row.annual_fee, 60000);
  assert.equal(row.schedule.length, 4);
  assert.equal(row.schedule[0].due_on, '2026-04-10');
  assert.ok(Math.abs(row.schedule.reduce((s, i) => s + i.share, 0) - 1) < 1e-9);
});

test('fee payments: one instalment stays in one chunk, receipt repeats refused, floors per session', () => {
  const r = checkTable(d('fee_payments'), [
    ['admission_no', 'session', 'instalment_no', 'amount', 'mode', 'reference', 'paid_on', 'receipt_no'],
    ['A001', '2025-26', '1', '5000', 'NEFT', '', '05-06-2025', 'RCT/2025-26/00041'],
    ['A002', '2025-26', '1', '5000', 'cash', '', '05-06-2025', ''],
    ['A001', '2025-26', '1', '5000', 'gpay', '', '06-06-2025', ''],
    ['A001', '2025-26', '2', '5000', 'cheque', '', '06-10-2025', 'RCT/2025-26/00007'],
    ['A002', '2025-26', '2', '100', 'cash', '', '06-10-2025', 'rct/2025-26/00041'],
  ], look, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0].error, /Same record as row 2/);
  // Rows of A001/instalment 1 (lines 2 and 4) sit together.
  assert.deepEqual(r.rows.map(x => x.n), [2, 4, 3, 5]);
  assert.deepEqual(chunks(r.rows, 1, d('fee_payments').group).map(c => c.map(x => x.n)), [[2, 4], [3], [5]]);
  assert.deepEqual(receiptFloors(r.rows), { '2025-26': 41 });
  assert.equal(r.rows[0].row.mode, 'bank_transfer');
  assert.equal(r.rows[1].row.mode, 'upi');
});

test('applicants: phone and email cleaned, unknown stage refused', () => {
  const r = checkTable(d('admission_applicants'), [
    ['session', 'name', 'grade', 'dob', 'phone', 'email', 'stage'],
    ['2027-28', 'Meera  K', '3', '02-05-2019', '+91 98765 43210', 'A@B.in', 'Admitted'],
    ['2027-28', 'Arjun', 'III', '', '012345', '', 'maybe'],
  ], look, false);
  assert.deepEqual(r.rows[0].row, {
    session: '2027-28', name: 'Meera K', grade: 3, date_of_birth: '2019-05-02', guardian_name: null, guardian_phone: '9876543210',
    guardian_email: 'a@b.in', previous_school: null, source: null, stage: 'enrolled',
  });
  assert.deepEqual(r.problems.map(p => p.column), ['guardian_phone', 'stage']);
});

test('cells and grades', () => {
  assert.equal(parseGrade('XII'), 12);
  assert.equal(parseGrade('Grade 3'), 3);
  assert.equal(parseGrade('13'), null);
  const col = d('attendance').columns.find(c => c.key === 'note')!;
  assert.deepEqual(cell(col, '   ', false), { value: null });
  assert.deepEqual(cell(col, 'x'.repeat(301), false), { error: 'Longer than 300 characters.' });
  assert.deepEqual(cell(d('attendance').columns[0], '', false), { error: 'Required.' });
});

test('large files: header-only and oversized files are refused before any row', () => {
  assert.deepEqual(checkTable(d('attendance'), [['admission_no', 'class', 'date', 'status']], look, false).fileProblems, ['The file has a header but no rows.']);
  assert.deepEqual(checkTable(d('attendance'), [], look, false).fileProblems, ['The file is empty.']);
});

test('chunks never split a group and cover every row once', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ n: i + 2, row: { g: Math.floor(i / 3) } }));
  const c = chunks(rows, 4, r => String(r.g));
  assert.deepEqual(c.map(x => x.map(r => r.row.g)), [[0, 0, 0, 1, 1, 1], [2, 2, 2, 3]]);
  assert.equal(chunks(rows, 4).length, 3);
});

test('every template opens, and its own example row passes the header check', async () => {
  for (const x of DATASETS) {
    const sheets = template(x);
    const bytes = writeXlsx(sheets);
    const back = await readTable(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'xlsx');
    assert.deepEqual(back[0], x.columns.map(c => c.key), x.key);
    assert.deepEqual(readHeader(x, back[0]).problems, [], x.key);
    assert.equal(sheets[1].name, 'Guide');
    assert.equal(sheets[1].rows.length - 1 >= x.columns.length, true);
  }
});

test('admission numbers: two register entries on one key are refused, not guessed', () => {
  const twice: Lookups = { ...look, ambiguous: new Set([admKey('A002')]) };
  const r = checkTable(d('attendance'), [
    ['admission_no', 'class', 'date', 'status'],
    ['A001', '10-A', '05-06-2024', 'P'],
    ['A002', '10-A', '05-06-2024', 'P'],
  ], twice, false);
  assert.deepEqual(r.problems.map(p => [p.n, p.column]), [[3, 'admission_no']]);
  assert.match(r.problems[0].error, /More than one student/);
  assert.notEqual(admKey('A 001'), admKey('A001'), 'spaces inside a number count, as in the register index');
});

test('register: an admission number the register would refuse is caught in the check', () => {
  const r = checkTable(d('students'), [
    ['admission_no', 'full_name'],
    ['A1024', 'Asha Rao'],
    ['A#1025', 'Ravi Rao'],
    ['A'.repeat(31), 'Mira Rao'],
  ], look, false);
  assert.deepEqual(r.problems.map(p => [p.n, p.column]), [[3, 'admission_no'], [4, 'admission_no']]);
});

test('documents: each row needs its file, sizes are checked, the kind is read by name', () => {
  const files: Record<string, number> = { 'a1024-birth.pdf': 1000, 'big.pdf': 26 * 1024 * 1024 };
  const withFiles: Lookups = { ...look, file: name => (name.toLowerCase() in files ? { path: `s/import/j/${name}`, size: files[name.toLowerCase()] } : null) };
  const r = checkTable(d('documents'), [
    ['admission_no', 'kind', 'file_name', 'issued_on', 'verified'],
    ['A1024', 'Birth certificate', 'A1024-birth.pdf', '12-03-2014', 'Yes'],
    ['A1025', 'transfer_certificate', 'missing.pdf', '', ''],
    ['A1026', 'Aadhaar card', 'big.pdf', '', ''],
    ['A1027', 'Library card', 'A1024-birth.pdf', '', ''],
  ], withFiles, false);
  assert.deepEqual(r.rows.map(x => x.row), [{
    admission_no: 'A1024', kind: 'birth_certificate', title: null, default_title: 'Birth certificate', document_no: null, issued_on: '2014-03-12', valid_until: null,
    verified: true, storage_path: 's/import/j/A1024-birth.pdf', file_name: 'A1024-birth.pdf', size_bytes: 1000,
  }]);
  assert.deepEqual(r.problems.map(p => [p.n, p.column]), [[3, 'file_name'], [4, 'file_name'], [5, 'kind']]);
  assert.match(r.problems[0].error, /wasn.t uploaded/);
});

test('certificates: kind by name or title, numbers kept with their serial, every TC field carried', () => {
  const withTypes: Lookups = { ...look, certTypes: new Map([['tc', { id: 't-tc', kind: 'tc' }], ['transfer certificate', { id: 't-tc', kind: 'tc' }], ['study certificate', { id: 't-st', kind: 'custom' }]]) };
  const r = checkTable(d('certificates'), [
    ['admission_no', 'kind', 'number', 'issued_on', 'duplicate', 'pupil_name', 'father_name', 'conduct', 'body', 'cancelled'],
    ['A001', 'Transfer Certificate', 'TC/0412', '15-04-2024', '', 'Asha Rao', 'Ravi Rao', 'Good', '', ''],
    ['A001', 'TC', 'TC/0412', '20-06-2024', '1', 'Asha Rao', 'Ravi Rao', 'Good', '', ''],
    ['A002', 'Study certificate', '88', '01-07-2024', '', '', '', '', 'This is to certify ...', 'Yes'],
    ['A002', 'Bonafide', 'B/1', '01-07-2024', '', '', '', '', 'x', ''],
    ['A002', 'TC', 'TC/0500', '01-07-2024', '', '', '', '', '', ''],
  ], withTypes, false);
  assert.deepEqual(r.rows.map(x => [x.row.type_id, x.row.number, x.row.serial, x.row.copy_no, x.row.cancelled]), [
    ['t-tc', 'TC/0412', 412, 0, false], ['t-tc', 'TC/0412', 412, 1, false], ['t-st', '88', 88, 0, true],
  ]);
  assert.deepEqual(r.rows[0].row.data, { pupil_name: 'Asha Rao', father_name: 'Ravi Rao', conduct: 'Good', admission_no: 'A001', issued_on: '15-04-2024' });
  assert.deepEqual(r.problems.map(p => [p.n, p.column]), [[5, 'kind'], [6, 'pupil_name']]);
});
