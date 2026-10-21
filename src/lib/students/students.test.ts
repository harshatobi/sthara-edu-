import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskAadhaar, parseAadhaar, verhoeff } from './aadhaar';
import { aadhaarHash, openAadhaar, sealAadhaar } from './pii';
import {
  addressLine, admissionFormat, checkAddress, checkAdmissionNo, checkFamily, checkField, checkFields, checkProposal, cleanPhone, currentSession, FIELD, parseGrade, parseOutcome, rollRuleOf, sectionOf, sessionFor,
} from './register';
import { blocked, classProgress, nextClassName, stageOf, type ChainRow } from './outcomes';
import { checkTable } from '@/lib/import/engine';
import { datasetOf, type Lookups } from '@/lib/import/datasets';

// The Verhoeff check digit for 11 digits, so the tests can make valid numbers.
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
function withCheck(body: string) {
  let c = 0;
  body.split('').reverse().map(Number).forEach((d, i) => { c = D[c][P[(i + 1) % 8][d]]; });
  return body + INV[c];
}
const VALID = withCheck('23456789012');

test('aadhaar: check digit, cleaning and the numbers that are refused', () => {
  assert.ok(verhoeff(VALID));
  assert.deepEqual(parseAadhaar(`${VALID.slice(0, 4)} ${VALID.slice(4, 8)}-${VALID.slice(8)}`), { ok: true, digits: VALID });
  const wrongCheck = VALID.slice(0, 11) + ((Number(VALID[11]) + 1) % 10);
  assert.equal(parseAadhaar(wrongCheck).ok, false);
  assert.equal(parseAadhaar('12345').ok, false);
  assert.match((parseAadhaar(withCheck('12345678901')) as { error: string }).error, /never starts with 0 or 1/);
  assert.match((parseAadhaar('999999999999') as { error: string }).error, /No Aadhaar/);
  assert.equal(maskAadhaar('1234'), 'XXXX XXXX 1234');
  assert.equal(maskAadhaar(null), null);
});

test('aadhaar: sealed with the key, opened back, the hash stable and keyed', () => {
  const before = process.env.STUDENT_PII_KEY;
  process.env.STUDENT_PII_KEY = 'a'.repeat(64);
  try {
    const a = sealAadhaar(VALID), b = sealAadhaar(VALID);
    assert.notEqual(a.aadhaar_cipher, b.aadhaar_cipher, 'a fresh IV every time');
    assert.equal(a.aadhaar_hash, b.aadhaar_hash, 'the hash finds repeats');
    assert.equal(a.aadhaar_last4, VALID.slice(-4));
    assert.equal(openAadhaar(a.aadhaar_cipher), VALID);
    assert.ok(!a.aadhaar_cipher.includes(VALID));
    const tampered = a.aadhaar_cipher.slice(0, -2) + (a.aadhaar_cipher.endsWith('A') ? 'BB' : 'AA');
    assert.throws(() => openAadhaar(tampered));
    const h = aadhaarHash(VALID);
    process.env.STUDENT_PII_KEY = 'b'.repeat(64);
    assert.notEqual(aadhaarHash(VALID), h, 'another key, another hash');
    assert.throws(() => openAadhaar(a.aadhaar_cipher), 'another key cannot open it');
    delete process.env.STUDENT_PII_KEY;
    assert.throws(() => sealAadhaar(VALID), /STUDENT_PII_KEY/);
  } finally {
    if (before === undefined) delete process.env.STUDENT_PII_KEY; else process.env.STUDENT_PII_KEY = before;
  }
});

