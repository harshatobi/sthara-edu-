import test from 'node:test';
import assert from 'node:assert/strict';
import { approverPerm, archived, checkAction, checkCpStep, checkNote, checkReferral, cpState, parentLine, parentSees } from './rules';

const today = '2026-10-24';

test('actions: a suspension needs its last day; warnings are not set in the future', () => {
  assert.ok('error' in checkAction({ kind: 'suspension', onDate: '2026-10-26', reason: 'Fighting in class' }, today));
  assert.ok('error' in checkAction({ kind: 'warning', onDate: '2026-10-25', reason: 'Late again' }, today));
  assert.ok('error' in checkAction({ kind: 'detention', onDate: '2026-10-24', untilDate: '2026-10-20', reason: 'Late again' }, today));
  assert.ok('error' in checkAction({ kind: 'suspension', onDate: '2026-10-01', untilDate: '2026-12-31', reason: 'Long' }, today));
  assert.ok('error' in checkAction({ kind: 'warning', onDate: today, reason: 'x' }, today));
  const s = checkAction({ kind: 'suspension', onDate: '2026-10-26', untilDate: '2026-10-28', reason: '  Fighting   in class ' }, today);
  assert.ok('value' in s && s.value.reason === 'Fighting in class' && s.value.until_date === '2026-10-28');
  // A warning has no end date even if one is sent.
  const w = checkAction({ kind: 'warning', onDate: today, untilDate: '2026-10-30', reason: 'Phone in class' }, today);
  assert.ok('value' in w && w.value.until_date === null);
});

test('a suspension is the principal’s; the rest the VP or principal', () => {
  assert.equal(approverPerm('suspension'), 'discipline.suspend');
  assert.equal(approverPerm('warning'), 'discipline.approve');
  assert.equal(approverPerm('parent_meeting'), 'discipline.approve');
});

test('warnings and detentions leave the record at the next session; suspensions and meetings stay', () => {
  assert.equal(archived({ kind: 'warning', session: '2025-26' }, '2026-27'), true);
  assert.equal(archived({ kind: 'detention', session: '2025-26' }, '2026-27'), true);
  assert.equal(archived({ kind: 'warning', session: '2026-27' }, '2026-27'), false);
  assert.equal(archived({ kind: 'suspension', session: '2024-25' }, '2026-27'), false);
  assert.equal(archived({ kind: 'parent_meeting', session: '2024-25' }, '2026-27'), false);
});

test('parents see approved actions only, and not archived ones', () => {
  assert.equal(parentSees({ kind: 'warning', status: 'proposed', session: '2026-27' }, '2026-27'), false);
  assert.equal(parentSees({ kind: 'warning', status: 'returned', session: '2026-27' }, '2026-27'), false);
  assert.equal(parentSees({ kind: 'warning', status: 'approved', session: '2026-27' }, '2026-27'), true);
  assert.equal(parentSees({ kind: 'warning', status: 'approved', session: '2025-26' }, '2026-27'), false);
  assert.equal(parentSees({ kind: 'suspension', status: 'approved', session: '2025-26' }, '2026-27'), true);
  assert.equal(parentSees({ kind: 'suspension', status: 'cancelled', session: '2026-27' }, '2026-27'), false);
  assert.equal(parentLine({ kind: 'suspension', on_date: '2026-10-26', until_date: '2026-10-28', reason: 'Fighting' }, d => d), 'Suspension, 2026-10-26 to 2026-10-28: Fighting');
});

test('referrals and notes', () => {
  assert.ok('error' in checkReferral({ reason: 'sad' }));
  assert.ok('reason' in checkReferral({ reason: 'Has seemed withdrawn for two weeks and stopped eating lunch.' }));
  assert.ok('error' in checkNote({ onDate: '2026-10-25', notes: 'Talked' }, today));
  assert.ok('notes' in checkNote({ onDate: today, notes: 'Talked about exams.' }, today));
});

test('child protection: the case nudges until a report is recorded', () => {
  assert.ok(cpState([{ kind: 'note' }]).nudge);
  assert.equal(cpState([{ kind: 'note' }, { kind: 'reported_police' }]).nudge, null);
  assert.equal(cpState([{ kind: 'reported_cwc' }, { kind: 'closed' }]).closed, true);
  assert.ok('error' in checkCpStep({ kind: 'closed', onDate: today, details: 'done' }, today));
  assert.ok('error' in checkCpStep({ kind: 'note', onDate: today }, today));
  const r = checkCpStep({ kind: 'reported_police', onDate: today, ref: ' FIR 123/2026 ' }, today);
  assert.ok('kind' in r && r.ref === 'FIR 123/2026');
});

test('counselling notes and child-protection details are sealed: a fresh IV, opened back, tamper and wrong key refused', async () => {
  const { openText, sealText } = await import('@/lib/students/pii');
  const before = process.env.STUDENT_PII_KEY;
  process.env.STUDENT_PII_KEY = 'c'.repeat(64);
  try {
    const note = 'Talked about home. Will see her again Thursday.';
    const a = sealText(note), b = sealText(note);
    assert.ok(a.startsWith('v1:') && a !== b && !a.includes('home'));
    assert.equal(openText(a), note);
    assert.throws(() => openText(a.slice(0, -2) + (a.endsWith('A') ? 'BB' : 'AA')));
    process.env.STUDENT_PII_KEY = 'd'.repeat(64);
    assert.throws(() => openText(a));
  } finally {
    if (before === undefined) delete process.env.STUDENT_PII_KEY; else process.env.STUDENT_PII_KEY = before;
  }
});
