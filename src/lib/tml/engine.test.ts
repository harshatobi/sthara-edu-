import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blendFinalTml, calculateTopicTml, computeStudentTml, evidenceTopicName, getRecencyWeight, getTutorDepthScore,
  mapMasteryBand, normalizeComponentType, normalizeTutorVolume, type TmlEvidenceItem,
} from './engine';

// The TML specification (True_Mastery_Level_TML_Specification.pdf) with the 2026-09-21 engagement blend:
//   academic = 0.40 H + 0.40 Q + 0.20 D, each time-decayed (14-day half-life)
//   final    = 0.70 academic + 0.10 teacher + 0.10 attendance + 0.05 app + 0.05 tutor volume
//   confidence = min(1, N/5), x0.85 after an integrity violation

const item = (score: number, componentType: string, ageDays = 0, maxScore = 100): TmlEvidenceItem => ({ score, maxScore, componentType, ageDays });
// Scores are rounded to one decimal, so 0.05 is the tightest honest tolerance.
const near = (actual: number | null, expected: number, msg?: string) => assert.ok(actual !== null && Math.abs(actual - expected) <= 0.05 + 1e-9, `${msg ?? ''} expected ~${expected}, got ${actual}`);

// ── Time decay ────────────────────────────────────────────────────────────────

test('decay: a 14-day half-life, and a future date weighs the same as today', () => {
  near(getRecencyWeight(0), 1);
  near(getRecencyWeight(14), 0.5);
  near(getRecencyWeight(28), 0.25);
  assert.equal(getRecencyWeight(-3), 1);
});

test('decay: older evidence counts for less inside a component (H)', () => {
  // 60 today (weight 1) and 100 a half-life ago (weight 0.5): (60 + 50) / 1.5
  near(calculateTopicTml([item(60, 'homework', 0), item(100, 'homework', 14)]).academicTml, 73.3);
  // Same scores, reversed ages: the recent 100 dominates.
  near(calculateTopicTml([item(60, 'homework', 14), item(100, 'homework', 0)]).academicTml, 86.7);
});

test('decay: a single item is its own score however old it is', () => {
  assert.equal(calculateTopicTml([item(70, 'quiz', 90)]).academicTml, 70);
});

// ── Components ────────────────────────────────────────────────────────────────

test('components: quiz absorbs assessments, tests, exams and retention; anything else is homework', () => {
  for (const t of ['quiz', 'Assessment', 'midterm test', 'Unit Exam', 'retention check']) assert.equal(normalizeComponentType(t), 'quiz', t);
  for (const t of ['homework', 'classwork', '', undefined, 'project']) assert.equal(normalizeComponentType(t), 'homework', String(t));
  assert.equal(normalizeComponentType('Tutor session'), 'tutor');
});

test('tutor depth (D): unaided 100, one hint 60, more 30, revealed 10 whatever the hints', () => {
  assert.equal(getTutorDepthScore(0), 100);
  assert.equal(getTutorDepthScore(-1), 100);
  assert.equal(getTutorDepthScore(1), 60);
  assert.equal(getTutorDepthScore(2), 30);
  assert.equal(getTutorDepthScore(7), 30);
  assert.equal(getTutorDepthScore(0, true), 10);
  assert.equal(getTutorDepthScore(3, true), 10);
});

test('scores are read as a percentage of their maximum and clamped to 0-100', () => {
  assert.equal(calculateTopicTml([item(8, 'homework', 0, 10)]).academicTml, 80);
  assert.equal(calculateTopicTml([item(12, 'homework', 0, 10)]).academicTml, 100);
  assert.equal(calculateTopicTml([item(-5, 'homework', 0, 10)]).academicTml, 0);
  assert.equal(calculateTopicTml([item(5, 'homework', 0, 0)]).academicTml, 0);
  assert.equal(calculateTopicTml([item(70, 'homework', Number.NaN), item(50, 'homework', 0)]).academicTml, 50, 'an item with no usable age is ignored');
  assert.equal(calculateTopicTml([{ score: 64, componentType: 'quiz', ageDays: 0 }]).academicTml, 64, 'no maxScore means already a percentage');
});

// ── Academic composite ────────────────────────────────────────────────────────