test('register fields: each kind checked and cleaned', () => {
  assert.deepEqual(checkField(FIELD.get('full_name')!, '  Aarav   Sharma '), { value: 'Aarav Sharma' });
  assert.ok('error' in checkField(FIELD.get('full_name')!, ''));
  assert.deepEqual(checkField(FIELD.get('gender')!, 'Female'), { value: 'female' });
  assert.ok('error' in checkField(FIELD.get('gender')!, 'other'));
  assert.deepEqual(checkField(FIELD.get('previous_status')!, 'Anganwadi / ECCE centre'), { value: 'anganwadi_ecce' });
  assert.deepEqual(checkField(FIELD.get('pen')!, '1234 5678 901'), { value: '12345678901' });
  assert.ok('error' in checkField(FIELD.get('apaar_id')!, '1234'));
  assert.ok('error' in checkField(FIELD.get('date_of_birth')!, '2012-02-30'));
  assert.deepEqual(checkField(FIELD.get('admitted_grade')!, 'LKG'), { value: -1 });
  assert.deepEqual(checkField(FIELD.get('rte_amount')!, '₹12,500'), { value: 12500 });
  assert.deepEqual(checkField(FIELD.get('rte_seat')!, 'Yes'), { value: true });
  assert.deepEqual(checkField(FIELD.get('aadhaar_name')!, ''), { value: null });
  const { errors } = checkFields({ full_name: 'X', rte_amount: 100, rte_seat: false, date_of_birth: '2015-01-01', admitted_on: '2014-01-01', nonsense: 'ignored' }, { creating: true });
  assert.deepEqual(Object.keys(errors).sort(), ['admitted_on', 'rte_amount']);
  assert.ok(checkFields({}, { creating: true }).errors.full_name);
  assert.ok('error' in checkAdmissionNo('a;drop'));
  assert.deepEqual(checkAdmissionNo(' VN/2024/0012 '), { value: 'VN/2024/0012' });
});

test('grades, sections and outcomes as schools write them', () => {
  assert.equal(parseGrade('Class XII'), 12);
  assert.equal(parseGrade('UKG'), 0);
  assert.equal(parseGrade('nursery'), -2);
  assert.equal(parseGrade('13'), null);
  assert.equal(sectionOf('Class 10-A'), 'A');
  assert.equal(sectionOf('9 b'), 'B');
  assert.equal(sectionOf('Class 10'), null);
  assert.equal(parseOutcome('Pass'), 'promoted');
  assert.equal(parseOutcome('Repeater by choice'), 'repeater');
  assert.equal(parseOutcome('TC'), 'left');
  assert.equal(parseOutcome('maybe'), null);
});

test('sessions follow the school start month', () => {
  assert.equal(sessionFor(new Date(2026, 2, 31)), '2025-26');
  assert.equal(sessionFor(new Date(2026, 3, 1)), '2026-27');
  assert.equal(sessionFor(new Date(2026, 5, 15), 6), '2026-27');
  assert.equal(sessionFor(new Date(2026, 4, 31), 6), '2025-26');
  assert.equal(currentSession({ session: { current: '2027-28' } }, new Date(2026, 9, 1)), '2027-28', 'an opened session wins');
  assert.equal(currentSession({}, new Date(2026, 9, 1)), '2026-27');
  assert.deepEqual(admissionFormat({ admission: { prefix: 'VN/', pad: 5 } }), { prefix: 'VN/', pad: 5 });
  assert.deepEqual(admissionFormat({ admission: { pad: 40 } }), { prefix: '', pad: 4 });
  assert.equal(rollRuleOf({ rollRule: 'manual' }), 'manual');
  assert.equal(rollRuleOf({ rollRule: 'random' }), 'alphabetical');
});

const row = (o: Partial<ChainRow> = {}): ChainRow => ({ proposed_outcome: null, proposed_at: null, approved_at: null, returned_note: null, outcome: null, finalised_at: null, published_at: null, ends_on: null, ...o });

