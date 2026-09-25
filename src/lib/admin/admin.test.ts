import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, gradeOf, inr, inrShort, isSession, nextSession, sessionOf, toCsv } from './format';
import { assembleLedger, evenSchedule, reminderTone, shapeInvoice, validateSchedule } from './fees';
import { assemblePipeline, canMove, nextStage } from './admissions';
import { assembleAdminDesk, auditSummary, bandOf, energyPct, tmlAsOf, type AdminRows } from './desk';

const NOW = new Date('2026-09-24T10:00:00+05:30').getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

test('sessions run April to March', () => {
  assert.equal(sessionOf(new Date('2026-04-01T00:00:00')), '2026-27');
  assert.equal(sessionOf(new Date('2027-03-31T23:00:00')), '2026-27');
  assert.equal(sessionOf(new Date('2026-03-31T12:00:00')), '2025-26');
  assert.equal(nextSession('2026-27'), '2027-28');
  assert.equal(nextSession('2099-00'), '2100-01');
  assert.ok(isSession('2026-27'));
  assert.ok(!isSession('2026-28'));
});

test('grades parse like app.grade_of', () => {
  assert.equal(gradeOf('Class 10-A'), 10);
  assert.equal(gradeOf('10a'), 10);
  assert.equal(gradeOf('Grade 9'), 9);
  assert.equal(gradeOf('Nursery'), null);
});

test('money formats in the Indian system', () => {
  assert.equal(inr(120000), '₹1,20,000');
  assert.equal(inr(60000.5), '₹60,000.50');
  assert.equal(inrShort(1840000), '₹18.4 L');
  assert.equal(inrShort(12500000), '₹1.25 Cr');
  assert.equal(inrShort(42000), '₹42,000');
  assert.equal(daysBetween('2026-09-01', '2026-09-24'), 23);
});

test('CSV quotes cells and defuses spreadsheet formulas', () => {
  assert.equal(toCsv([['a', '=SUM(A1)', 3, null], ['he said "hi"', -5]]), '"a","\'=SUM(A1)","3",""\r\n"he said ""hi""","-5"');
});

test('schedules must sum to 100% and run in order within the session', () => {
  const s = evenSchedule(3, '2026-27');
  assert.equal(s.length, 3);
  assert.equal(Math.round(s.reduce((a, b) => a + b.share, 0) * 10000), 10000);
  assert.equal(validateSchedule(s, '2026-27'), null);
  assert.equal(validateSchedule(evenSchedule(4, '2026-27'), '2026-27'), null);
  assert.equal(validateSchedule(evenSchedule(12, '2026-27'), '2026-27'), null);
  assert.match(validateSchedule([{ no: 1, label: 'T1', dueOn: '2026-04-10', share: 0.6 }], '2026-27')!, /60%/);
  assert.match(validateSchedule([{ no: 1, label: 'T1', dueOn: '2027-04-10', share: 1 }], '2026-27')!, /outside/);
  assert.match(validateSchedule([
    { no: 1, label: 'T1', dueOn: '2026-10-10', share: 0.5 }, { no: 2, label: 'T2', dueOn: '2026-04-10', share: 0.5 },
  ], '2026-27')!, /after instalment 1/);
});

test('invoice balance comes from live receipts; voided receipts free the balance', () => {
  const inv = { id: 'i1', student_id: 's1', instalment_no: 1, label: 'Term 1', invoice_no: 'INV/1', due_on: '2026-09-01', amount: '60000', concession: '5000', concession_reason: 'Sibling' };
  const r = (id: string, amount: number, voided = false) => ({ id, invoiceId: 'i1', studentId: 's1', amount, mode: 'upi', reference: null, paidOn: '2026-09-10', receiptNo: id, recordedAt: '', voided, voidReason: voided ? 'bounced' : null });
  const a = shapeInvoice(inv, [r('p1', 20000), r('p2', 30000, true)], '2026-09-24');
  assert.equal(a.paid, 20000);
  assert.equal(a.balance, 35000);
  assert.equal(a.status, 'overdue');
  assert.equal(a.daysOverdue, 23);
  const b = shapeInvoice(inv, [r('p1', 55000)], '2026-09-24');
  assert.equal(b.status, 'paid');
  assert.equal(b.daysOverdue, 0);
  const c = shapeInvoice({ ...inv, due_on: '2026-10-01' }, [r('p1', 10)], '2026-09-24');
  assert.equal(c.status, 'partial');
  assert.equal(shapeInvoice({ ...inv, voided_at: 'x', void_reason: 'dup' }, [], '2026-09-24').balance, 0);
});

