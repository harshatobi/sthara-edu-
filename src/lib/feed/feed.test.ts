import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAbsenceStreaks, detectExamAbsences, detectLowScores, detectOverdue, detectProctoring, detectTmlDrops, detectWellness,
  escalateAt, incidentDraft, incidentNotice, incidentSeverity, isEscalated, istAt, istDay, INCIDENT_RULES,
} from './rules';

const students = [
  { id: 's1', name: 'Asha', student_class: 'Class 10-A' },
  { id: 's2', name: 'Ravi', student_class: '10A' },
  { id: 's3', name: 'Meena', student_class: 'Class 9-B' },
];

test('IST days and times', () => {
  assert.equal(istDay(new Date('2026-09-26T20:00:00Z')), '2026-09-27'); // 01:30 IST next day
  assert.equal(istAt('2026-09-28', '16:00').toISOString(), '2026-09-28T10:30:00.000Z');
});

test('escalation: critical 1h, high end of school day, normal never', () => {
  const t = new Date('2026-09-28T04:00:00Z'); // Mon 09:30 IST
  assert.equal(escalateAt('critical', t)!.toISOString(), '2026-09-28T05:00:00.000Z');
  assert.equal(escalateAt('high', t)!.toISOString(), '2026-09-28T10:30:00.000Z');
  assert.equal(escalateAt('normal', t), null);
  // Raised after hours on Saturday: next school day is Monday (Sunday skipped).
  const sat = new Date('2026-09-26T12:00:00Z'); // Sat 17:30 IST
  assert.equal(escalateAt('high', sat)!.toISOString(), '2026-09-28T10:30:00.000Z');
  // A school with a 14:30 day end.
  assert.equal(escalateAt('high', t, '14:30')!.toISOString(), '2026-09-28T09:00:00.000Z');
});

test('escalated is derived from escalate_at and acknowledgement', () => {
  const now = Date.parse('2026-09-28T06:00:00Z');
  assert.ok(isEscalated({ escalate_at: '2026-09-28T05:00:00Z', acknowledged_at: null }, now));
  assert.ok(!isEscalated({ escalate_at: '2026-09-28T05:00:00Z', acknowledged_at: '2026-09-28T04:30:00Z' }, now));
  assert.ok(!isEscalated({ escalate_at: '2026-09-28T07:00:00Z', acknowledged_at: null }, now));
  assert.ok(!isEscalated({ escalate_at: null, acknowledged_at: null }, now));
  // The feed screens pass FeedItems (camelCase): they were never shown as escalated before.
  assert.ok(isEscalated({ escalateAt: '2026-09-28T05:00:00Z', acknowledgedAt: null }, now));
  assert.ok(!isEscalated({ escalateAt: '2026-09-28T05:00:00Z', acknowledgedAt: '2026-09-28T04:30:00Z' }, now));
});

test('incident routing follows the school policy', () => {
  assert.equal(incidentNotice('health', true), 'sent');
  assert.equal(incidentNotice('discipline', true), 'awaiting_class_teacher');
  assert.equal(incidentNotice('bullying', true), 'principal_decides');
  assert.equal(incidentNotice('safety', false), 'not_applicable');
  assert.equal(INCIDENT_RULES.child_protection.audience, 'principal');
  assert.equal(incidentSeverity('discipline'), 'normal');
  assert.equal(incidentSeverity('discipline', true), 'critical');
  const d = incidentDraft({ id: 'i1', category: 'child_protection', severity: 'critical', summary: 'Disclosure', studentId: 's1', studentName: 'Asha',
    className: '10a', location: null, loggedByName: 'Ms Rao', notice: 'principal_decides' });
  assert.equal(d.audience, 'principal');
  assert.equal(d.dedupeKey, 'incident:i1');
  assert.match(d.message, /Asha \(Class 10-A\)/);
});

test('overdue work: one item per assignment with the missing students', () => {
  const assignments = [
    { id: 'a1', teacher_id: 't1', title: 'Algebra HW', type: 'homework', subject: 'Maths', class: 'Class 10-A', due_date: '2026-09-25', status: 'published' },
    { id: 'a2', teacher_id: 't1', title: 'Future', type: 'homework', subject: 'Maths', class: '10A', due_date: '2026-09-30', status: 'published' },
    { id: 'a3', teacher_id: 't1', title: 'Draft', type: 'homework', subject: 'Maths', class: '10A', due_date: '2026-09-25', status: 'draft' },
    { id: 'a4', teacher_id: 't1', title: 'Old', type: 'homework', subject: 'Maths', class: '10A', due_date: '2026-09-01', status: 'published' },
  ];
  const subs = [{ id: 'x', assignment_id: 'a1', student_id: 's1', score: null, max_score: null, teacher_approved: false, submitted_at: '2026-09-24T10:00:00Z' }];
  const d = detectOverdue(assignments, subs, students, '2026-09-27');
  assert.equal(d.length, 1);
  assert.equal(d[0].dedupeKey, 'overdue:a1');
  assert.equal(d[0].teacherId, 't1');
  assert.match(d[0].title, /1 student has not submitted/);
  assert.deepEqual(d[0].metadata!.missing, ['s2']);
  // Everyone submitted: nothing.
  assert.equal(detectOverdue(assignments, [...subs, { ...subs[0], id: 'y', student_id: 's2' }], students, '2026-09-27').length, 0);
  // Explicit assignee list wins over the class.
  assert.equal(detectOverdue([{ ...assignments[0], assigned_student_ids: ['s1'] }], subs, students, '2026-09-27').length, 0);
});