test('year-end chain: each step only from the stage before it', () => {
  const open = row(), proposed = row({ proposed_outcome: 'promoted', proposed_at: 't' }), returned = row({ ...proposed, returned_note: 'check marks' });
  const approved = row({ ...proposed, approved_at: 't' }), final = row({ ...approved, outcome: 'promoted', finalised_at: 't' });
  const promoted = row({ ...final, ends_on: '2027-03-31' }), published = row({ ...promoted, published_at: 't' });
  assert.deepEqual([open, proposed, returned, approved, final, promoted, published].map(stageOf), ['open', 'proposed', 'returned', 'approved', 'final', 'promoted', 'published']);
  assert.equal(blocked('propose', returned), null, 'a returned outcome can be proposed again');
  assert.ok(blocked('propose', approved));
  assert.ok(blocked('approve', open));
  assert.equal(blocked('approve', proposed), null);
  assert.ok(blocked('finalise', proposed), 'the registrar waits for the principal');
  assert.equal(blocked('finalise', approved), null);
  assert.ok(blocked('finalise', promoted));
  assert.equal(blocked('reopen', final), null);
  assert.ok(blocked('reopen', promoted));
  const p = classProgress([final, final, promoted]);
  assert.ok(p.allFinal && !p.allPromoted && p.allApproved);
  assert.ok(!classProgress([]).allFinal, 'an empty class is never done');
  assert.ok(!classProgress([proposed, returned]).allProposed);
});

test('next class name keeps the school naming', () => {
  assert.equal(nextClassName('Class 9-B'), 'Class 10-B');
  assert.equal(nextClassName('10A'), '11A');
  assert.equal(nextClassName('Class 12-C'), null);
  assert.equal(nextClassName('LKG'), null);
});

const look: Lookups = { students: new Map(), classes: new Map(), sheets: new Map() };

test('register import: fields checked, Aadhaar validated, repeats refused', () => {
  const r = checkTable(datasetOf('students')!, [
    ['admission_no', 'name', 'gender', 'dob', 'aadhaar', 'pen', 'admitted_class', 'rte', 'rte_amount'],
    ['VN/001', 'Aarav Sharma', 'M', '14-08-2012', VALID, '12345678901', 'LKG', 'yes', '12000'],
    ['VN/002', 'Diya', 'girl', '', '123412341234', '', '', '', ''],
    ['vn/001', 'Again', '', '', '', '', '', '', ''],
    ['VN/003', '', 'f', '', '', '123', 'XIII', 'no', '500'],
  ], look, false);
  assert.deepEqual(r.rows[0].row, {
    admission_no: 'VN/001', full_name: 'Aarav Sharma', date_of_birth: '2012-08-14', pen: '12345678901', rte_amount: 12000, gender: 'male',
    rte_seat: true, admitted_grade: -1, aadhaar: VALID,
  });
  assert.deepEqual(r.problems.map(p => [p.n, p.column ?? null]), [[3, 'aadhaar'], [4, null], [5, 'pen'], [5, 'admitted_class'], [5, 'rte_amount']]);
});

test('enrolment import: past years with outcomes, the class built from grade and section', () => {
  const r = checkTable(datasetOf('enrolments')!, [
    ['admission_no', 'session', 'class', 'section', 'roll_no', 'outcome', 'first_language'],
    ['VN/001', '2023-24', 'VI', 'b', '7', 'Passed', 'English'],
    ['VN/001', '2024-25', '7', '', '', 'TC', ''],
    ['VN/002', '2024-25', 'Class 13', '', '', 'maybe', ''],
  ], look, false);
  assert.deepEqual(r.rows.map(x => x.row), [
    { admission_no: 'VN/001', session: '2023-24', grade: 6, section: 'B', class_name: '6-B', roll_no: '7', stream: null, languages: { first: 'English' }, outcome: 'promoted' },
    { admission_no: 'VN/001', session: '2024-25', grade: 7, section: null, class_name: '7', roll_no: null, stream: null, languages: null, outcome: 'left' },
  ]);
  assert.deepEqual(r.problems.map(p => p.column), ['class', 'outcome']);
});

test('addresses: house and street first, PIN six digits, blank is nothing', () => {
  assert.deepEqual(checkAddress({ line1: ' 12  MG Road ', town: 'Hyderabad', pin: '500001' }), { value: { line1: '12 MG Road', locality: null, town: 'Hyderabad', district: null, state: null, pin: '500001' } });
  assert.deepEqual(checkAddress({ line1: '', pin: '' }), { value: null });
  assert.ok('error' in checkAddress({ town: 'Hyderabad' }), 'no house and street');
  assert.ok('error' in checkAddress({ line1: 'x', pin: '050001' }));
  assert.equal(addressLine({ line1: '12 MG Road', town: 'Hyderabad', state: 'Telangana', pin: '500001' }), '12 MG Road, Hyderabad, Telangana 500001');
});