test('reminder tone follows history and escalates', () => {
  assert.equal(reminderTone(5, { late: 0, settled: 3 }, 0), 'gentle');
  assert.equal(reminderTone(5, { late: 2, settled: 3 }, 0), 'firm');
  assert.equal(reminderTone(45, { late: 0, settled: 0 }, 0), 'firm');
  assert.equal(reminderTone(5, { late: 0, settled: 0 }, 1), 'firm');
  assert.equal(reminderTone(75, { late: 0, settled: 5 }, 0), 'final');
  assert.equal(reminderTone(3, { late: 0, settled: 0 }, 3), 'final');
});

test('ledger totals, ageing and instalment runs', () => {
  const schedule = [{ no: 1, label: 'Term 1', due_on: '2026-04-10', share: 0.5 }, { no: 2, label: 'Term 2', due_on: '2026-10-10', share: 0.5 }];
  const L = assembleLedger({
    session: '2026-27', today: '2026-09-24',
    students: [{ id: 'a', name: 'Aarav', cls: 'Class 10-A' }, { id: 'b', name: 'Diya', cls: 'Class 10-A' }, { id: 'c', name: 'Kabir', cls: 'Class 9-B' }],
    structures: [{ id: 'fs', grade: 10, annual_fee: 100000, schedule }],
    invoices: [
      { id: 'i1', student_id: 'a', instalment_no: 1, label: 'Term 1', invoice_no: 'INV/1', due_on: '2026-04-10', amount: 50000, concession: 0 },
      { id: 'i2', student_id: 'b', instalment_no: 1, label: 'Term 1', invoice_no: 'INV/2', due_on: '2026-04-10', amount: 50000, concession: 0 },
    ],
    payments: [{ id: 'p1', invoice_id: 'i1', student_id: 'a', amount: 50000, mode: 'upi', paid_on: '2026-04-20', receipt_no: 'RCT/1', recorded_at: '2026-04-20T10:00:00Z' }],
    reminders: [],
  });
  assert.equal(L.totals.billed, 100000);
  assert.equal(L.totals.collected, 50000);
  assert.equal(L.totals.outstanding, 50000);
  assert.equal(L.totals.overdue, 50000);
  assert.equal(L.totals.collectionRate, 50);
  assert.equal(L.totals.familiesOverdue, 1);
  assert.equal(L.totals.avgDaysLate, 10);
  assert.equal(L.totals.expectedAnnual, 200000);
  assert.equal(L.ageing.find(b => b.key === '90+')!.amount, 50000, 'Diya is 167 days overdue');
  assert.deepEqual(L.runs.map(r => [r.no, r.eligible, r.raised]), [[1, 2, 2], [2, 2, 0]]);
  assert.deepEqual(L.grades.map(g => [g.grade, g.students, !!g.structure]), [[9, 1, false], [10, 2, true]]);
  assert.equal(L.families[0].name, 'Diya');
  assert.equal(L.families[0].tone, 'final');
  assert.equal(L.families.find(f => f.name === 'Aarav')!.lateHistory.late, 1);
});

test('admissions: funnel counts furthest stage reached, moves are validated', () => {
  assert.equal(nextStage('enquiry'), 'application');
  assert.equal(nextStage('enrolled'), null);
  assert.ok(canMove('enquiry', 'application'));
  assert.ok(!canMove('enquiry', 'offer'), 'no skipping');
  assert.ok(canMove('offer', 'rejected'));
  assert.ok(canMove('rejected', 'assessment'));
  assert.ok(!canMove('rejected', 'enrolled'));
  assert.ok(canMove('enrolled', 'withdrawn'));
  const row = (id: string, stage: string, furthest: string, changedDaysAgo = 1) => ({
    id, name: id, grade: 6, stage, furthest_stage: furthest, source: 'website', stage_changed_at: iso(changedDaysAgo), created_at: iso(40),
  });
  const P = assemblePipeline('2027-28', [
    row('a', 'enrolled', 'enrolled'), row('b', 'rejected', 'assessment'), row('c', 'application', 'application', 20),
    row('d', 'enquiry', 'enquiry'), row('e', 'offer', 'offer'),
  ], [], '2026-09-24');
  assert.deepEqual(P.funnel.map(f => f.reached), [5, 4, 3, 2, 1]);
  assert.equal(P.funnel[1].fromPrev, 80);
  assert.equal(P.enrolled, 1);
  assert.equal(P.conversion, 50, '1 enrolled of 2 decided');
  assert.equal(P.stale.map(a => a.id).join(), 'c');
  assert.deepEqual(P.leak, { from: 'assessment', to: 'offer', rate: 67 }, 'offer->enrolled skipped: only 2 reached offer');
});

