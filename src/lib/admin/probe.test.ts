import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleAdminDesk, type AdminRows } from './desk';
import { probe, correlate, levelOf, type Finding } from './probe';
import { balances, overBalance } from './leave';

const NOW = new Date('2026-09-24T10:00:00+05:30').getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const S = 'sch';

function rows(roles: string[] = ['school_admin'], over: Partial<AdminRows> = {}): AdminRows {
  const students = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, role: 'student', name: `Student ${i}`, student_class: i < 3 ? 'Class 9-B' : 'Class 10-A' }));
  return {
    school: { id: S, name: 'Test School', settings: {} },
    users: [
      { id: 'me', role: 'admin', name: 'Asha', email: 'a@x' },
      { id: 'acc', role: 'admin', name: 'Arun Accounts', email: 'acc@x' },
      { id: 't1', role: 'teacher', name: 'Priya Maths', email: 'p@x', assignments: [{ class: 'Class 9-B', subject: 'Mathematics' }] },
      { id: 't2', role: 'teacher', name: 'Ravi Science', email: 'r@x', assignments: [{ class: 'Class 10-A', subject: 'Science' }] },
      ...students,
      { id: 'par', role: 'parent', name: 'Parent' },
    ],
    // Class 9-B Maths falls from 70 to 50; 10-A Science steady.
    tml: [
      ...['s0', 's1', 's2'].flatMap(id => [
        { student_id: id, subject: 'Mathematics', topic_name: 'Polynomials', score: 70, confidence_band: 'provisional', computed_at: iso(20) },
        { student_id: id, subject: 'Mathematics', topic_name: 'Polynomials', score: 50, confidence_band: 'provisional', computed_at: iso(2) },
      ]),
      ...['s3', 's4'].map(id => ({ student_id: id, subject: 'Science', topic_name: 'Light', score: 80, confidence_band: 'firm', computed_at: iso(3) })),
    ],
    assignments: [{ id: 'a1', teacher_id: 't1', class: 'Class 9-B', subject: 'Mathematics', status: 'published', created_at: iso(40) }],
    submissions: Array.from({ length: 12 }, (_, i) => ({ id: `sub${i}`, assignment_id: 'a1', student_id: 's0', teacher_approved: false, submitted_at: iso(10 + i) })),
    lessons: [], consents: [{ student_id: 's0', consent_type: 'wellness_checkin', granted: true }],
    guardians: [{ parent_id: 'par', student_id: 's0', verified: true }, { parent_id: 'par', student_id: 's1', verified: true }],
    audit: [], leave: [
      { id: 'l1', staff_id: 't2', leave_type: 'casual', from_date: '2026-09-25', to_date: '2026-09-25', half_day: false, reason: 'Wedding', status: 'pending', created_at: iso(1) },
    ],
    structures: [{ id: 'fs', grade: 10, annual_fee: 100000, schedule: [{ no: 1, label: 'Term 1', due_on: '2026-04-10', share: 0.5 }, { no: 2, label: 'Term 2', due_on: '2026-10-10', share: 0.5 }] }],
    invoices: ['s3', 's4', 's5'].map((sid, i) => ({ id: `i${i}`, student_id: sid, instalment_no: 1, label: 'Term 1', invoice_no: `INV/${i}`, due_on: '2026-04-10', amount: 50000, concession: 0 })),
    payments: [{ id: 'p1', invoice_id: 'i0', student_id: 's3', amount: 50000, mode: 'cash', paid_on: '2026-09-20', receipt_no: 'RCT/1', recorded_at: iso(4), recorded_by: 'acc' }],
    reminders: [], applicants: [], admissionEvents: [], filings: [],
    wellness: [{ bucket: 'school', key: 'all', students: 6, checkins: 20, avg_energy: 3, low_share: 0.1 }],
    proctor: [], missing: [],
    meId: 'me', grants: [
      ...roles.map((r, i) => ({ id: `g${i}`, user_id: 'me', role_key: r, revoked_at: null, expires_on: null, granted_at: iso(30) })),
      { id: 'gacc', user_id: 'acc', role_key: 'accountant', revoked_at: null, expires_on: '2026-09-28', granted_at: iso(30) },
    ],
    dayCloses: [], concessions: [{ id: 'c1', invoice_id: 'i1', student_id: 's4', amount: 5000, reason: 'Sibling', status: 'pending', requested_by: 'acc', requested_at: iso(5) }],
    leavePolicies: [{ leave_type: 'casual', days_per_year: 12 }], probeAcks: [],
    ...over,
  };
}

