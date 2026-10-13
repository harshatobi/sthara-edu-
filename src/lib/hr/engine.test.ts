import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, attention, cleanProfile, cleanStatutory, crossRowProblems, day, jobOn, looseDay, managerLoop, maskStatutory, parseImport,
  planImportRow, postFill, recordGaps, statusOf, tenure, IMPORT_COLUMNS, type DocRow, type Employee, type ExitRow, type Job,
} from './engine';

const TODAY = '2026-10-13';
const emp = (o: Partial<Employee> & { id: string; name: string }): Employee => ({
  userId: null, login: null, email: null, category: 'teaching', designation: 'TGT', employment: 'permanent', contractFrom: null, contractTo: null,
  departmentId: null, gradeId: null, managerId: null, wingId: null, phone: null, whatsappOptIn: false, employeeCode: null, joinedOn: '2024-06-01',
  active: true, probationUntil: null, confirmedOn: null, exitOn: null, ...o,
});
const job = (o: Partial<Job> & { effectiveFrom: string }): Job => ({
  id: o.effectiveFrom, staffMemberId: 'a', action: 'hire', designation: 'TGT', category: 'teaching', departmentId: null, gradeId: null, managerId: null,
  employment: 'permanent', contractFrom: null, contractTo: null, reason: null, authority: null, ...o,
});

test('dates', () => {
  assert.equal(day('2026-02-30'), null);
  assert.equal(day('2026-02-28'), '2026-02-28');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(addMonths('2026-01-15', 6), '2026-07-15');
  assert.equal(tenure('2023-08-20', TODAY), '3 yr 1 mo');
  assert.equal(tenure('2026-10-01', TODAY), '12 days');
  assert.equal(tenure('2026-11-01', TODAY), '');
  assert.equal(looseDay('01/06/2022'), '2022-06-01');
  assert.equal(looseDay('1-6-22'), '2022-06-01');
  assert.equal(looseDay('17 Apr 1988'), '1988-04-17');
  assert.equal(looseDay('2022-06-01 00:00:00'), '2022-06-01');
  assert.equal(looseDay('June'), null);
  assert.equal(looseDay(' '), undefined);
});

test('the job in force on a date is the latest one that had started', () => {
  const jobs = [job({ effectiveFrom: '2024-06-01' }), job({ effectiveFrom: '2026-04-01', action: 'promotion', designation: 'PGT' }), job({ effectiveFrom: '2026-11-01', action: 'transfer', designation: 'HOD' })];
  assert.equal(jobOn(jobs, '2024-05-31'), null);
  assert.equal(jobOn(jobs, '2025-01-01')!.designation, 'TGT');
  assert.equal(jobOn(jobs, TODAY)!.designation, 'PGT');
  assert.equal(jobOn(jobs, '2026-11-01')!.designation, 'HOD');
});

test('lifecycle status', () => {
  const base = { active: true, employment: 'permanent' as const, probationUntil: null, confirmedOn: null };
  assert.equal(statusOf(base, false), 'confirmed');
  assert.equal(statusOf({ ...base, probationUntil: '2026-12-01' }, false), 'probation');
  assert.equal(statusOf({ ...base, probationUntil: '2026-12-01', confirmedOn: '2026-10-01' }, false), 'confirmed');
  assert.equal(statusOf({ ...base, employment: 'visiting' }, false), 'contract');
  assert.equal(statusOf(base, true), 'notice');
  assert.equal(statusOf({ ...base, active: false }, true), 'exited');
});

test('a reporting line can\'t loop', () => {
  const people = [{ id: 'a', managerId: null }, { id: 'b', managerId: 'a' }, { id: 'c', managerId: 'b' }];
  assert.ok(managerLoop(people, 'a', 'c'));
  assert.ok(!managerLoop(people, 'c', 'a'));
  assert.ok(!managerLoop(people, 'a', null));
  // Existing bad data (a cycle that doesn't include the person) doesn't hang.
  assert.ok(!managerLoop([{ id: 'x', managerId: 'y' }, { id: 'y', managerId: 'x' }, { id: 'z', managerId: null }], 'z', 'x'));
});

test('sanctioned posts count only active people, by grade when the post names one', () => {
  const people = [
    { active: true, departmentId: 'sci', gradeId: 'tgt' }, { active: true, departmentId: 'sci', gradeId: 'pgt' },
    { active: false, departmentId: 'sci', gradeId: 'tgt' }, { active: true, departmentId: 'off', gradeId: null },
  ];
  const f = postFill([
    { id: '1', departmentId: 'sci', gradeId: 'tgt', sanctioned: 3, note: null }, { id: '2', departmentId: 'sci', gradeId: null, sanctioned: 2, note: null },
    { id: '3', departmentId: 'off', gradeId: null, sanctioned: 0, note: null },
  ], people);
  assert.deepEqual(f.map(x => [x.filled, x.vacant]), [[1, 2], [2, 0], [1, -1]]);
});

