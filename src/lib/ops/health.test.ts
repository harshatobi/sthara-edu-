import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandOf, schoolDays14, scoreHealth, weekStart, type CommercialFacts, type SchoolMetrics } from './health';
import { ask, type AskSchool } from './ask';

const role = (total: number, active7: number, signedIn7 = active7, never = 0) => ({ total, signedIn7, signedIn30: signedIn7, active7, active30: active7, never });
function metrics(over: Partial<SchoolMetrics> = {}): SchoolMetrics {
  return {
    at: '2026-09-28T10:00:00Z',
    roles: { student: role(100, 90), teacher: role(10, 10), parent: role(80, 70), admin: role(3, 2) },
    weekly: [],
    classes: [{ name: 'Class 10-A', students: 50, active7: 45 }, { name: 'Class 9-B', students: 50, active7: 45 }],
    data: { studentsNoParent: 0, studentsNoClass: 0, studentsNoRoll: 0, parentsNoChild: 0, teachersNoAssignments: 0, staleTempPasswords: 0 },
    ops: {
      classCount: 2, attendanceDays14: 12, classesMarked7: 2, feeStructures: 1, feeDue: 100_000, feeCollected: 95_000, invoicesDue: 100,
      assignments30: 40, teachersSettingWork30: 10, gradingBacklog: 0, incidentsOpenOld: 0, timetablePublished: true, leavePendingOld: 0,
      errors7: 0, aiCostUsd30: 1,
    },
    ...over,
  };
}
const live: CommercialFacts = { active: true, plan: 'shikhara', trialExpired: false, trialDaysLeft: null, contractStudents: 100, pricePerStudent: 3500, usdToInr: 95.5 };

test('helpers: six-day school weeks, Monday week starts, bands', () => {
  assert.equal(schoolDays14('2026-09-28T10:00:00Z'), 12);
  assert.equal(weekStart('2026-09-28T10:00:00Z'), '2026-09-28');
  assert.equal(weekStart('2026-10-04T23:00:00Z'), '2026-09-28');
  assert.deepEqual([bandOf(80), bandOf(79), bandOf(60), bandOf(40), bandOf(39)], ['strong', 'fair', 'fair', 'weak', 'critical']);
});

test('a healthy school scores strong with only minor findings', () => {
  const h = scoreHealth(metrics(), live);
  assert.equal(h.band, 'strong');
  assert.ok(h.score! >= 85, `score ${h.score}`);
  assert.ok(!h.findings.some(f => f.severity === 'high'), JSON.stringify(h.findings));
});

test('adoption gaps: idle teachers, the signed-in-but-idle gap, never signed in, dead classes', () => {
  const h = scoreHealth(metrics({
    roles: { student: role(100, 20, 80, 10), teacher: role(10, 3, 9), parent: role(80, 10), admin: role(3, 0) },
    classes: [{ name: 'Class 9-B', students: 30, active7: 0 }],
  }), live);
  const ids = h.findings.map(f => f.id);
  for (const id of ['adoption.idle.teacher', 'adoption.hollow.teacher', 'adoption.hollow.student', 'adoption.never.student', 'adoption.office', 'adoption.class.Class 9-B', 'com.renewal']) {
    assert.ok(ids.includes(id), `missing ${id}: ${ids.join(', ')}`);
  }
  const adoption = h.pillars.find(p => p.key === 'adoption')!;
  assert.ok(adoption.score! < 40, `adoption ${adoption.score}`);
  assert.equal(h.findings[0].severity, 'high');
});

test('activity trend: a drop against the three weeks before is flagged', () => {
  const w = (week: string, active: number) => ({ week, role: 'student' as const, active });
  const h = scoreHealth(metrics({ weekly: [w('2026-08-31', 80), w('2026-09-07', 82), w('2026-09-14', 78), w('2026-09-21', 30), w('2026-09-28', 10)] }), live);
  const f = h.findings.find(x => x.id === 'adoption.trend.student');
  assert.ok(f, 'trend finding');
  assert.match(f!.title, /fell 63%/);
});

test('operations: no attendance, weak collection, grading backlog', () => {
  const m = metrics();
  m.ops = { ...m.ops, attendanceDays14: 0, classesMarked7: 0, feeCollected: 30_000, gradingBacklog: 25, teachersSettingWork30: 2, timetablePublished: false };
  const h = scoreHealth(m, live);
  const ids = h.findings.map(f => f.id);
  for (const id of ['ops.attendance.none', 'ops.fees', 'ops.grading', 'ops.homework', 'ops.timetable']) assert.ok(ids.includes(id), `missing ${id}`);
  assert.ok(h.pillars.find(p => p.key === 'operations')!.score! < 30);
});