test('academic: 0.40 H + 0.40 Q + 0.20 D with all three present', () => {
  near(calculateTopicTml([item(80, 'homework'), item(90, 'quiz'), item(100, 'tutor')]).academicTml, 0.4 * 80 + 0.4 * 90 + 0.2 * 100);
  near(calculateTopicTml([item(50, 'homework'), item(50, 'quiz'), item(10, 'tutor')]).academicTml, 42);
});

test('academic: weights renormalise over the components that have evidence', () => {
  assert.equal(calculateTopicTml([item(80, 'homework')]).academicTml, 80);
  near(calculateTopicTml([item(90, 'quiz'), item(100, 'tutor')]).academicTml, (0.4 * 90 + 0.2 * 100) / 0.6);
  near(calculateTopicTml([item(40, 'homework'), item(100, 'quiz')]).academicTml, 70);
});

test('academic: no evidence gives no score, not zero', () => {
  const r = calculateTopicTml([]);
  assert.equal(r.academicTml, null);
  assert.equal(r.confidenceBand, 'insufficient');
  assert.equal(r.totalItemCount, 0);
});

test('academic: rounded to one decimal place', () => {
  assert.equal(calculateTopicTml([item(1, 'homework', 0, 3)]).academicTml, 33.3);
});

// ── Confidence ────────────────────────────────────────────────────────────────

test('confidence: min(1, N/5); fewer than 2 insufficient, 2-4 provisional, 5 or more firm', () => {
  const at = (n: number) => calculateTopicTml(Array.from({ length: n }, () => item(80, 'homework')));
  assert.deepEqual([1, 2, 4, 5, 12].map(n => { const r = at(n); return [r.confidence, r.confidenceBand]; }), [
    [0.2, 'insufficient'], [0.4, 'provisional'], [0.8, 'provisional'], [1, 'firm'], [1, 'firm'],
  ]);
});

test('confidence: every component counts toward N', () => {
  const r = calculateTopicTml([item(80, 'homework'), item(80, 'quiz'), item(80, 'tutor'), item(80, 'classwork'), item(80, 'test')]);
  assert.equal(r.totalItemCount, 5);
  assert.equal(r.confidenceBand, 'firm');
});

test('integrity: a violation multiplies confidence by 0.85 and can demote the band', () => {
  const five = Array.from({ length: 5 }, () => item(80, 'quiz'));
  const r = calculateTopicTml(five, { hadIntegrityViolation: true });
  assert.equal(r.confidence, 0.85);
  assert.equal(r.confidenceBand, 'provisional');
  assert.equal(r.integrityPenaltyApplied, true);
  assert.equal(r.academicTml, 80, 'the penalty lowers confidence, never the score');
  // Two items (0.4, provisional) fall to 0.34: insufficient.
  assert.equal(calculateTopicTml(five.slice(0, 2), { hadIntegrityViolation: true }).confidenceBand, 'insufficient');
  // Nothing to penalise without evidence.
  assert.equal(calculateTopicTml([], { hadIntegrityViolation: true }).integrityPenaltyApplied, false);
});

// ── Final blend ───────────────────────────────────────────────────────────────

test('final: 0.70 academic + 0.10 teacher + 0.10 attendance + 0.05 app + 0.05 tutor volume', () => {
  near(blendFinalTml(80, { teacherEngagement: 90, attendance: 95, appEngagement: 70, tutorVolume: 50 }), 0.7 * 80 + 9 + 9.5 + 3.5 + 2.5);
  near(blendFinalTml(0, { teacherEngagement: 0, attendance: 0, appEngagement: 0, tutorVolume: 0 }), 0);
  near(blendFinalTml(100, { teacherEngagement: 100, attendance: 100, appEngagement: 100, tutorVolume: 100 }), 100);
});

test('final: unmeasured engagement counts as 100; no academic score stays no score', () => {
  near(blendFinalTml(80), 86);
  near(blendFinalTml(0), 30);
  assert.equal(blendFinalTml(null, { attendance: 90 }), null);
});

test('tutor volume: sessions in the window against a ceiling of 10, capped at 100', () => {
  assert.deepEqual([0, 3, 5, 10, 25].map(n => normalizeTutorVolume(n)), [0, 30, 50, 100, 100]);
  assert.equal(normalizeTutorVolume(3, 4), 75);
});

// ── Mastery bands ─────────────────────────────────────────────────────────────