const keys = (fs: Finding[]) => fs.map(f => f.key);

test('a school admin sees findings in every area, ranked by severity', () => {
  const r = probe(assembleAdminDesk(rows(), NOW), NOW);
  const k = keys(r.findings);
  for (const want of ['tml-decline:9b:mathematics', 'weak-cell:9:mathematics', 'grading:t1', 'inactive:t1', 'leave-pending:l1', 'ageing-60',
    'slippage:1', 'unpriced', 'unreminded', 'unclosed-days', 'concessions-pending', 'dpdp:wellness-consent', 'access:expiring', 'access:single-owner']) {
    assert.ok(k.includes(want), `missing ${want}; got ${k.join(', ')}`);
  }
  assert.deepEqual(r.findings.map(f => f.severity), [...r.findings.map(f => f.severity)].sort((a, b) => b - a));
  assert.deepEqual(r.hiddenModules, []);
  assert.ok(!k.includes('unraised:1'), 'every grade-10 student already billed for Term 1');
  assert.ok(!k.includes('access:no-role'), 'every office account has a role');
});

test('a falling class is linked to its teacher\'s grading backlog', () => {
  const r = probe(assembleAdminDesk(rows(), NOW), NOW);
  const decline = r.findings.find(f => f.key === 'tml-decline:9b:mathematics')!;
  assert.match(decline.title, /Class 9-B Mathematics down 20 points/);
  assert.ok(decline.causes.some(c => /12 submissions waiting/.test(c)), decline.causes.join(' | '));
  assert.ok(decline.related.includes('grading:t1'));
  const grading = r.findings.find(f => f.key === 'grading:t1')!;
  assert.ok(grading.related.includes('tml-decline:9b:mathematics'));
  assert.ok(decline.actions.some(a => a.kind === 'nudge_teacher' && a.teacherId === 't1'));
});

test('findings follow the viewer\'s role', () => {
  const acc = probe(assembleAdminDesk(rows(['accountant']), NOW), NOW);
  assert.ok(acc.findings.every(f => f.module === 'finance'), keys(acc.findings).join(', '));
  assert.ok(!keys(acc.findings).includes('concessions-pending'), 'accountant cannot approve, so is not asked to');
  assert.ok(keys(acc.findings).includes('unclosed-days'));
  assert.deepEqual(acc.hiddenModules.sort(), ['academics', 'admissions', 'compliance', 'workforce']);

  const coord = probe(assembleAdminDesk(rows(['academic_coordinator']), NOW), NOW);
  assert.ok(keys(coord.findings).includes('tml-decline:9b:mathematics'));
  assert.ok(!keys(coord.findings).includes('leave-pending:l1'), 'no leave.approve');
  const decline = coord.findings.find(f => f.key === 'tml-decline:9b:mathematics')!;
  assert.ok(decline.actions.some(a => a.kind === 'nudge_teacher'), 'workforce.read allows nudging');

  const cns = probe(assembleAdminDesk(rows(['counsellor']), NOW), NOW);
  assert.equal(cns.findings.length, 0);
});

test('consent requests target only families missing that consent', () => {
  const r = probe(assembleAdminDesk(rows(), NOW), NOW);
  const f = r.findings.find(x => x.key === 'dpdp:wellness-consent')!;
  const act = f.actions.find(a => a.kind === 'request_consent');
  assert.ok(act && act.kind === 'request_consent');
  assert.deepEqual(act.studentIds, ['s1'], 's0 already consented; others have no verified parent');
});