test('family members: phones cleaned to 10 digits, relation and education from the lists', () => {
  assert.equal(cleanPhone('+91 98765 43210'), '9876543210');
  assert.equal(cleanPhone('09876543210'), '9876543210');
  assert.equal(cleanPhone('12345'), null);
  assert.equal(cleanPhone('+44 7911 123456'), '+447911123456');
  const ok = checkFamily({ relation: 'Mother', name: ' Lakshmi ', phone: '98765-43210', email: 'L@X.IN', education: 'graduate', annual_income: '₹3,00,000' });
  assert.deepEqual(ok, { value: { relation: 'mother', name: 'Lakshmi', phone: '9876543210', email: 'l@x.in', education: 'graduate', occupation: null, annual_income: 300000, is_primary: false, lives_with: true } });
  assert.ok('error' in checkFamily({ relation: 'cousin', name: 'X' }));
  assert.ok('error' in checkFamily({ relation: 'father', name: 'X', phone: '123' }));
  assert.ok('error' in checkFamily({ relation: 'father', name: 'X', education: 'phd' }));
});

test('parent proposals are checked as the office would', () => {
  assert.deepEqual(checkProposal('address', { address: { line1: '1 Main St', pin: '500001' } }), { value: { address: { line1: '1 Main St', locality: null, town: null, district: null, state: null, pin: '500001' }, permanent_same: true, permanent_address: null } });
  assert.ok('error' in checkProposal('address', { address: { line1: '1 Main St', pin: '1' } }));
  const fam = checkProposal('family', { relation: 'father', name: 'Ravi', is_primary: true });
  assert.ok('value' in fam && fam.value.is_primary === false, 'a parent cannot make themselves the primary contact');
  assert.ok('error' in checkProposal('emergency', { list: 'nope' }));
});

test('family import: relations and education as written, blank flags leave what is stored', () => {
  const r = checkTable(datasetOf('family')!, [
    ['admission_no', 'relation', 'name', 'mobile', 'education', 'primary', 'emergency', 'family_code'],
    ['VN/001', 'Mom', 'Lakshmi', '+91 98765 43210', '12th', 'yes', '1', 'SH-1'],
    ['VN/001', 'Dad', 'Ravi', '', 'PG', '', '4', ''],
    ['VN/001', 'mother', 'lakshmi', '', '', '', '', ''],
  ], look, false);
  assert.deepEqual(r.rows[0].row, { admission_no: 'VN/001', relation: 'mother', name: 'Lakshmi', phone: '9876543210', email: null, education: 'higher_secondary', occupation: null,
    annual_income: null, is_primary: true, lives_with: null, emergency: 1, family_code: 'SH-1' });
  assert.deepEqual(r.problems.map(p => [p.n, p.column ?? null]), [[3, 'emergency'], [4, null]]);
});

test('register import: background and both addresses', () => {
  const r = checkTable(datasetOf('students')!, [
    ['admission_no', 'name', 'category', 'religion', 'bpl', 'address_line1', 'address_pin', 'permanent_line1', 'permanent_town'],
    ['VN/001', 'Aarav', 'OBC', 'Hindu', 'yes', '12 MG Road', '500001', 'Plot 4', 'Warangal'],
    ['VN/002', 'Diya', 'general', '', '', '', '123', '', ''],
  ], look, false);
  assert.deepEqual(r.rows[0].row.address, { line1: '12 MG Road', locality: null, town: null, district: null, state: null, pin: '500001' });
  assert.equal(r.rows[0].row.permanent_same, false);
  assert.equal(r.rows[0].row.social_category, 'obc');
  assert.equal(r.rows[0].row.bpl, true);
  assert.deepEqual(r.problems.map(p => p.column), ['address_line1']);
});
