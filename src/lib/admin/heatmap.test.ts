import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmap, scoreOf, type HeatSubmission } from './heatmap';

const sub = (o: Partial<HeatSubmission>): HeatSubmission => ({
  student_id: 's1', assignment_id: 'a1', score: null, max_score: null, final_grade: null, ai_score: null, ai_max: null, ...o,
});

test('scoreOf: final_grade "x/y" wins, then score, then the AI score; max defaults to 10', () => {
  assert.deepEqual(scoreOf(sub({ score: 3, max_score: 5, final_grade: '8/10' })), { score: 8, max: 10 });
  assert.deepEqual(scoreOf(sub({ score: 3, max_score: 5 })), { score: 3, max: 5 });
  assert.deepEqual(scoreOf(sub({ ai_score: 6 })), { score: 6, max: 10 });
  assert.equal(scoreOf(sub({})), null);
  assert.equal(scoreOf(sub({ final_grade: 'A/B' })), null);
});

test('buildHeatmap pools each class per subject and averages the subjects', () => {
  const students = [
    { id: 's1', student_class: '9-A', branch: null }, { id: 's2', student_class: '9-A', branch: null },
    { id: 's3', student_class: null, branch: null },
  ];
  const assignments = [{ id: 'm', subject: 'Maths' }, { id: 'e', subject: 'English' }, { id: 'g', subject: null }];
  const h = buildHeatmap(students, assignments, [
    sub({ student_id: 's1', assignment_id: 'm', score: 8, max_score: 10 }),
    sub({ student_id: 's2', assignment_id: 'm', score: 4, max_score: 10 }),
    sub({ student_id: 's1', assignment_id: 'g', score: 1, max_score: 1 }),
    sub({ student_id: 'gone', assignment_id: 'm', score: 0, max_score: 10 }), // no longer on roll: ignored
  ]);
  assert.deepEqual(h.subjects, ['English', 'General', 'Maths']);
  const a = h.classes.find(c => c.className === '9-A')!;
  assert.equal(a.studentCount, 2);
  assert.deepEqual(a.subjectScores, { English: null, General: 100, Maths: 60 });
  assert.equal(a.overallAvg, 80);
  const u = h.classes.find(c => c.className === 'Unassigned')!;
  assert.equal(u.studentCount, 1);
  assert.equal(u.overallAvg, null);
});

test('buildHeatmap counts every row it is given (no 1,000-row ceiling)', () => {
  const students = Array.from({ length: 1500 }, (_, i) => ({ id: `s${i}`, student_class: '10-B', branch: null }));
  const subs = students.map(s => sub({ student_id: s.id, assignment_id: 'm', score: 5, max_score: 10 }));
  const h = buildHeatmap(students, [{ id: 'm', subject: 'Maths' }], subs);
  assert.equal(h.classes[0].studentCount, 1500);
  assert.equal(h.classes[0].subjectScores.Maths, 50);
});