test('acknowledged findings stay hidden until they get worse; snoozes until the date', () => {
  const d0 = assembleAdminDesk(rows(), NOW);
  const f = probe(d0, NOW).findings.find(x => x.key === 'grading:t1')!;
  const acked = assembleAdminDesk(rows(['school_admin'], { probeAcks: [{ finding_key: 'grading:t1', fingerprint: f.fingerprint, status: 'acknowledged', acked_at: iso(0) }] }), NOW);
  assert.ok(!keys(probe(acked, NOW).findings).includes('grading:t1'));
  assert.ok(probe(acked, NOW).acknowledged.some(x => x.key === 'grading:t1'));
  const stale = assembleAdminDesk(rows(['school_admin'], { probeAcks: [{ finding_key: 'grading:t1', fingerprint: 'old', status: 'acknowledged', acked_at: iso(9) }] }), NOW);
  assert.ok(keys(probe(stale, NOW).findings).includes('grading:t1'), 'fingerprint changed: back');
  const snoozed = assembleAdminDesk(rows(['school_admin'], { probeAcks: [{ finding_key: 'unpriced', fingerprint: 'x', status: 'snoozed', snooze_until: '2026-10-01', acked_at: iso(0) }] }), NOW);
  assert.ok(!keys(probe(snoozed, NOW).findings).includes('unpriced'));
  const over = assembleAdminDesk(rows(['school_admin'], { probeAcks: [{ finding_key: 'unpriced', fingerprint: 'x', status: 'snoozed', snooze_until: '2026-09-20', acked_at: iso(9) }] }), NOW);
  assert.ok(keys(probe(over, NOW).findings).includes('unpriced'));
});

test('correlate raises class findings and levels follow severity', () => {
  const a = { key: 'a', module: 'academics', severity: 45, level: 'medium', title: 'X', summary: '', evidence: [], causes: [], related: [], actions: [], fingerprint: '', teacherIds: ['t'] } as Finding;
  const w = { ...a, key: 'w', module: 'workforce', title: 'T is behind', teacherIds: ['t'] } as Finding;
  const out = correlate([a, w]);
  assert.equal(out[0].severity, 55);
  assert.equal(out[0].level, 'high');
  assert.equal(levelOf(70), 'critical');
  assert.equal(levelOf(29), 'low');
});

test('fees desk: day book, forecast and concessions', () => {
  const d = assembleAdminDesk(rows(), NOW);
  assert.equal(d.dayBook[0].day, '2026-09-20');
  assert.equal(d.dayBook[0].cash, 50000);
  assert.deepEqual(d.dayBook[0].byRecorder, [{ id: 'acc', count: 1, amount: 50000 }]);
  const apr = d.forecast.find(m => m.month === '2026-04')!;
  assert.equal(apr.due, 150000);
  assert.equal(apr.open, 100000);
  const oct = d.forecast.find(m => m.month === '2026-10')!;
  assert.equal(oct.unraised, 150000, 'Term 2 not raised yet: 3 grade-10 students x 50,000');
  assert.equal(d.forecast.find(m => m.month === '2026-09')!.collected, 50000);
  assert.equal(d.concessions[0].status, 'pending');
  assert.ok(d.me.access.can('access.manage'));
});

test('leave balances and entitlement checks', () => {
  const reqs = [
    { id: 'a', staff_id: 't', leave_type: 'casual', from_date: '2026-06-01', to_date: '2026-06-05', half_day: false, status: 'approved' },
    { id: 'b', staff_id: 't', leave_type: 'casual', from_date: '2026-10-01', to_date: '2026-10-01', half_day: true, status: 'pending' },
    { id: 'c', staff_id: 't', leave_type: 'casual', from_date: '2026-03-20', to_date: '2026-03-25', half_day: false, status: 'approved' },
  ];
  const b = balances([{ leave_type: 'casual', days_per_year: 12 }], reqs, 't', '2026-27').find(x => x.type === 'casual')!;
  assert.deepEqual([b.entitled, b.used, b.pending, b.left], [12, 5, 0.5, 6.5], 'last session\'s leave not counted');
  assert.equal(balances([], reqs, 't', '2026-27').find(x => x.type === 'sick')!.entitled, null);
  assert.match(overBalance([{ leave_type: 'casual', days_per_year: 12 }], reqs, 't', '2026-27', 'casual', 7)!, /only 6.5 are left/);
  assert.equal(overBalance([{ leave_type: 'casual', days_per_year: 12 }], reqs, 't', '2026-27', 'casual', 6.5), null);
  assert.equal(overBalance([{ leave_type: 'casual', days_per_year: 0 }], reqs, 't', '2026-27', 'unpaid', 30), null, 'unpaid is uncapped');
  assert.equal(overBalance([{ leave_type: 'casual', days_per_year: 12 }], reqs, 't', '2026-27', 'casual', 7, 'b'), null, 'approving b itself: its own pending half day is excluded');
});