test('bands: exact thresholds and colours', () => {
  const b = (x: number) => { const r = mapMasteryBand(x)!; return `${r.band} ${r.color}`; };
  assert.deepEqual([100, 90, 89.9, 75, 74.9, 50, 49.9, 35, 34.9, 0].map(b), [
    'Exemplary #10B981', 'Exemplary #10B981', 'Proficient #34D399', 'Proficient #34D399', 'Developing #F5B60B',
    'Developing #F5B60B', 'Critical Gap #F98A4B', 'Critical Gap #F98A4B', 'Severe Need #E11D48', 'Severe Need #E11D48',
  ]);
  assert.equal(mapMasteryBand(null), null);
});

// ── Topic bucketing ───────────────────────────────────────────────────────────

test('topic: the first real unit, else the title, else Core Concepts', () => {
  assert.equal(evidenceTopicName({ units: ['general', 'Heredity', 'Evolution'], title: 'HW 3' }), 'Heredity');
  assert.equal(evidenceTopicName({ units: ['General'], title: '  Light  ' }), 'Light');
  assert.equal(evidenceTopicName({ units: 'Heredity', title: null }), 'Core Concepts');
  assert.equal(evidenceTopicName(null), 'Core Concepts');
});

// ── computeStudentTml against a stand-in database ─────────────────────────────

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

/**
 * Just enough of the Supabase query builder: filters rows by their `eq` filters (so a dropped
 * `student_id` scope shows up as foreign rows leaking in), records every filter, and inserts.
 * A table named in `fail` returns an error instead of rows.
 */
function fakeDb(rows: Record<string, Record<string, unknown>[]>, fail: string[] = []) {
  const filters: Record<string, [string, string, unknown][]> = {};
  const inserted: Record<string, unknown>[] = [];
  const from = (table: string) => {
    const f = (filters[table] ??= []);
    const matching = () => (rows[table] ?? []).filter(r => f.every(([op, c, v]) => op !== 'eq' || !(c in r) || r[c] === v));
    const result = () => (fail.includes(table) ? { data: null, error: { message: `${table} down` } } : { data: matching(), error: null });
    const one = async () => (fail.includes(table) ? result() : { data: matching()[0] ?? null, error: null });
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, limit: () => q,
      eq: (c: string, v: unknown) => (f.push(['eq', c, v]), q),
      neq: (c: string, v: unknown) => (f.push(['neq', c, v]), q),
      gt: (c: string, v: unknown) => (f.push(['gt', c, v]), q),
      single: one, maybeSingle: one,
      insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (fail.includes(`insert:${table}`)) return { error: { message: 'insert down' } };
        for (const row of Array.isArray(payload) ? payload : [payload]) inserted.push({ table, ...row });
        return { error: null };
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
    };
    return q;
  };
  return { db: { from }, filters, inserted };
}

const heredity = { id: 'a1', subject: 'Science', title: 'HW 1', units: ['Heredity'], type: 'homework', proctored: false };
const lightQuiz = { id: 'a2', subject: 'Science', title: 'Quiz', units: ['Light'], type: 'quiz', proctored: true };
const algebra = { id: 'a3', subject: 'Mathematics', title: 'Algebra', units: ['Polynomials'], type: 'homework', proctored: false };

