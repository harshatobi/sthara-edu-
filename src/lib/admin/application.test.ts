import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageCheck, ageOn, ageRulesOf, assembleChecks, checkAgeRules, checkForm, completeness, cutoffDate, DEFAULT_AGE_RULES, familyContacts, formOf, gateError,
} from './application';
import { DEFAULT_CHECKLIST } from '@/lib/students/documents';

test('application form: register rules, blanks left out, family and addresses checked', () => {
  const ok = checkForm({
    fields: { gender: 'Female', indian_national: 'yes', social_category: 'sc', mother_tongue: '', previous_tc_no: 'TC/2026/114' },
    address: { line1: '12 MG Road', town: 'Hyderabad', pin: '500001' }, permanent_same: true,
    family: [{ relation: 'mother', name: 'Lakshmi Rao', phone: '+91 98765 43210', is_primary: true }, { relation: 'father', name: 'Ravi Rao' }],
  });
  assert.ok('value' in ok);
  if (!('value' in ok)) return;
  assert.deepEqual(ok.value.fields, { gender: 'female', indian_national: true, social_category: 'sc', previous_tc_no: 'TC/2026/114' }, 'a blank field is not stored');
  assert.equal(ok.value.family[0].phone, '9876543210', 'phones stored as on the register');
  assert.equal(ok.value.permanent_address, null);
  assert.ok('error' in checkForm({ fields: { gender: 'robot' } }));
  assert.ok('error' in checkForm({ address: { town: 'No street' } }), 'an address needs the house and street');
  assert.ok('error' in checkForm({ family: [{ relation: 'mother', name: 'A', is_primary: true }, { relation: 'father', name: 'B', is_primary: true }] }), 'one main contact');
  const outside = checkForm({ fields: { full_name: 'Not here' } });
  assert.ok('value' in outside && !('full_name' in outside.value.fields), 'fields outside the application are ignored');
  const c = completeness(formOf(ok.value), null);
  assert.deepEqual(c.missing, ['Date of birth']);
  assert.ok(completeness(formOf({}), '2020-01-01').missing.includes('A parent or guardian'));
});

test('age for the class on the cut-off date: NEP default, school rules, edges', () => {
  assert.equal(cutoffDate('2027-28', DEFAULT_AGE_RULES), '2027-03-31');
  assert.deepEqual(ageOn('2021-03-31', '2027-03-31'), { years: 6, months: 0 });
  assert.deepEqual(ageOn('2021-04-01', '2027-03-31'), { years: 5, months: 11 });
  assert.equal(ageCheck('2021-03-31', 1, '2027-28', DEFAULT_AGE_RULES).state, 'ok', 'six on the day counts');
  assert.equal(ageCheck('2021-04-01', 1, '2027-28', DEFAULT_AGE_RULES).state, 'young');
  assert.equal(ageCheck('2024-01-10', -2, '2027-28', DEFAULT_AGE_RULES).state, 'ok', 'Nursery at 3');
  assert.equal(ageCheck(null, 5, '2027-28', DEFAULT_AGE_RULES).state, 'unknown');
  const r = checkAgeRules({ cutoff: '06-01', min: { 1: 5 }, max: { 1: 7 } });
  assert.ok('value' in r);
  if (!('value' in r)) return;
  assert.equal(ageCheck('2022-05-01', 1, '2027-28', r.value).state, 'ok', '5 on 1 June under the school rule');
  assert.equal(ageCheck('2019-05-01', 1, '2027-28', r.value).state, 'old');
  assert.equal(ageCheck('2019-07-01', 1, '2027-28', r.value).state, 'ok', '7 years 11 months is within "up to 7"');
  assert.ok('error' in checkAgeRules({ cutoff: '13-01' }));
  assert.ok('error' in checkAgeRules({ cutoff: '03-31', min: { 4: 9 }, max: { 4: 8 } }));
  assert.deepEqual(ageRulesOf({ admissions: { age: { cutoff: 'bad', min: { 1: 6, 99: 3 } } } }), { cutoff: '03-31', min: { 1: 6 }, max: {} }, 'malformed parts dropped');
});

test('checks and stage gates: documents on the checklist, age, sibling matching contacts', () => {
  const form = formOf({ family: [{ relation: 'mother', name: 'M', phone: '9876543210', email: 'M@X.in' }] });
  assert.deepEqual(familyContacts(form, { phone: '+919876543210', email: null }), { phones: ['9876543210'], emails: ['m@x.in'] });
  const docs = [{ kind: 'birth_certificate', status: 'verified' as const, valid_until: null }, { kind: 'aadhaar_card', status: 'awaiting' as const, valid_until: null }];
  const c = assembleChecks({ grade: 1, session: '2027-28', dob: '2021-01-01' }, DEFAULT_AGE_RULES, DEFAULT_CHECKLIST, docs, '2026-10-27', [], []);
  assert.equal(c.age.state, 'ok');
  assert.equal(c.documentsDone, false);
  assert.ok(!c.documents.some(d => d.kind === 'transfer_certificate'), 'no TC for Class 1 by default');
  const g = gateError(['documents', 'age'], c, 'Application');
  assert.match(g!, /Application needs these/);
  assert.match(g!, /aadhaar card/);
  assert.equal(gateError(['age'], c, 'Application'), null);
  const c2 = assembleChecks({ grade: 6, session: '2027-28', dob: '2016-01-01' }, DEFAULT_AGE_RULES, DEFAULT_CHECKLIST, docs, '2026-10-27', [], []);
  assert.ok(c2.documents.some(d => d.kind === 'transfer_certificate' && d.state === 'missing'), 'a TC is needed above the entry classes');
});

test('a stage can require the application fee; a school that charges none has nothing to wait for', () => {
  const base = assembleChecks({ grade: 6, session: '2027-28', dob: '2016-01-01' }, DEFAULT_AGE_RULES, [], [], '2026-10-27', [], []);
  assert.equal(gateError(['fee'], base, 'Application'), null, 'no fee charged');
  const owed = assembleChecks({ grade: 6, session: '2027-28', dob: '2016-01-01' }, DEFAULT_AGE_RULES, [], [], '2026-10-27', [], [], { required: true, paid: false });
  assert.match(gateError(['fee'], owed, 'Application') ?? '', /application fee isn’t recorded/);
  assert.equal(gateError(['fee'], { ...owed, fee: { required: true, paid: true } }, 'Application'), null);
});