test('statutory details: formats, and the full Aadhaar number is refused', () => {
  const ok = cleanStatutory({ pan: 'abcde 1234 f', uan: '1002 0030 0400', aadhaarLast4: '1234', bankAccount: '50100-123456789', bankIfsc: 'hdfc0001234', bankName: ' HDFC  Bank ' });
  assert.ok('row' in ok);
  assert.deepEqual('row' in ok && [ok.row.pan, ok.row.uan, ok.row.bank_account, ok.row.bank_ifsc, ok.row.bank_name, ok.row.esi_no], ['ABCDE1234F', '100200300400', '50100123456789', 'HDFC0001234', 'HDFC Bank', null]);
  for (const b of [{ pan: 'ABCD1234F' }, { uan: '12345' }, { esiNo: '123' }, { aadhaarLast4: '123412341234' }, { bankAccount: '12AB' }, { bankAccount: '123456789', bankIfsc: 'HDFC1001234' }, { bankAccount: '123456789' }]) {
    assert.ok('error' in cleanStatutory(b), JSON.stringify(b));
  }
  assert.match((cleanStatutory({ aadhaarLast4: '1234 1234 1234' }) as any).error, /never stores the full number/);
  const m = maskStatutory('row' in ok ? ok.row : null)!;
  assert.deepEqual([m.pan, m.bank_account, m.uan, m.aadhaar_last4, m.bank_ifsc], ['••••••234F', '••••••••••6789', '••••••••0400', '1234', 'HDFC0001234']);
  assert.equal(maskStatutory(null), null);
});

test('personal details', () => {
  const ok = cleanProfile({ dateOfBirth: '1988-04-17', gender: 'Female', bloodGroup: 'b+', pincode: '520 001', emergencyPhone: '98989 89898', personalEmail: 'L@Example.com' }, TODAY);
  assert.ok('row' in ok);
  assert.deepEqual('row' in ok && [ok.row.gender, ok.row.blood_group, ok.row.pincode, ok.row.emergency_phone, ok.row.personal_email], ['female', 'B+', '520001', '+919898989898', 'l@example.com']);
  assert.equal(('row' in cleanProfile({ bloodGroup: 'O-' }, TODAY)) && (cleanProfile({ bloodGroup: 'O-' }, TODAY) as any).row.blood_group, 'O-');
  for (const b of [{ dateOfBirth: '2015-01-01' }, { dateOfBirth: 'yesterday' }, { gender: 'x' }, { bloodGroup: 'C+' }, { pincode: '012345' }, { emergencyPhone: '12' }, { personalEmail: 'nope' }]) {
    assert.ok('error' in cleanProfile(b, TODAY), JSON.stringify(b));
  }
});

test('record gaps', () => {
  assert.deepEqual(recordGaps({ joinedOn: null, employeeCode: null }, null, null), ['code', 'joined', 'dob', 'emergency', 'pan', 'bank']);
  assert.deepEqual(recordGaps({ joinedOn: '2024-01-01', employeeCode: 'E1' }, { date_of_birth: '1990-01-01', emergency_phone: '+919999999999' }, { pan: 'ABCDE1234F', bank_account: '123456' }), []);
});