test('TML drop needs a real fall below 50', () => {
  const rows = [
    { student_id: 's1', subject: 'Maths', topic_name: 'Quadratics', score: 72, computed_at: '2026-09-20T00:00:00Z' },
    { student_id: 's1', subject: 'Maths', topic_name: 'Quadratics', score: 44, computed_at: '2026-09-25T00:00:00Z' },
    { student_id: 's2', subject: 'Maths', topic_name: 'Quadratics', score: 90, computed_at: '2026-09-20T00:00:00Z' },
    { student_id: 's2', subject: 'Maths', topic_name: 'Quadratics', score: 70, computed_at: '2026-09-25T00:00:00Z' },
  ];
  const d = detectTmlDrops(rows, students);
  assert.equal(d.length, 1);
  assert.equal(d[0].studentId, 's1');
  assert.match(d[0].message, /from 72 to 44/);
});

test('low scores: three graded pieces under 40% in a row, per teacher', () => {
  const assignments = [1, 2, 3].map(i => ({ id: `a${i}`, teacher_id: 't1', title: `T${i}`, type: 'quiz', subject: 'Science', class: '10A', due_date: null, status: 'published' }));
  const sub = (i: number, score: number, approved = true) => ({ id: `u${i}`, assignment_id: `a${i}`, student_id: 's1', score, max_score: 10, teacher_approved: approved, submitted_at: `2026-09-2${i}T00:00:00Z` });
  assert.equal(detectLowScores([sub(1, 3), sub(2, 2), sub(3, 3)], assignments, students).length, 1);
  assert.equal(detectLowScores([sub(1, 3), sub(2, 5), sub(3, 3)], assignments, students).length, 0);
  assert.equal(detectLowScores([sub(1, 3), sub(2, 2), sub(3, 3, false)], assignments, students).length, 0, 'ungraded work does not count');
});

test('wellness: single low check-in vs a streak; never reads notes', () => {
  const since = '2026-09-25T00:00:00Z';
  const one = detectWellness([{ id: 'w1', student_id: 's1', energy: 2, shared: false, created_at: '2026-09-26T08:00:00Z' }], students, since);
  assert.equal(one.length, 1);
  assert.equal(one[0].kind, 'low_energy');
  assert.equal(one[0].severity, 'normal');
  assert.match(one[0].message, /stays private/);
  const streak = detectWellness([
    { id: 'w1', student_id: 's1', energy: 1, shared: false, created_at: '2026-09-24T08:00:00Z' },
    { id: 'w2', student_id: 's1', energy: 2, shared: true, created_at: '2026-09-25T08:00:00Z' },
    { id: 'w3', student_id: 's1', energy: 2, shared: false, created_at: '2026-09-26T08:00:00Z' },
  ], students, since);
  assert.equal(streak.length, 1);
  assert.equal(streak[0].kind, 'energy_streak');
  assert.equal(streak[0].severity, 'high');
  // An old low check-in is not news.
  assert.equal(detectWellness([{ id: 'w0', student_id: 's1', energy: 1, shared: false, created_at: '2026-09-20T08:00:00Z' }], students, since).length, 0);
  assert.equal(detectWellness([{ id: 'w4', student_id: 's1', energy: 4, shared: false, created_at: '2026-09-26T08:00:00Z' }], students, since).length, 0);
});

test('absence streaks count marked days; excused days are neutral', () => {
  const r = (day: string, status: any, sid = 's1') => ({ student_id: sid, class_name: 'Class 10-A', day, status });
  const d = detectAbsenceStreaks([r('2026-09-22', 'present'), r('2026-09-23', 'absent'), r('2026-09-24', 'excused'), r('2026-09-25', 'absent'), r('2026-09-26', 'absent')], students);
  assert.equal(d.length, 1);
  assert.match(d[0].title, /3 school days/);
  assert.equal(d[0].dedupeKey, 'absence:s1:2026-09-23');
  assert.equal(detectAbsenceStreaks([r('2026-09-24', 'absent'), r('2026-09-25', 'late'), r('2026-09-26', 'absent')], students).length, 0);
});

test('exam-day absence goes to the assessment teacher', () => {
  const assignments = [
    { id: 'q1', teacher_id: 't9', title: 'Unit test', type: 'quiz', subject: 'Maths', class: 'Class 10-A', due_date: '2026-09-26', status: 'published' },
    { id: 'h1', teacher_id: 't9', title: 'HW', type: 'homework', subject: 'Maths', class: 'Class 10-A', due_date: '2026-09-26', status: 'published' },
  ];
  const d = detectExamAbsences([{ student_id: 's1', class_name: 'Class 10-A', day: '2026-09-26', status: 'absent' },
    { student_id: 's3', class_name: 'Class 9-B', day: '2026-09-26', status: 'absent' }], assignments, students);
  assert.equal(d.length, 1);
  assert.equal(d[0].teacherId, 't9');
  assert.equal(d[0].dedupeKey, 'exam_absence:s1:q1');
});

test('proctoring: worst alert per student and task; auto-submit is high', () => {
  const rows = [1, 2, 3].map(n => ({ id: `p${n}`, student_id: 's1', student_name: 'Asha', assignment_id: 'q1', assignment_title: 'Unit test', switch_count: n, flagged_at: `2026-09-26T0${n}:00:00Z` }));
  const d = detectProctoring(rows, [{ id: 'q1', teacher_id: 't9', title: 'Unit test', type: 'quiz', subject: 'Maths', class: '10A', due_date: null, status: 'published' }], students);
  assert.equal(d.length, 1);
  assert.equal(d[0].severity, 'high');
  assert.equal(d[0].teacherId, 't9');
  assert.match(d[0].title, /3 times/);
});
