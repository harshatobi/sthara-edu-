import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeFamily, type FamilyRows } from './family';
import { probeFamily } from './probe';
import { parseAskReply, restore, tokenize, toWhatsAppText, type NameBook } from './ask';
import { toE164 } from '../whatsapp/config';

const NOW = new Date('2026-09-25T10:00:00Z').getTime();
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function rows(over: Partial<FamilyRows> = {}): FamilyRows {
  return {
    parent: { id: 'p1', name: 'Rekha Sharma' },
    schoolName: 'Test School',
    links: [{ student_id: 's1', relationship: 'mother' }],
    students: [{ id: 's1', name: 'Aarav Sharma', student_class: 'Class 10-A', custom_student_id: '10A-01' }],
    teachers: [
      { id: 't1', name: 'Ms Iyer', teacher_class: 'Class 10-A', assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }] },
      { id: 't2', name: 'Mr Rao', teacher_class: 'Class 9-B', assignments: [{ class: 'Class 10-A', subject: 'Science' }, { class: 'Class 9-B', subject: 'Science' }] },
    ],
    assignments: [
      { id: 'a1', title: 'Quadratics HW', type: 'homework', subject: 'Mathematics', class: 'Class 10-A', due_date: day(-3).slice(0, 10), status: 'published', teacher_id: 't1', created_at: day(-10), units: ['Quadratic Equations'] },
      { id: 'a2', title: 'Light quiz', type: 'quiz', subject: 'Science', class: 'Class 10-A', due_date: day(1).slice(0, 10), status: 'published', teacher_id: 't2', created_at: day(-2) },
      { id: 'a3', title: 'Draft', type: 'homework', subject: 'Mathematics', class: 'Class 10-A', due_date: day(2).slice(0, 10), status: 'draft', teacher_id: 't1', created_at: day(-1) },
      { id: 'a4', title: 'Only for Diya', type: 'homework', subject: 'Mathematics', class: 'Class 10-A', due_date: day(2).slice(0, 10), status: 'published', teacher_id: 't1', created_at: day(-1), assigned_student_ids: ['s2'] },
      { id: 'a5', title: 'Polynomials', type: 'homework', subject: 'Mathematics', class: 'Class 10-A', due_date: day(-8).slice(0, 10), status: 'published', teacher_id: 't1', created_at: day(-12) },
    ],
    submissions: [{ id: 'x5', assignment_id: 'a5', student_id: 's1', score: 6, max_score: 10, teacher_approved: true, submitted_at: day(-6), teacher_note: 'Check signs' }],
    tml: [
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Quadratic Equations', score: 30, confidence_band: 'provisional', components: { homework: { score: 20 }, quiz: { score: 40 } }, item_count: 3, computed_at: day(-1) },
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Quadratic Equations', score: 55, confidence_band: 'provisional', components: {}, item_count: 2, computed_at: day(-30) },
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Polynomials', score: 92, confidence_band: 'firm', components: {}, item_count: 6, computed_at: day(-2) },
    ],
    wellness: [{ student_id: 's1', energy: 1, created_at: day(-1) }, { student_id: 's1', energy: 2, created_at: day(-2) }, { student_id: 's1', energy: 2, created_at: day(-3) }, { student_id: 's1', energy: 4, created_at: day(-20) }],
    consents: [{ student_id: 's1', consent_type: 'wellness_checkin', granted: true }],
    invoices: [{ id: 'i1', student_id: 's1', instalment_no: 1, label: 'Term 1', invoice_no: 'INV-1', due_on: day(-5).slice(0, 10), amount: 20000, concession: 0 }],
    payments: [{ id: 'r1', invoice_id: 'i1', student_id: 's1', amount: 5000, mode: 'upi', paid_on: day(-4).slice(0, 10), receipt_no: 'RCT-1', recorded_at: day(-4) }],
    threads: [{ id: 'th1', student_id: 's1', subject: 'Maths help', topic: 'academics', audience: 'teacher', staff_id: 't1', status: 'open', last_message_at: day(-1), parent_read_at: day(-2) }],
    lastMessages: [{ thread_id: 'th1', sender_role: 'teacher', body: 'Happy to meet Friday', created_at: day(-1) }],
    notices: [],
    whatsapp: { mode: 'simulated', businessNumber: null, linked: false, phone: null, optedIn: false, pending: false, prefs: {} },
    ...over,
  };
}

test('family shaping: work states, targeting, drafts hidden', () => {
  const v = shapeFamily(rows(), NOW);
  const c = v.children[0];
  const byId = Object.fromEntries(c.work.map(w => [w.id, w]));
  assert.equal(byId.a1.state, 'overdue');
  assert.equal(byId.a2.state, 'todo');
  assert.equal(byId.a5.state, 'graded');
  assert.equal(byId.a5.pct, 60);
  assert.equal(byId.a5.note, 'Check signs');
  assert.ok(!byId.a3, 'drafts are never shown to parents');
  assert.ok(!byId.a4, 'work targeted at other students is not shown');
});