test('attention: what is due, most urgent first', () => {
  const people = [
    emp({ id: 'p1', name: 'Asha', probationUntil: '2026-10-20' }), emp({ id: 'p2', name: 'Bala', probationUntil: '2026-10-01' }),
    emp({ id: 'p3', name: 'Chitra', probationUntil: '2027-03-01' }), emp({ id: 'p4', name: 'Dev', probationUntil: '2026-10-01', confirmedOn: '2026-09-30' }),
    emp({ id: 'c1', name: 'Esha', employment: 'visiting', contractTo: '2026-10-30' }), emp({ id: 'x1', name: 'Farid', userId: 'u1' }),
    emp({ id: 'x2', name: 'Gita', userId: 'u2', active: false }), emp({ id: 'x3', name: 'Hari', active: false }), emp({ id: 'd1', name: 'Indu' }),
  ];
  const exit = (o: Partial<ExitRow> & { id: string; staffMemberId: string }): ExitRow => ({ kind: 'resignation', noticeOn: '2026-09-15', lastDay: '2026-10-10', reason: null, checklist: [{ key: 'a', label: 'A', done: false }], status: 'notice', loginFlaggedAt: null, ...o });
  const doc = (o: Partial<DocRow> & { id: string }): DocRow => ({ staffMemberId: 'd1', kind: 'police_verification', title: 'PV', issuedOn: null, expiresOn: null, hasFile: false, fileName: null, ...o });
  const a = attention({
    today: TODAY, alertDays: 30, people,
    exits: [exit({ id: 'e1', staffMemberId: 'x1' }), exit({ id: 'e2', staffMemberId: 'x2', status: 'completed', loginFlaggedAt: 'x' }), exit({ id: 'e3', staffMemberId: 'x3', status: 'completed' })],
    documents: [doc({ id: 'k1', expiresOn: '2026-10-25' }), doc({ id: 'k2', expiresOn: '2027-06-01' }), doc({ id: 'k3', staffMemberId: 'x3', expiresOn: '2026-10-01' })],
    upcoming: [job({ effectiveFrom: '2026-11-01', staffMemberId: 'p3', action: 'promotion', designation: 'PGT' })],
    gaps: { d1: ['bank', 'pan'], x3: ['bank'] },
  });
  assert.deepEqual(a.map(x => x.key), ['probation:p2', 'exit:e1', 'login:e2', 'probation:p1', 'doc:k1', 'contract:c1', 'job:2026-11-01', 'record:d1']);
  assert.equal(a[0].tone, 'r');
  assert.match(a[0].title, /Bala's probation ended 12 days ago/);
  assert.match(a.find(x => x.key === 'contract:c1')!.title, /ends in 17 days/);
  assert.match(a.find(x => x.key === 'record:d1')!.detail, /bank account, PAN/);
});

test('import: headers, matching and validation', () => {
  const header = IMPORT_COLUMNS.map(c => c[1]);
  const blank = () => header.map(() => '');
  const row = (o: Record<string, string>) => { const r = blank(); for (const [k, v] of Object.entries(o)) r[IMPORT_COLUMNS.findIndex(c => c[0] === k)] = v; return r; };
  const parsed = parseImport([[...header, 'Shoe size'], [...row({ name: 'Lakshmi Devi', category: 'Support', joinedOn: '01/06/2022', pan: 'abcde1234f', bankAccount: '50100123456789', bankIfsc: 'HDFC0001234', department: 'Housekeeping' }), '6'], blank()]);
  assert.equal(parsed.rows.length, 1);
  assert.match(parsed.problems[0], /Ignored column: Shoe size/);
  assert.equal(parseImport([['DOJ', 'Emp Code', 'full name'], ['2022-06-01', 'E1', 'X']]).rows[0].joinedOn, '2022-06-01');
  assert.equal(parseImport([['Email'], ['a@b.c']]).rows.length, 0);

  const people = [{ id: '1', name: 'Priya Sharma', email: 'priya@s.in', employeeCode: 'E-1' }, { id: '2', name: 'Ravi Kumar', email: null, employeeCode: null }, { id: '3', name: 'Ravi  kumar', email: null, employeeCode: null }];
  const ctx = { today: TODAY, people, departments: ['Science'], grades: ['TGT'] };
  const created = planImportRow(parsed.rows[0], ctx);
  assert.equal(created.match, null);
  assert.deepEqual(created.problems, []);
  assert.deepEqual([created.core.category, created.core.joinedOn, created.statutory?.pan, created.profile], ['support', '2022-06-01', 'ABCDE1234F', null]);
  assert.deepEqual(created.notes, ['New department: Housekeeping']);

  const p = (o: Record<string, string>) => planImportRow({ line: '2', ...o } as any, ctx);
  assert.deepEqual(p({ name: 'Someone Else', employeeCode: 'e-1' }).match, { id: '1', how: 'code' });
  assert.deepEqual(p({ name: 'P', email: 'PRIYA@s.in' }).match, { id: '1', how: 'email' });
  assert.deepEqual(p({ name: 'priya sharma' }).match, { id: '1', how: 'name' });
  assert.match(p({ name: 'Ravi Kumar' }).problems[0], /2 people are called Ravi Kumar/);
  assert.match(p({ name: 'New', email: 'new@s.in', category: 'teaching' }).problems[0], /Logins are created by Sthara/);
  assert.match(p({ name: 'New' }).problems[0], /needs a category/);
  assert.match(p({ name: 'New', category: 'support', employment: 'visiting' }).problems[0], /needs a contract end date/);
  assert.match(p({ name: 'New', category: 'support', joinedOn: '2027-01-01' }).problems[0], /in the future/);
  assert.match(p({ name: 'New', category: 'support', aadhaarLast4: '123412341234' }).problems[0], /last four digits/);
  assert.match(p({ name: 'New', category: 'janitor' }).problems[0], /isn't one of/);
  assert.match(p({ name: 'New', category: 'support', dateOfBirth: 'soon' }).problems[0], /isn't a date/);

  const twice = [p({ name: 'priya sharma' }), { ...p({ name: 'P', email: 'priya@s.in' }), line: '3' }, { ...p({ name: 'A', category: 'support', employeeCode: 'N1' }), line: '4' }, { ...p({ name: 'B', category: 'support', employeeCode: 'n1' }), line: '5' }];
  crossRowProblems(twice);
  assert.match(twice[1].problems[0], /same person as row 2/);
  assert.match(twice[3].problems[0], /Row 4 uses the same employee code/);
});
