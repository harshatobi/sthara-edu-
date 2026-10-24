import test from 'node:test';
import assert from 'node:assert/strict';
import { Access } from '@/lib/admin/rbac';
import { normClass } from '@/lib/teacher/scope';
import { emptyRows, officeLens, parentLens, sessionOfDay, shapeTimeline, studentLens, teacherLens, timelineText, yearEvents, type Rows } from './rules';

const rows = (over: Partial<Rows> = {}): Rows => emptyRows({
  student: { previousSchool: 'Little Flower School', previousClass: 'Class 5', previousTcNo: 'TC/22/118', previousStatus: 'other_school', admittedOn: '2025-06-02' },
  enrolments: [
    { session: '2025-26', class_name: 'Class 6-A', roll_no: '12', starts_on: '2025-06-02', ends_on: null, end_reason: null, outcome: 'promoted', published_at: '2026-03-28T10:00:00Z' },
    { session: '2026-27', class_name: 'Class 7-A', roll_no: '11', starts_on: '2026-04-01', ends_on: null, end_reason: null, outcome: null, published_at: null },
  ],
  attendance: {
    months: [{ month: '2025-07', present: 20, absent: 2, late: 1, excused: 0, marked: 23 }, { month: '2026-07', present: 18, absent: 4, late: 1, excused: 0, marked: 23 }],
    runs: [{ from: '2026-07-09', to: '2026-07-13', days: 3 }],
  },
  cards: [{
    session: '2025-26', publishedAt: '2026-03-25T09:00:00Z', term: { name: 'Annual', seq: 2 }, aggregate: { pct: 81, grade: 'A2' }, result: { status: 'pass' },
    subjects: [{ name: 'Mathematics', final: { pct: 74, grade: 'B1' }, terms: [] }, { name: 'Science', final: { pct: 88, grade: 'A2' }, terms: [] }],
  }],
  tml: [
    { subject: 'Mathematics', topic_name: 'Fractions', score: 60, computed_at: '2025-09-10T00:00:00Z' },
    { subject: 'Mathematics', topic_name: 'Fractions', score: 70, computed_at: '2026-01-10T00:00:00Z' },
    { subject: 'Science', topic_name: 'Light', score: 90, computed_at: '2026-08-10T00:00:00Z' },
  ],
  work: [
    { id: 'w1', subject: 'Mathematics', title: 'Fractions 1', due_date: '2026-07-10', created_at: '2026-07-01T00:00:00Z' },
    { id: 'w2', subject: 'Science', title: 'Light 1', due_date: '2026-07-12', created_at: '2026-07-01T00:00:00Z' },
    { id: 'w3', subject: 'Science', title: 'Not due yet', due_date: '2026-11-30', created_at: '2026-10-20T00:00:00Z' },
  ],
  subs: [{ assignment_id: 'w1', score: 8, max_score: 10, teacher_approved: true, submitted_at: '2026-07-09T00:00:00Z' }],
  invoices: [{ id: 'i1', session: '2026-27', amount: 30000, concession: 5000 }],
  payments: [{ invoice_id: 'i1', amount: 10000, paid_on: '2026-06-15', receipt_no: 'R-0041' }],
  kirti: [{ on_date: '2026-08-15', title: 'Inter-school quiz', category: 'academic', level: 'district', position: 'first', position_note: null }],
  certificates: [{ issued_on: '2026-09-01', number: 'BF/2026/9', title: 'Bonafide certificate' }],
  documents: [{ kind: 'birth_certificate', title: null, on: '2025-06-03' }],
  health: [{ kind: 'checkup', on_date: '2026-07-20' }],
  discipline: [
    { kind: 'warning', on_date: '2025-11-03', until_date: null, reason: 'Phone in class', status: 'approved', session: '2025-26' },
    { kind: 'suspension', on_date: '2026-09-02', until_date: '2026-09-04', reason: 'Fighting', status: 'approved', session: '2026-27' },
    { kind: 'detention', on_date: '2026-10-01', until_date: null, reason: 'Late', status: 'proposed', session: '2026-27' },
  ],
  incidents: [{ occurred_at: '2026-09-01T10:00:00Z', category: 'bullying', summary: 'Name-calling at lunch' }, { occurred_at: '2026-09-05T10:00:00Z', category: 'child_protection', summary: 'SECRET' }],
  counselling: [{ opened_on: '2026-09-10', closed_on: null, status: 'open' }],
  wellness: [{ created_at: '2026-09-11T08:00:00Z', mood: 'Low', energy: 2 }, { created_at: '2026-09-12T08:00:00Z', mood: 'Good', energy: 4 }],
  ...over,
});