test('compute: blends, bands and stores one snapshot per topic from the evidence', async () => {
  const { db, filters, inserted } = fakeDb({
    users: [{ id: 's1', school_id: 'sch1' }],
    submission_items: [
      { id: 'i1', student_id: 's1', score: 8, max_score: 10, component_type: 'homework', created_at: ago(0), submission_id: 'sub1', assignments: heredity },
      { id: 'i2', student_id: 's1', score: 6, max_score: 10, component_type: 'quiz', created_at: ago(0), submission_id: 'sub2', assignments: lightQuiz },
    ],
    submissions: [
      { id: 'sub1', score: 1, max_score: 10, submitted_at: ago(0), assignments: heredity }, // covered by i1: not counted twice
      { id: 'sub3', score: 9, max_score: 10, submitted_at: ago(0), assignments: algebra },
      { id: 'subX', student_id: 'someone-else', score: 0, max_score: 10, submitted_at: ago(0), assignments: algebra }, // another student: never read
    ],
    tutor_sessions: [
      { id: 't1', subject: 'Science', topic: 'Heredity', hint_depth: 1, answer_revealed: false, created_at: ago(1) },
      { id: 't2', subject: 'Science', topic: 'Heredity', hint_depth: 0, answer_revealed: false, created_at: ago(40) },
    ],
    proctor_alerts: [{ assignment_id: 'a2', switch_count: 3 }],
    engagement_scores: [{ attendance_score: 90, app_engagement_score: 60, teacher_engagement_score: 80 }],
  });

  const out = await computeStudentTml(db, 's1');
  const by = Object.fromEntries(out.topics.map(t => [t.topicName, t]));
  assert.deepEqual(Object.keys(by).sort(), ['Heredity', 'Light', 'Polynomials']);

  // Only teacher-confirmed marks move TML; unreviewed and rejected submissions are left out.
  assert.deepEqual(filters.submission_items.find(f => f[1] === 'teacher_confirmed'), ['eq', 'teacher_confirmed', true]);
  assert.deepEqual(filters.submissions.find(f => f[1] === 'teacher_approved'), ['eq', 'teacher_approved', true]);
  for (const t of ['submission_items', 'submissions', 'tutor_sessions', 'proctor_alerts', 'engagement_scores']) {
    assert.deepEqual(filters[t].find(f => f[1] === 'student_id'), ['eq', 'student_id', 's1'], `${t} is scoped to the student`);
  }

  // Heredity: H = 80; D from a 1-hint session (60, 1 day old) and an unaided one (100, 40 days old).
  const w1 = getRecencyWeight(1), w40 = getRecencyWeight(40);
  const d = (60 * w1 + 100 * w40) / (w1 + w40);
  near(by.Heredity.academicTml, (0.4 * 80 + 0.2 * d) / 0.6, 'Heredity academic');
  assert.equal(by.Heredity.totalItemCount, 3, 'the covered submission is not counted again');
  // Tutor volume counts only the last 30 days: 1 session of 10 = 10.
  const engagement = (n: number) => 0.7 * n + 0.1 * 80 + 0.1 * 90 + 0.05 * 60 + 0.05 * 10;
  near(by.Heredity.finalTml, Math.round(engagement(by.Heredity.academicTml) * 10) / 10, 'Heredity final');

  // Light: a proctored quiz with a tab-switch alert keeps its score, loses confidence.
  assert.equal(by.Light.academicTml, 60);
  assert.equal(by.Light.integrityPenaltyApplied, true);
  assert.equal(by.Light.confidence, 0.17);
  assert.equal(by.Heredity.integrityPenaltyApplied, false, 'only the flagged assignment is penalised');
  assert.equal(by.Polynomials.integrityPenaltyApplied, false);

  // Polynomials comes from a top-level submission with no per-question items.
  assert.equal(by.Polynomials.academicTml, 90);
  assert.equal(by.Polynomials.subject, 'Mathematics');
  // The band follows the final blend, not the academic score: 0.7 x 90 + 8 + 9 + 3 + 0.5 = 83.5.
  assert.equal(by.Polynomials.finalTml, 83.5);
  assert.equal(by.Polynomials.totalItemCount, 1, 'another student\'s submission is not counted');
  assert.equal(by.Polynomials.masteryBand.band, 'Proficient');

  // One append-only snapshot per topic, carrying the band and the evidence behind it.
  assert.equal(inserted.length, 3);
  const row = inserted.find(r => r.topic_name === 'Light')!;
  assert.equal(row.table, 'tml_scores');
  assert.equal(row.student_id, 's1');
  assert.equal(row.school_id, 'sch1');
  assert.equal(row.score, by.Light.finalTml);
  assert.equal(row.confidence_band, 'insufficient');
  assert.equal(row.item_count, 1);
  assert.equal((row.components as { integrityPenaltyApplied: boolean }).integrityPenaltyApplied, true);
  assert.equal((row.components as { masteryBand: string }).masteryBand, by.Light.masteryBand.band);
});

test('compute: a subject filter leaves other subjects out entirely', async () => {
  const { db, inserted } = fakeDb({
    users: [{ id: 's1', school_id: 'sch1' }],
    submissions: [
      { id: 'sub1', score: 7, max_score: 10, submitted_at: ago(0), assignments: heredity },
      { id: 'sub2', score: 9, max_score: 10, submitted_at: ago(0), assignments: algebra },
    ],
    tutor_sessions: [{ id: 't1', subject: 'mathematics', topic: 'Polynomials', hint_depth: 0, answer_revealed: false, created_at: ago(0) }],
  });
  const out = await computeStudentTml(db, 's1', 'Mathematics');
  assert.deepEqual(out.topics.map(t => t.topicName), ['Polynomials']);
  assert.equal(out.topics[0].totalItemCount, 2, 'the filter matches the tutor session case-insensitively');
  assert.deepEqual(inserted.map(r => r.subject), ['Mathematics']);
});

