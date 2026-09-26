import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalLabel, journalValue } from './journal';

test('labels: human names, raw key for unknowns, no inherited properties', () => {
  assert.equal(journalLabel('platform', 'onboarding.self_serve'), 'Self-serve school sign-up');
  assert.equal(journalLabel('school', 'pricePerStudent'), 'Price per student');
  assert.equal(journalLabel('school', 'made_up'), 'made_up');
  // Keys that are Object.prototype members must not resolve to functions.
  assert.equal(journalLabel('school', 'constructor'), 'constructor');
  assert.equal(journalLabel('platform', 'toString'), 'toString');
});

test('platform values: enum labels, units, and the default when nothing was stored', () => {
  assert.equal(journalValue('platform', 'notice.tone', 'critical'), 'Incident');
  assert.equal(journalValue('platform', 'trial.default_days', 45), '45 days');
  assert.equal(journalValue('platform', 'ai.enabled', false), 'Off');
  assert.equal(journalValue('platform', 'onboarding.self_serve', null), 'On (default)');
  assert.equal(journalValue('platform', 'notice.message', ''), 'Empty');
});

test('school values: tiers (including old names), status, price, seats, dates', () => {
  assert.equal(journalValue('school', 'plan', 'shikhara'), 'Shikhara');
  assert.equal(journalValue('school', 'plan', 'trial'), 'Paid pilot');
  assert.equal(journalValue('school', 'plan', 'standard'), 'Sthamba');
  assert.equal(journalValue('school', 'active', 'suspended'), 'Suspended');
  assert.equal(journalValue('school', 'active', 'active'), 'Active');
  assert.equal(journalValue('school', 'pricePerStudent', null), 'List price');
  assert.equal(journalValue('school', 'pricePerStudent', 3500), '₹3,500 / student / yr');
  assert.equal(journalValue('school', 'contractStudents', 1200), '1,200 students');
  assert.equal(journalValue('school', 'trialEndsAt', '2027-09-23T18:29:59.000Z'), '23 Sept 2027');
  assert.equal(journalValue('school', 'curriculum', null), 'None');
  assert.equal(journalValue('school', 'aiEnabled', false), 'Off');
});

test('deletions read as events with a snapshot of what was removed', () => {
  assert.equal(journalLabel('platform', 'school.deleted'), 'School deleted');
  assert.equal(journalLabel('school', 'account.deleted'), 'Account deleted');
  assert.equal(journalValue('platform', 'school.deleted', { name: 'Old School', code: 'OLD', accounts: 7 }), 'Old School (OLD), 7 accounts');
  assert.equal(journalValue('platform', 'school.deleted', null), 'Deleted');
  assert.equal(journalValue('school', 'account.deleted', { name: 'Riya', role: 'teacher', email: 'riya@x.in' }), 'Riya (teacher), riya@x.in');
});