const all = (t: ReturnType<typeof shapeTimeline>, rs: Rows, lens: Parameters<typeof yearEvents>[1]) => t.years.flatMap(y => yearEvents(rs, lens, y.session));
const text = (x: unknown) => JSON.stringify(x);

test('sessions follow the school’s start month', () => {
  assert.equal(sessionOfDay('2026-03-31'), '2025-26');
  assert.equal(sessionOfDay('2026-04-01'), '2026-27');
  assert.equal(sessionOfDay('2026-05-15', 6), '2025-26');
  assert.equal(sessionOfDay('2026-06-01T08:00:00Z', 6), '2026-27');
});

test('office: each source follows its permission; child protection never appears', () => {
  assert.equal(officeLens(new Access(['cashier'])), null, 'no register, counselling or health access: no timeline');
  assert.equal(officeLens(new Access(['hr_manager'])), null);
  const accountant = officeLens(new Access(['accountant']))!;
  assert.ok(accountant.sources.includes('fees'));
  for (const s of ['tml', 'results', 'health', 'discipline', 'counselling', 'wellness', 'incidents'] as const) assert.ok(!accountant.sources.includes(s), s);
  const registrar = officeLens(new Access(['registrar']))!;
  assert.ok(registrar.sources.includes('kirti') && registrar.sources.includes('discipline') && registrar.archive);
  assert.ok(!registrar.sources.includes('fees') && !registrar.sources.includes('tml') && !registrar.sources.includes('health') && !registrar.sources.includes('wellness'));
  const principal = officeLens(new Access(['principal']))!;
  for (const s of ['attendance', 'results', 'tml', 'homework', 'fees', 'health', 'discipline', 'incidents', 'counselling', 'wellness'] as const) assert.ok(principal.sources.includes(s), s);
  const admin = officeLens(new Access(['school_admin']))!;
  assert.ok(admin.sources.includes('counselling') && !admin.sources.includes('wellness'), 'school admin: counselling overview, not wellness');
  const r = rows();
  const t = shapeTimeline(r, principal);
  assert.ok(!text(all(t, r, principal)).includes('SECRET'));
  assert.equal(t.years[0].incidents, 1);
});

test('office: the registrar sees last year’s warning in the archive; the vice principal doesn’t', () => {
  const r = rows();
  const reg = officeLens(new Access(['registrar']))!;
  const vp = officeLens(new Access(['vice_principal']))!;
  assert.equal(shapeTimeline(r, reg).years.find(y => y.session === '2025-26')!.discipline, 1);
  assert.equal(shapeTimeline(r, vp).years.find(y => y.session === '2025-26')!.discipline, 0);
  // Proposed actions are never on the timeline.
  assert.equal(shapeTimeline(r, reg).years[0].discipline, 1);
});

test('teachers: class teacher sees the teaching side; a subject teacher only attendance and their subject', () => {
  const ct = teacherLens({ teacherClass: 'Class 7-A', scope: [] }, '7A', normClass)!;
  assert.equal(ct.who, 'class_teacher');
  const r = rows();
  const ctT = shapeTimeline(r, ct);
  assert.equal(ctT.before, null);
  assert.equal(ctT.years[0].fees, undefined);
  assert.equal(ctT.years[0].discipline, 1);

  const maths = teacherLens({ teacherClass: 'Class 9-B', scope: [{ cls: 'Class 7-A', subject: 'Mathematics' }] }, 'Class 7-A', normClass)!;
  assert.equal(maths.who, 'subject_teacher');
  const t = shapeTimeline(r, maths);
  const last = t.years.find(y => y.session === '2025-26')!;
  assert.deepEqual(last.results!.subjects.map(s => s.name), ['Mathematics']);
  assert.equal(last.results!.pct, null, 'no whole-card aggregate for a subject teacher');
  assert.deepEqual(last.tml!.subjects.map(s => s.subject), ['Mathematics']);
  assert.equal(t.years[0].homework!.set, 1);
  assert.equal(t.years[0].discipline, undefined);
  const ev = text(all(t, r, maths));
  assert.ok(!ev.includes('Science') && !ev.includes('Fighting') && !ev.includes('Kirti') && !ev.includes('quiz'));

  assert.equal(teacherLens({ teacherClass: null, scope: [{ cls: 'Class 8-A', subject: 'Mathematics' }] }, 'Class 7-A', normClass), null);
});