test('compute: no engagement row and no tutor sessions means all engagement is neutral, and an unknown student is refused', async () => {
  const { db } = fakeDb({ users: [{ id: 's1', school_id: 'sch1' }], submissions: [{ id: 'x', score: 5, max_score: 10, submitted_at: ago(0), assignments: algebra }] });
  const out = await computeStudentTml(db, 's1');
  near(out.topics[0].finalTml, 0.7 * 50 + 30, 'every engagement term defaults to 100');
  await assert.rejects(computeStudentTml(fakeDb({}).db, 'nobody'), /Student not found/);
});

test('compute: topics are keyed by subject and normalised name', async () => {
  const physicsLight = { ...lightQuiz, id: 'a9', subject: 'Physics' };
  const { db } = fakeDb({
    users: [{ id: 's1', school_id: 'sch1' }],
    submissions: [
      { id: 'a', score: 8, max_score: 10, submitted_at: ago(0), assignments: lightQuiz },
      { id: 'b', score: 4, max_score: 10, submitted_at: ago(0), assignments: physicsLight },
      { id: 'c', score: 6, max_score: 10, submitted_at: ago(0), assignments: heredity },
    ],
    tutor_sessions: [{ id: 't1', subject: 'science', topic: ' heredity ', hint_depth: 0, answer_revealed: false, created_at: ago(0) }],
  });
  const out = await computeStudentTml(db, 's1');
  assert.deepEqual(out.topics.map(t => `${t.subject}/${t.topicName}`).sort(), ['Physics/Light', 'Science/Heredity', 'Science/Light']);
  assert.equal(out.topics.find(t => t.topicName === 'Heredity')!.totalItemCount, 2, 'the tutor session joined the assignment topic');
});

test('compute: rows with no usable timestamp or a zero maximum are skipped, not guessed', async () => {
  const { db } = fakeDb({
    users: [{ id: 's1', school_id: 'sch1' }],
    submission_items: [
      { id: 'i1', score: 5, max_score: 0, component_type: 'homework', created_at: ago(0), submission_id: 'sub1', assignments: heredity },
      { id: 'i2', score: 9, max_score: 10, component_type: 'homework', created_at: null, submission_id: 'sub2', assignments: heredity },
    ],
    submissions: [
      { id: 'sub3', score: 5, max_score: 0, submitted_at: ago(0), assignments: algebra },
      { id: 'sub4', score: 7, max_score: 10, submitted_at: 'not a date', created_at: null, assignments: algebra },
    ],
    tutor_sessions: [{ id: 't1', subject: 'Science', topic: 'Heredity', hint_depth: 0, answer_revealed: false, created_at: 'garbage' }],
  });
  const out = await computeStudentTml(db, 's1');
  assert.equal(out.computedTopicsCount, 0);
});

test('compute: a failed read stops the run and nothing is saved', async () => {
  for (const table of ['users', 'submission_items', 'submissions', 'tutor_sessions', 'proctor_alerts', 'engagement_scores']) {
    const { db, inserted } = fakeDb({
      users: [{ id: 's1', school_id: 'sch1' }],
      submissions: [{ id: 'x', score: 5, max_score: 10, submitted_at: ago(0), assignments: algebra }],
    }, [table]);
    await assert.rejects(computeStudentTml(db, 's1'), new RegExp(`reading ${table} failed`), table);
    assert.equal(inserted.length, 0, `${table}: no snapshot from partial evidence`);
  }
});

test('compute: a failed snapshot save is reported, not swallowed', async () => {
  const { db } = fakeDb({
    users: [{ id: 's1', school_id: 'sch1' }],
    submissions: [{ id: 'x', score: 5, max_score: 10, submitted_at: ago(0), assignments: algebra }],
  }, ['insert:tml_scores']);
  await assert.rejects(computeStudentTml(db, 's1'), /saving tml_scores failed/);
});
