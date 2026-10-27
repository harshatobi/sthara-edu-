import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkContact, duplicateMap, duplicatesOf, followUps, nameKey, optCommand, renderMessage, sameChild } from './crm';

test('contacts: a call says how it went, a note has words, follow-ups are not in the past', () => {
  const today = '2026-10-27';
  assert.ok('error' in checkContact({ kind: 'call' }, today), 'a call needs an outcome');
  assert.ok('error' in checkContact({ kind: 'fax' }, today));
  assert.ok('error' in checkContact({ kind: 'note', note: '  ' }, today));
  assert.ok('error' in checkContact({ kind: 'visit', followUpOn: '2026-10-26' }, today), 'no follow-up in the past');
  const ok = checkContact({ kind: 'call', outcome: 'callback', note: ' after 6 pm ', followUpOn: '2026-10-28' }, today);
  assert.ok('value' in ok);
  if ('value' in ok) assert.deepEqual(ok.value, { kind: 'call', direction: 'out', outcome: 'callback', note: 'after 6 pm', follow_up_on: '2026-10-28' });
  const note = checkContact({ kind: 'note', note: 'Prefers Telugu' }, today);
  assert.ok('value' in note && note.value.direction === null);
});

test('follow-up queue: overdue, today, upcoming, no date, nobody owning', () => {
  const a = (id: string, followUpOn: string | null, ownerId: string | null = 'u1', open = true) => ({ id, name: id, open, ownerId, followUpOn });
  const q = followUps([a('late', '2026-10-20'), a('now', '2026-10-27'), a('soon', '2026-11-02'), a('none', null), a('free', null, null), a('shut', '2026-10-01', 'u1', false)], '2026-10-27');
  assert.deepEqual(q.overdue.map(x => x.id), ['late'], 'a closed applicant is never due');
  assert.deepEqual(q.today.map(x => x.id), ['now']);
  assert.deepEqual(q.upcoming.map(x => x.id), ['soon']);
  assert.deepEqual(q.unset.map(x => x.id), ['none', 'free']);
  assert.deepEqual(q.unowned.map(x => x.id), ['free']);
  assert.deepEqual(followUps([a('x', '2026-10-01', 'u2'), a('y', '2026-10-01')], '2026-10-27', 'u1').overdue.map(x => x.id), ['y'], 'my queue only');
});

test('duplicates: same child twice, not a sibling', () => {
  const base = { id: 'a', name: 'Aarav  Sharma', dob: null as string | null, guardianPhone: '+91 98765 43210', guardianEmail: null as string | null };
  assert.equal(nameKey('Aarav. SHARMA '), 'aarav sharma');
  assert.equal(sameChild(base, { ...base, id: 'b', name: 'aarav sharma', guardianPhone: '09876543210' }), 'same name and phone');
  assert.equal(sameChild(base, { ...base, id: 'b', name: 'Diya Sharma' }), null, 'same phone, another child: a sibling');
  assert.equal(sameChild({ ...base, dob: '2019-05-01', guardianPhone: null }, { ...base, id: 'b', dob: '2019-05-01', guardianPhone: null }), 'same name and date of birth');
  assert.equal(sameChild({ ...base, guardianPhone: null, guardianEmail: 'A@x.in' }, { ...base, id: 'b', guardianPhone: null, guardianEmail: 'a@x.in' }), 'same name and email');
  assert.equal(sameChild({ ...base, guardianPhone: null }, { ...base, id: 'b', guardianPhone: null }), null, 'a common name alone is not enough');
  assert.equal(sameChild(base, base), null);
  const list = [base, { ...base, id: 'b' }, { ...base, id: 'c', name: 'Diya' }];
  assert.deepEqual([...duplicateMap(list).keys()].sort(), ['a', 'b']);
  assert.deepEqual(duplicatesOf({ ...base, id: 'new' }, list).map(m => m.id), ['a', 'b']);
});

test('stage messages are filled in and say how to stop them; STOP and START', () => {
  const m = renderMessage('Dear parent, {child} is at {stage} with {school}. {child}!', { child: 'Asha', school: 'Vidya', stage: 'Interview' });
  assert.match(m, /^Dear parent, Asha is at Interview with Vidya\. Asha!/);
  assert.match(m, /Reply STOP/);
  assert.equal(optCommand(' stop '), 'stop');
  assert.equal(optCommand('Unsubscribe'), 'stop');
  assert.equal(optCommand('START'), 'start');
  assert.equal(optCommand('stop by tomorrow'), null);
});