test('family shaping: mastery uses the latest snapshot per chapter, trend vs three weeks ago', () => {
  const c = shapeFamily(rows(), NOW).children[0];
  const maths = c.subjects.find(s => s.subject === 'Mathematics')!;
  assert.equal(maths.chapters.find(ch => ch.name === 'Quadratic Equations')!.score, 30);
  assert.equal(maths.score, 61); // mean(30, 92)
  assert.equal(maths.was, 55);   // only Quadratics had evidence 21+ days ago
  assert.equal(maths.delta, -25, 'like-for-like: the new 92% chapter does not hide the drop');
  assert.equal(maths.teacher?.id, 't1');
  assert.equal(c.classTeacher?.id, 't1');
  assert.deepEqual(c.teachers.map(t => t.id), ['t1', 't2']);
});

test('family shaping: wellness only with consent, fees net of payments', () => {
  const c = shapeFamily(rows(), NOW).children[0];
  assert.equal(c.wellness.checkins, 3); // the 20-day-old check-in is outside the window
  assert.equal(c.wellness.lowDays, 3);
  assert.equal(c.fees.outstanding, 15000);
  assert.equal(c.fees.overdue, 15000);
  const noConsent = shapeFamily(rows({ consents: [] }), NOW).children[0];
  assert.equal(noConsent.wellness.consented, false);
  assert.equal(noConsent.wellness.checkins, 0);
});

test('probe: severe gap, overdue work, low energy, fees, unread reply', () => {
  const v = shapeFamily(rows(), NOW);
  const f = probeFamily(v, NOW);
  const ids = f.map(x => x.id);
  for (const id of ['gap:s1:Mathematics', 'overdue:s1', 'energy:s1', 'fees:s1', 'msg:s1', 'strong:s1', 'trend:s1:Mathematics']) assert.ok(ids.includes(id), id);
  assert.ok(f[0].severity >= f[f.length - 1].severity, 'sorted by severity');
  const gap = f.find(x => x.id === 'gap:s1:Mathematics')!;
  assert.equal(gap.tone, 'r');
  assert.equal(gap.contact?.to?.id, 't1');
  assert.equal(f.find(x => x.id === 'fees:s1')!.contact?.audience, 'office');
});

const book: NameBook = {
  children: new Map([['C1', { id: 's1', name: 'Aarav Sharma', first: 'Aarav' }]]),
  staff: new Map([['T1', { id: 't1', name: 'Ms Iyer' }]]),
};

test('names are tokens on the way out and restored on the way back', () => {
  assert.equal(tokenize('Aarav Sharma and Aarav met Ms Iyer', book), '[[C1]] and [[C1]] met [[T1]]');
  assert.equal(restore('[[C1]] should see [[T1]]', book), 'Aarav should see Ms Iyer');
});

test('parseAskReply resolves message targets and drops unknown ones', () => {
  const r = restore(parseAskReply({
    say: 'Hi', facts: [{ label: 'TML', value: '30%', tone: 'r' }, { label: '', value: 'x' }],
    ask: [{ question: 'Which?', options: ['A'] }],
    actions: [
      { kind: 'message', to: '[[T1]]', child: '[[C1]]', topic: 'academics', subject: 'Help', draft: 'Dear [[T1]], about [[C1]]' },
      { kind: 'message', to: '[[T9]]', draft: 'nobody' },
      { kind: 'message', to: 'office', topic: 'nonsense', draft: 'fees?' },
      { kind: 'open', page: 'fees', label: 'Fees' },
      { kind: 'open', page: 'admin', label: 'x' },
    ],
  }, book), book);
  assert.equal(r.facts.length, 1);
  assert.equal(r.ask.length, 0, 'a question needs two options');
  assert.equal(r.actions.length, 3);
  const [m, office] = r.actions as any[];
  assert.equal(m.to, 't1'); assert.equal(m.childId, 's1'); assert.equal(m.toName, 'Ms Iyer'); assert.equal(m.draft, 'Dear Ms Iyer, about Aarav');
  assert.equal(office.audience, 'office'); assert.equal(office.topic, 'general'); assert.equal(office.childId, 's1');
});

test('WhatsApp text: numbered options and SEND prompt', () => {
  const { text, options } = toWhatsAppText({
    say: '**Aarav** is behind on:\n- Quadratics', ask: [], facts: [{ label: 'Overdue', value: '1', tone: 'r' }],
    actions: [{ kind: 'message', audience: 'teacher', to: 't1', toName: 'Ms Iyer', childId: 's1', topic: 'homework', subject: 'Late', draft: 'Sorry it is late' }],
    suggestions: ['What is due?', 'How can I help?'],
  });
  assert.match(text, /\*Aarav\* is behind on:\n• Quadratics/);
  assert.match(text, /Reply \*SEND\*/);
  assert.match(text, /1\. What is due\?\n2\. How can I help\?/);
  assert.deepEqual(options, ['What is due?', 'How can I help?']);
});

test('phone numbers normalise to E.164', () => {
  assert.equal(toE164('98765 43210'), '+919876543210');
  assert.equal(toE164('+44 7700 900123'), '+447700900123');
  assert.equal(toE164('0091-98765-43210'), '+919876543210');
  assert.equal(toE164('12'), null);
  assert.equal(toE164(undefined), null);
});