test('parent: family-facing sources; never counselling, wellness or incidents; no archived warnings', () => {
  const r = rows();
  const lens = parentLens();
  const t = shapeTimeline(r, lens);
  assert.ok(t.before && t.before.school === 'Little Flower School');
  assert.equal(t.years[0].counselling, undefined);
  assert.equal(t.years[0].wellness, undefined);
  assert.equal(t.years[0].incidents, undefined);
  assert.deepEqual(t.years[0].fees, { billed: 25000, paid: 10000, due: 15000 });
  assert.equal(t.years.find(y => y.session === '2025-26')!.discipline, 0, 'last year’s warning has left the record');
  const ev = text(all(t, r, lens));
  assert.ok(ev.includes('Suspension') && !ev.includes('Phone in class') && !ev.includes('Name-calling') && !ev.includes('Counselling') && !ev.includes('Wellbeing'));
  assert.ok(lens.print);
});

test('student: no fees or discipline; wellness is theirs; no printing', () => {
  const r = rows();
  const lens = studentLens();
  const t = shapeTimeline(r, lens);
  assert.equal(t.years[0].fees, undefined);
  assert.equal(t.years[0].discipline, undefined);
  assert.deepEqual(t.years[0].wellness, { checkins: 2, low: 1 });
  assert.ok(!text(all(t, r, lens)).includes('Fees') && !lens.print);
});

test('the summary: attendance %, TML at each year’s end, homework only once due, results and outcome', () => {
  const r = rows();
  const t = shapeTimeline(r, officeLens(new Access(['principal']))!);
  assert.deepEqual(t.years.map(y => y.session), ['2026-27', '2025-26']);
  const [now, last] = t.years;
  assert.deepEqual(now.attendance, { pct: 83, marked: 23, absent: 4 });
  assert.equal(last.outcome, 'Promoted');
  assert.equal(last.results!.pct, 81);
  assert.equal(last.tml!.score, 70, 'the January snapshot is the year-end one');
  assert.equal(now.tml!.score, 80, 'this year: Maths 70 carried, Science 90');
  assert.deepEqual(now.homework, { set: 2, done: 1, avg: 80 });
  assert.equal(now.counselling, 'Ongoing');
});

test('events: monthly attendance, the 3-day absence, homework months, report card, newest first', () => {
  const r = rows();
  const lens = officeLens(new Access(['principal']))!;
  const ev = yearEvents(r, lens, '2026-27');
  assert.ok(ev.some(e => e.title === 'Absent 3 school days in a row'));
  assert.ok(ev.some(e => e.title === 'Attendance in July 2026: 83%' && e.tone === 'a'));
  assert.ok(ev.some(e => e.title === 'Homework in July 2026: 1 of 2 handed in'));
  assert.ok(ev.some(e => e.title === 'Bonafide certificate issued' && e.detail === 'No. BF/2026/9'));
  assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].on >= e.on));
  const lastYear = yearEvents(r, lens, '2025-26');
  assert.ok(lastYear.some(e => e.title === 'Report card: Annual' && e.detail === '81% · A2'));
  assert.ok(lastYear.some(e => e.title === 'Year result: Promoted'));
});

test('the AI text carries no names and stays inside the lens', () => {
  const r = rows();
  const parent = timelineText(shapeTimeline(r, parentLens()));
  assert.ok(parent.includes('2026-27') && parent.includes('fees billed'));
  assert.ok(!parent.includes('counselling') && !parent.includes('wellbeing') && !parent.includes('SECRET'));
  const maths = teacherLens({ teacherClass: null, scope: [{ cls: 'Class 7-A', subject: 'Mathematics' }] }, 'Class 7-A', normClass)!;
  const tt = timelineText(shapeTimeline(r, maths));
  assert.ok(!tt.includes('Science') && !tt.includes('fees'));
});
