import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStaffCommand, resolveRegister } from './commands';
import { emptyBook, parseStaffReply, personToken, restore, tokenize, toWhatsAppText } from './ask';

test('staff commands', () => {
  assert.deepEqual(parseStaffCommand('stop'), { kind: 'stop' });
  assert.deepEqual(parseStaffCommand('TODAY'), { kind: 'today' });
  assert.deepEqual(parseStaffCommand('ack'), { kind: 'ack', note: '' });
  assert.deepEqual(parseStaffCommand('ACK spoke to him, all fine'), { kind: 'ack', note: 'spoke to him, all fine' });
  assert.deepEqual(parseStaffCommand('Done - called the parent'), { kind: 'ack', note: 'called the parent' });
  assert.deepEqual(parseStaffCommand('R Thank you, I will look into it'), { kind: 'reply', text: 'Thank you, I will look into it' });
  assert.deepEqual(parseStaffCommand('reply: yes, Friday works'), { kind: 'reply', text: 'yes, Friday works' });
  assert.deepEqual(parseStaffCommand('send'), { kind: 'send' });
  assert.deepEqual(parseStaffCommand('2'), { kind: 'option', n: 2 });
  assert.deepEqual(parseStaffCommand('ABSENT 4, 12, 17'), { kind: 'register', absent: ['4', '12', '17'], late: [], excused: [] });
  assert.deepEqual(parseStaffCommand('absent 4 12 late 7 leave 9'), { kind: 'register', absent: ['4', '12'], late: ['7'], excused: ['9'] });
  assert.deepEqual(parseStaffCommand('All present'), { kind: 'register', absent: [], late: [], excused: [] });
  // Questions are not registers.
  assert.equal(parseStaffCommand('absent students this week?').kind, 'ask');
  assert.equal(parseStaffCommand('absent today').kind, 'ask');
  assert.equal(parseStaffCommand('Late submissions for 10A').kind, 'ask');
  assert.equal(parseStaffCommand('Who needs help in Class 9?').kind, 'ask');
  assert.equal(parseStaffCommand('Rahul is doing well').kind, 'ask', 'a sentence starting with R is not a reply command');
});

test('register references: roll number, position, unique first name', () => {
  const roster = [
    { id: 'a', name: 'Asha Rao', rollNo: '1' }, { id: 'b', name: 'Ravi Kumar', rollNo: '2' }, { id: 'c', name: 'Ravi Shah', rollNo: '12' },
  ];
  assert.equal(parseStaffCommand('absent Asha').kind, 'ask', 'registers take roll numbers');
  const r = resolveRegister(roster, { absent: ['12', 'asha'], late: [], excused: [] });
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.marks, [{ studentId: 'a', status: 'absent' }, { studentId: 'b', status: 'present' }, { studentId: 'c', status: 'absent' }]);
  assert.deepEqual(resolveRegister(roster, { absent: ['ravi', '40'], late: [], excused: [] }).unknown, ['ravi', '40'], 'ambiguous name and unknown roll are refused');
  // Without roll numbers, numbers are register positions.
  const noRolls = roster.map(s => ({ ...s, rollNo: '' }));
  assert.equal(resolveRegister(noRolls, { absent: ['2'], late: [], excused: [] }).named[0].id, 'b');
  // Roll numbers with a prefix still match the bare number.
  assert.equal(resolveRegister([{ id: 'x', name: 'Mira', rollNo: '10A-04' }], { absent: ['4'], late: [], excused: [] }).named[0]?.id, 'x');
});

test('staff ask protocol: tokens, targets, WhatsApp text', () => {
  const book = emptyBook();
  const s1 = personToken(book, 'S', 'stu1', 'Asha Rao');
  assert.equal(s1, '[[S1]]');
  assert.equal(personToken(book, 'S', 'stu1', 'Asha Rao'), '[[S1]]', 'same person, same token');
  personToken(book, 'P', 'par1', 'Meena Rao');
  assert.equal(tokenize('Asha Rao and Asha were absent; Meena Rao called', book), '[[S1]] and [[S1]] were absent; [[P1]] called');
  book.threads.set('M1', { id: 'thr1', label: 'Meena Rao (about Asha)', subject: 'Homework' });
  book.items.set('F1', { id: 'sit1', title: 'Asha absent 3 days' });
  const reply = restore(parseStaffReply({
    say: '[[S1]] needs a call.', actions: [
      { kind: 'reply', thread: '[[M1]]', draft: 'Thanks, [[P1]].' },
      { kind: 'reply', thread: '[[M9]]', draft: 'unknown thread dropped' },
      { kind: 'ack', item: '[[F1]]', note: 'called home' },
      { kind: 'open', page: 'feed' }, { kind: 'open', page: 'nope' },
    ], suggestions: ['What else?'],
  }, book, 'teacher'), book);
  assert.equal(reply.say, 'Asha Rao needs a call.');
  assert.equal(reply.actions.length, 3);
  assert.deepEqual(reply.actions[0], { kind: 'reply', threadId: 'thr1', toName: 'Meena Rao (about Asha)', subject: 'Homework', draft: 'Thanks, Meena Rao.' });
  assert.equal(reply.actions[2].kind === 'open' && reply.actions[2].href, '/teacher/feed');
  const wa = toWhatsAppText(reply);
  assert.match(wa.text, /Reply \*SEND\*/);
  assert.deepEqual(wa.options, ['What else?']);
});

test('a teacher reporting themselves absent is not a class register', () => {
  assert.deepEqual(parseStaffCommand('ABSENT'), { kind: 'self_absent', portion: 'full' });
  assert.deepEqual(parseStaffCommand("I'm absent today"), { kind: 'self_absent', portion: 'full' });
  assert.equal(parseStaffCommand('absent today').kind, 'ask', 'still a question');
  assert.deepEqual(parseStaffCommand('sick'), { kind: 'self_absent', portion: 'full' });
  assert.deepEqual(parseStaffCommand('absent am'), { kind: 'self_absent', portion: 'am' });
  assert.deepEqual(parseStaffCommand('Absent - afternoon'), { kind: 'self_absent', portion: 'pm' });
  assert.equal(parseStaffCommand('ABSENT 4, 12').kind, 'register', 'roll numbers are a register');
  assert.equal(parseStaffCommand('who is absent today?').kind, 'ask');
});
