import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessCodeFrom, applyPath, CODE_ALPHABET, codeHint, familyCanEdit, familyCanSend, familyStatus, normaliseAccessCode, onlineOf } from './familyAccess';

test('access codes: Crockford letters, typed loosely, read back exactly', () => {
  const code = accessCodeFrom(new Uint8Array([0, 1, 2, 31, 32, 63, 200, 255]));
  assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.ok([...code.replace('-', '')].every(c => CODE_ALPHABET.includes(c)));
  assert.equal(normaliseAccessCode(code), code.replace('-', ''));
  assert.equal(normaliseAccessCode(' k7qm 4xpa '), 'K7QM4XPA', 'case and spaces do not matter');
  assert.equal(normaliseAccessCode('K7QM-4XPO'), 'K7QM4XP0', 'O read as zero');
  assert.equal(normaliseAccessCode('il00-0000'), '11000000', 'I and L read as one');
  assert.equal(normaliseAccessCode('K7QM-4XP'), null, 'too short');
  assert.equal(normaliseAccessCode('K7QM-4XPU'), null, 'U is not in the alphabet');
  assert.equal(normaliseAccessCode(42), null);
  assert.equal(codeHint('K7QM4XPA'), 'PA');
  assert.throws(() => accessCodeFrom(new Uint8Array(4)));
});

test('online applications are closed unless the school opened them', () => {
  assert.deepEqual(onlineOf(null), { open: false, enquiries: false, note: null });
  assert.deepEqual(onlineOf({ admissions: { online: { open: 'yes' } } }), { open: false, enquiries: false, note: null });
  assert.deepEqual(onlineOf({ admissions: { online: { open: true, note: '  Bring originals on the visit.  ' } } }), { open: true, enquiries: false, note: 'Bring originals on the visit.' });
  assert.equal(onlineOf({ admissions: { online: { enquiries: true } } }).enquiries, true, 'enquiries open on their own');
  assert.equal(applyPath('VNSS'), '/apply/vnss');
});

test('what the family sees of where the application stands', () => {
  const base = { stage: 'enquiry', submitted_at: null as string | null, channel: 'online', student_id: null as string | null };
  const own = { label: 'Interview', system: null };
  assert.equal(familyStatus(base, own).key, 'draft');
  assert.equal(familyStatus({ ...base, channel: 'office' }, own).key, 'review', 'an office applicant is never a draft');
  const sent = familyStatus({ ...base, submitted_at: '2026-10-27T10:00:00Z' }, own);
  assert.equal(sent.key, 'review');
  assert.match(sent.detail, /Interview/);
  assert.equal(familyStatus({ ...base, stage: 'offer' }, { label: 'Offer', system: 'offer' }).key, 'offer');
  assert.equal(familyStatus({ ...base, stage: 'enrolled' }, { label: 'Enrolled', system: 'enrolled' }).key, 'admitted');
  assert.equal(familyStatus({ ...base, student_id: 'x' }, own).key, 'admitted');
  assert.equal(familyStatus({ ...base, stage: 'rejected' }, null).key, 'closed');
  assert.equal(familyStatus({ ...base, stage: 'withdrawn' }, null).label, 'Withdrawn');
});

test('the family edits the details only while it is a draft', () => {
  assert.equal(familyCanEdit({ submitted_at: null, stage: 'enquiry', student_id: null }), true);
  assert.equal(familyCanEdit({ submitted_at: '2026-10-27', stage: 'enquiry', student_id: null }), false);
  assert.equal(familyCanEdit({ submitted_at: null, stage: 'withdrawn', student_id: null }), false);
  assert.equal(familyCanEdit({ submitted_at: null, stage: 'enquiry', student_id: 's' }), false);
  assert.equal(familyCanEdit({ submitted_at: null, stage: 'offer', student_id: null }, 'offer'), false, 'not under an offer');
  assert.equal(familyCanSend({ stage: 'offer', student_id: null }), true, 'documents can still come at an offer');
  assert.equal(familyCanSend({ stage: 'enquiry', student_id: 's' }), false);
});

test('today in India, whatever clock the server runs on', async () => {
  const { indiaDay } = await import('./format');
  assert.equal(indiaDay(new Date('2026-10-27T18:29:00Z')), '2026-10-27');
  assert.equal(indiaDay(new Date('2026-10-27T18:31:00Z')), '2026-10-28', 'past midnight IST while it is still the 27th in UTC');
});
