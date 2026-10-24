import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  certNumber, checkPrefix, classFiguresWords, dateWords, DEFAULT_BODY, duesMayBlock, financialYear, numberWords, ordinalWords, pronouns, renderBody,
  serialOf, TC_FIELDS, unknownPlaceholders,
} from './certs';

test('the TC follows Annexure-I: 22 numbered fields in order, mother’s name unnumbered after the pupil', () => {
  const numbered = TC_FIELDS.filter(f => f.n);
  assert.deepEqual(numbered.map(f => f.n), Array.from({ length: 22 }, (_, i) => i + 1));
  assert.equal(TC_FIELDS[1].key, 'mother_name');
  assert.equal(TC_FIELDS[1].n, undefined);
  assert.equal(numbered[21].label, 'Any other remarks');
});

test('figures in words, as a TC writes them', () => {
  assert.equal(numberWords(2014), 'Two Thousand Fourteen');
  assert.equal(numberWords(1999), 'One Thousand Nine Hundred Ninety Nine');
  assert.deepEqual([1, 2, 3, 5, 8, 9, 12, 20, 21, 30].map(ordinalWords), ['First', 'Second', 'Third', 'Fifth', 'Eighth', 'Ninth', 'Twelfth', 'Twentieth', 'Twenty First', 'Thirtieth']);
  assert.equal(dateWords('2010-03-12'), 'Twelfth March Two Thousand Ten');
  assert.equal(dateWords('2009-12-31'), 'Thirty First December Two Thousand Nine');
  assert.equal(dateWords('nope'), '');
  assert.equal(classFiguresWords(8), 'VIII (Eighth)');
  assert.equal(classFiguresWords(-1), 'LKG');
});

test('wording: placeholders filled from the record, unknown ones caught at setup, blanks never invented', () => {
  const v = { student_name: 'Asha Rao', father_name: 'Ravi Rao', ...pronouns('female'), admission_no: 'A1', class: 'Class 7 B', session: '2026-27',
    school_name: 'Vidya Niketan', date_of_birth: '12-03-2014', date_of_birth_words: 'Twelfth March Two Thousand Fourteen', purpose: '' };
  const out = renderBody(DEFAULT_BODY.bonafide, v);
  assert.match(out, /^This is to certify that Asha Rao, daughter of Ravi Rao, is a bonafide student of Vidya Niketan, studying in Class 7 B/);
  assert.match(out, /Her admission number is A1 and her date of birth/);
  assert.match(out, /issued on request for __________\.$/, 'a missing purpose is left as a line to fill');
  assert.deepEqual(unknownPlaceholders(DEFAULT_BODY.bonafide), []);
  assert.deepEqual(unknownPlaceholders(DEFAULT_BODY.character), []);
  assert.deepEqual(unknownPlaceholders('Dear {student_name}, your {blood_group} and {aadhaar}'), ['blood_group', 'aadhaar']);
  assert.equal(pronouns(null).child_of, 'ward of');
});

test('numbers: prefix rules, running serials, imported numbers continue', () => {
  assert.deepEqual(checkPrefix(' tc/ '), { value: 'TC' });
  assert.deepEqual(checkPrefix('VN/TC'), { value: 'VN/TC' });
  assert.ok('error' in checkPrefix('T C'));
  assert.ok('error' in checkPrefix(''));
  assert.equal(certNumber('TC', 7), 'TC/0007');
  assert.equal(certNumber('TC', 12345), 'TC/12345');
  assert.equal(serialOf('TC/0412'), 412);
  assert.equal(serialOf('412'), 412);
  assert.equal(serialOf('2023-24/58 (dup)'), 58);
  assert.equal(serialOf('none'), null);
});

test('dues: never block a TC for Classes 1 to 8 (RTE s.5(3)); block elsewhere', () => {
  assert.deepEqual([-2, -1, 0, 1, 5, 8, 9, 12].map(duesMayBlock), [true, true, true, false, false, false, true, true]);
  assert.equal(duesMayBlock(null), true, 'unknown class: the principal decides');
  assert.deepEqual(financialYear(2025), { from: '2025-04-01', to: '2026-03-31', label: '2025-26' });
});