test('measures with nothing to measure are left out, not scored', () => {
  const m = metrics({ roles: { student: role(40, 30), admin: role(1, 1) } });
  m.ops = { ...m.ops, feeDue: 0, feeCollected: 0, feeStructures: 0 };
  const h = scoreHealth(m, live);
  const ops = h.pillars.find(p => p.key === 'operations')!;
  assert.ok(!ops.measures.some(x => /Fees|Teachers/.test(x.label)), ops.measures.map(x => x.label).join());
  assert.ok(h.findings.some(f => f.id === 'ops.fees.none' && f.severity === 'low'));
});

test('data quality: unlinked families point to the Support tab', () => {
  const m = metrics();
  m.data = { ...m.data, studentsNoParent: 60, studentsNoRoll: 5, parentsNoChild: 4 };
  const h = scoreHealth(m, live);
  const f = h.findings.find(x => x.id === 'data.no-parent')!;
  assert.equal(f.tab, 'support');
  assert.equal(f.severity, 'high');
});

test('commercial: suspended, pilot ending, over seats, AI cost share', () => {
  assert.equal(scoreHealth(metrics(), { ...live, active: false }).band, 'suspended');
  const pilot = scoreHealth(metrics(), { ...live, plan: 'pilot', trialDaysLeft: 9, pricePerStudent: null });
  assert.ok(pilot.findings.some(f => f.id === 'com.pilot-ending'));
  const over = scoreHealth(metrics({ roles: { ...metrics().roles, student: role(130, 120) } }), live);
  assert.ok(over.findings.some(f => f.id === 'com.over-seats'));
  const m = metrics();
  m.ops = { ...m.ops, aiCostUsd30: 120 }; // ~₹1.38 L a year against ₹3.5 L revenue
  const ai = scoreHealth(m, live);
  assert.equal(ai.findings.find(f => f.id === 'com.ai-cost')?.severity, 'high');
  assert.ok(scoreHealth(metrics(), { ...live, plan: 'sthamba', pricePerStudent: null }).findings.some(f => f.id === 'com.no-price'));
});

test('a school with no students is still setting up', () => {
  const h = scoreHealth(metrics({ roles: { admin: role(1, 1) }, classes: [] }), live);
  assert.equal(h.band, 'setup');
  assert.equal(h.score, null);
});

// ── Ask ──────────────────────────────────────────────────────────────────────

function school(id: string, name: string, over: Partial<SchoolMetrics> = {}, facts: Partial<AskSchool> = {}): AskSchool {
  const m = metrics(over);
  const f = { plan: 'shikhara', active: true, trialDaysLeft: null, trialExpired: false, contractStudents: 100, ...facts };
  return {
    id, name, testSchool: false, usdToInr: 95.5, metrics: m, ...f,
    health: scoreHealth(m, { ...live, plan: f.plan, active: f.active, trialDaysLeft: f.trialDaysLeft, trialExpired: f.trialExpired }),
  } as AskSchool;
}
const withOps = (ops: Partial<SchoolMetrics['ops']>) => ({ ops: { ...metrics().ops, ...ops } });
const schools = [
  school('a', 'Greenwood High', withOps({ feeCollected: 30_000, aiCostUsd30: 5 })),
  school('b', 'Lakeside Public', withOps({ feeCollected: 70_000, aiCostUsd30: 20 }), { plan: 'pilot', trialDaysLeft: 12 }),
  school('c', 'Hillview Academy', { ...withOps({ aiCostUsd30: 2 }), data: { ...metrics().data, studentsNoParent: 7 }, roles: { ...metrics().roles, teacher: role(10, 4) } }),
  { ...school('t', 'Sthara Test School', withOps({ feeCollected: 0 })), testSchool: true },
];

test('ask: threshold questions', () => {
  const a = ask('Which schools have fee collection under 50%?', schools);
  assert.deepEqual(a.rows.map(r => r.id), ['a']);
  assert.match(a.reading, /fee collection, under 50%, lowest first/);
  assert.deepEqual(ask('fees collected below 80', schools).rows.map(r => r.id), ['a', 'b']);
  assert.deepEqual(ask('teachers active under 60%', schools).rows.map(r => r.id), ['c']);
});

test('ask: implied filters and sort direction', () => {
  assert.deepEqual(ask('pilots ending in 30 days', schools).rows.map(r => r.id), ['b']);
  assert.deepEqual(ask('schools with students without a parent', schools).rows.map(r => r.id), ['c']);
  assert.deepEqual(ask('top 2 by AI cost', schools).rows.map(r => r.id), ['b', 'a']);
  assert.equal(ask('lowest adoption', schools).rows[0].id, 'c');
  assert.equal(ask('shikhara schools by ai cost', schools).rows.length, 2);
});

test('ask: test schools only when asked; unknown questions get examples', () => {
  assert.ok(!ask('fee collection', schools).rows.some(r => r.id === 't'));
  assert.ok(ask('test school fee collection', schools).rows.some(r => r.id === 't'));
  const none = ask('what is the weather', schools);
  assert.equal(none.ok, false);
  assert.ok(none.help!.length > 3);
});