test('TML as of a date uses only snapshots that existed then', () => {
  const rows = [
    { student_id: 's', subject: 'Maths', topic_name: 'Ch 1', score: 40, computed_at: iso(20) },
    { student_id: 's', subject: 'Mathematics', topic_name: 'Ch 1', score: 70, computed_at: iso(2) },
    { student_id: 's', subject: 'Mathematics', topic_name: 'Ch 2', score: 50, computed_at: iso(2) },
  ];
  assert.deepEqual(tmlAsOf(rows, NOW).get('s'), { mathematics: 60 });
  assert.deepEqual(tmlAsOf(rows, NOW - 14 * 86_400_000).get('s'), { mathematics: 40 });
  assert.equal(bandOf(92), 'exemplary');
  assert.equal(bandOf(49), 'critical');
  assert.equal(bandOf(10), 'severe');
  assert.equal(energyPct(3), 50);
  assert.equal(energyPct(null), null);
});

function rows(over: Partial<AdminRows> = {}): AdminRows {
  return {
    school: { id: 'sch', name: 'Sthara Test School', settings: { code: 'STHTEST', plan: 'trial' } },
    users: [
      { id: 't1', role: 'teacher', name: 'Maths Teacher', email: 'm@x', assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }, { class: 'Class 9-B', subject: 'Mathematics' }] },
      { id: 't2', role: 'teacher', name: 'Idle Teacher', email: 'i@x', assignments: [{ class: 'Class 9-B', subject: 'Science' }] },
      { id: 'ad', role: 'admin', name: 'Admin', email: 'a@x' },
      { id: 'p1', role: 'parent', name: 'Parent', email: 'p@x' },
      { id: 's1', role: 'student', name: 'Aarav Shah', student_class: 'Class 10-A' },
      { id: 's2', role: 'student', name: 'Diya Rao', student_class: '10a' },
      { id: 's3', role: 'student', name: 'Kabir Nair', student_class: 'Class 9-B' },
      { id: 's4', role: 'student', name: 'Meera Iyer', student_class: 'Class 9-B' },
    ],
    tml: [
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Quadratics', score: 80, computed_at: iso(3) },
      { student_id: 's2', subject: 'Mathematics', topic_name: 'Quadratics', score: 70, computed_at: iso(3) },
      { student_id: 's3', subject: 'Mathematics', topic_name: 'Polynomials', score: 30, computed_at: iso(3) },
      { student_id: 's4', subject: 'Mathematics', topic_name: 'Polynomials', score: 36, computed_at: iso(3) },
      { student_id: 's3', subject: 'Science', topic_name: 'Motion', score: 70, computed_at: iso(3) },
      { student_id: 's4', subject: 'Science', topic_name: 'Motion', score: 60, computed_at: iso(3) },
      { student_id: 's3', subject: 'Mathematics', topic_name: 'Polynomials', score: 50, computed_at: iso(20) },
    ],
    assignments: [{ id: 'as1', teacher_id: 't1', class: 'Class 9-B', subject: 'Mathematics', status: 'published', created_at: iso(5) }],
    submissions: [
      { id: 'sub1', assignment_id: 'as1', student_id: 's3', teacher_approved: false, submitted_at: iso(9) },
      { id: 'sub2', assignment_id: 'as1', student_id: 's4', teacher_approved: true, updated_at: iso(2) },
    ],
    lessons: [{ teacher_id: 't1', created_at: iso(4), updated_at: iso(4), ai_drafted: true }],
    consents: [{ student_id: 's1', consent_type: 'wellness_checkin', granted: true }],
    guardians: [{ parent_id: 'p1', student_id: 's1', verified: true }, { parent_id: 'p1', student_id: 's3', verified: false }],
    audit: [{ id: 1, at: iso(1), actor_id: 'ad', actor_role: 'admin', action: 'UPDATE', table_name: 'guardians', old_values: { verified: false }, new_values: { verified: true } }],
    leave: [{ id: 'l1', staff_id: 't2', leave_type: 'sick', from_date: '2026-09-25', to_date: '2026-09-26', half_day: false, reason: 'Fever', status: 'pending', created_at: iso(0) }],
    structures: [], invoices: [], payments: [], reminders: [], applicants: [], admissionEvents: [], filings: [],
    wellness: [
      { bucket: 'school', key: 'all', students: 6, checkins: 20, avg_energy: 3.4, low_share: 0.15 },
      { bucket: 'week', key: '2026-09-21', students: 5, checkins: 7, avg_energy: 3, low_share: 0.1 },
      { bucket: 'grade', key: '9', students: 3, checkins: 8, avg_energy: null, low_share: null },
    ],
    proctor: [],
    missing: [],
    ...over,
  };
}

test('admin desk assembles school-wide academics from real rows', () => {
  const d = assembleAdminDesk(rows(), NOW);
  assert.equal(d.session, '2026-27');
  assert.equal(d.admissionsSession, '2027-28');
  assert.equal(d.students.length, 4);
  assert.deepEqual(d.academics.sections.map(s => s.cls), ['Class 9-B', 'Class 10-A'], '"10a" merges into Class 10-A');
  const s3 = d.students.find(s => s.id === 's3')!;
  assert.equal(s3.overall, 50, 'mean of Maths 30 and Science 70');
  assert.equal(s3.overallBefore, 50, 'only the Maths snapshot existed 14 days ago');
  assert.equal(d.academics.schoolTml, 62, 'mean of 80, 70, 50, 48');
  const cell = d.academics.matrix.find(c => c.grade === 9 && c.subject === 'mathematics')!;
  assert.equal(cell.tml, 33);
  assert.equal(d.academics.weakest!.subject, 'mathematics');
  assert.equal(d.academics.atRisk.length, 0, 'overall TML, not a single subject');
  assert.equal(d.academics.noEvidence, 0);
});

test('workforce: class TML on taught subjects, backlog, activity, leave', () => {
  const d = assembleAdminDesk(rows(), NOW);
  const t1 = d.workforce.teachers.find(t => t.id === 't1')!;
  assert.equal(t1.students, 4);
  assert.equal(t1.tml, Math.round((80 + 70 + 30 + 36) / 4), 'Maths only, not their Science marks');
  assert.equal(t1.backlog, 1);
  assert.equal(t1.oldestPendingDays, 9);
  assert.equal(t1.activity, 'medium');
  assert.equal(t1.aiLessons30, 1);
  const t2 = d.workforce.teachers.find(t => t.id === 't2')!;
  assert.equal(t2.activity, 'none');
  assert.equal(t2.tml, 65);
  assert.equal(d.workforce.pendingLeave.length, 1);
  assert.equal(d.workforce.pendingLeave[0].days, 2);
  assert.equal(d.workforce.ratio, 2);
});

test('wellness report rescales energy and keeps suppressed cells null', () => {
  const d = assembleAdminDesk(rows(), NOW);
  assert.equal(d.wellness.energy, 60);
  assert.equal(d.wellness.participation, 150, 'six check-in students vs four on roll in this fixture');
  assert.equal(d.wellness.weeks.length, 12);
  assert.equal(d.wellness.weeks[11].week, '2026-09-21');
  assert.equal(d.wellness.weeks[11].energy, 50);
  assert.equal(d.wellness.grades[0].energy, null);
});

test('compliance flags consent and guardian gaps', () => {
  const d = assembleAdminDesk(rows(), NOW);
  const keys = d.compliance.flags.map(f => f.key);
  assert.ok(keys.includes('wellness-consent'));
  assert.ok(keys.includes('guardians'));
  assert.ok(keys.includes('unverified'));
  assert.equal(d.compliance.consents.find(c => c.type === 'wellness_checkin')!.coverage, 25);
  assert.equal(d.compliance.guardianCoverage, 25);
  assert.equal(d.compliance.audit[0].summary, 'Guardian verified');
  assert.equal(d.compliance.audit[0].actor, 'Admin');
  assert.equal(auditSummary({ table_name: 'fee_payments', action: 'INSERT', new_values: { receipt_no: 'RCT/2026-27/00001' } }), 'Receipt RCT/2026-27/00001 recorded');
});
