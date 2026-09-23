import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromGenerated, sanitizeQuestions, suggestedScores, totalMarks, typeSummary } from './questions';
import { displayClass, inScope, scopeClasses, subjectsIn, teachingScope } from './scope';
import { assembleDesk } from './desk';

test('sanitizeQuestions accepts a valid mixed paper and totals marks', () => {
  const { questions, error } = sanitizeQuestions([
    { type: 'mcq', questionText: 'Discriminant of x² + 1?', options: ['-4', '4', '0', '1'], answer: 0 },
    { type: 'short', questionText: 'State the quadratic formula.', marks: 3 },
    { type: 'upload', prompt: 'Show your working for Q1.', marks: 5 },
  ]);
  assert.equal(error, null);
  assert.equal(questions.length, 3);
  assert.equal(questions[0].marks, 1, 'MCQ is always 1 mark');
  assert.equal(totalMarks(questions), 9);
  assert.equal(typeSummary(questions), '1 MCQ · 1 written · 1 upload');
});

test('sanitizeQuestions reports what a teacher must fix', () => {
  assert.match(sanitizeQuestions([{ type: 'short', questionText: '  ' }]).error!, /Question 1 has no text/);
  assert.match(sanitizeQuestions([{ type: 'mcq', questionText: 'Q', options: ['a', ''], answer: 0 }]).error!, /fill in every option/);
  assert.match(sanitizeQuestions([{ type: 'mcq', questionText: 'Q', options: ['a', 'b'], answer: 5 }]).error!, /mark the correct option/);
});

test('fromGenerated maps both AI generator formats and drops broken items', () => {
  const quiz = fromGenerated({ questions: [
    { question: 'Q1', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 2, difficulty: 'hard', explanation: 'because' },
    { question: 'Q2', options: ['a', 'b'], correctAnswerIndex: 9 },
  ] });
  assert.equal(quiz.length, 1);
  assert.deepEqual([quiz[0].answer, quiz[0].level, quiz[0].why], [2, 'HARD', 'because']);

  const hw = fromGenerated({ questions: [
    { question: 'MCQ', type: 'mcq', options: ['A. one', 'B. two', 'C. three', 'D. four'], correctOption: 'B', marks: 2 },
    { question: 'Explain', type: 'long', marks: 8, answer: 'model answer text' },
  ] });
  assert.deepEqual(hw[0].options, ['one', 'two', 'three', 'four'], 'letter prefixes stripped');
  assert.equal(hw[0].answer, 1);
  assert.deepEqual([hw[1].type, hw[1].marks], ['short', 8]);
});

test('suggestedScores marks MCQs from the key and leaves written answers to the teacher', () => {
  const { questions } = sanitizeQuestions([
    { type: 'mcq', questionText: 'Q', options: ['a', 'b'], answer: 1 },
    { type: 'mcq', questionText: 'Q', options: ['a', 'b'], answer: 1 },
    { type: 'short', questionText: 'Why?', marks: 4 },
  ]);
  assert.deepEqual(suggestedScores(questions, { 0: 1, 1: 0, 2: 'text' }), [1, 0, null]);
});

test('teaching scope: subject rows, class-teacher class, and enforcement', () => {
  const scope = teachingScope({
    assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }, { class: '9b', subject: 'Mathematics' }],
    teacher_class: '10A', teacher_subject: 'Mathematics',
  });
  assert.deepEqual(scopeClasses(scope), ['Class 10-A', 'Class 9-B']);
  assert.deepEqual(subjectsIn(scope, '10-a'), ['Mathematics']);
  assert.ok(inScope(scope, 'Class 9-B', 'mathematics'));
  assert.ok(!inScope(scope, 'Class 9-B', 'Science'), 'cannot post a subject you do not teach');
  assert.ok(!inScope(scope, 'Class 11-A', 'Mathematics'), 'cannot post to a class you do not teach');
  assert.equal(displayClass('10a'), 'Class 10-A');
});

test('assembleDesk: rosters, pending review, and class TML from the latest snapshots', () => {
  const scope = teachingScope({ assignments: [{ class: 'Class 10-A', subject: 'Mathematics' }] });
  const desk = assembleDesk({
    students: [
      { id: 's1', name: 'Aarav', student_class: 'Class 10-A' },
      { id: 's2', name: 'Diya', student_class: 'Class 10-A' },
      { id: 's3', name: 'Kabir', student_class: 'Class 9-B' },
    ],
    assignments: [{ id: 'a1', title: 'HW', type: 'homework', class: 'Class 10-A', subject: 'Mathematics', status: 'published',
      questions: [{ type: 'short', questionText: 'Q', marks: 2 }], units: ['Quadratic Equations'], due_date: '2026-10-01' }],
    submissions: [{ id: 'sub1', assignment_id: 'a1', student_id: 's1', teacher_approved: null, score: null, answers: { 0: 'x' }, type: 'typed' }],
    tml: [
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Quadratic Equations', score: 40, computed_at: '2026-09-01' },
      { student_id: 's1', subject: 'Mathematics', topic_name: 'Quadratic Equations', score: 70, computed_at: '2026-09-20' },
      { student_id: 's2', subject: 'Mathematics', topic_name: 'Polynomials', score: 30, computed_at: '2026-09-20' },
    ],
    alerts: [], items: [],
  }, { id: 't', name: 'Priya', subject: 'Mathematics' }, scope, 'live');

  const [c] = desk.classes;
  assert.equal(c.students.length, 2, 'Kabir is in 9-B, not this class');
  assert.equal(c.tml, 50, 'latest snapshot (70) and Diya (30) average to 50');
  assert.deepEqual(c.belowForty.map(s => s.name), ['Diya']);
  assert.equal(c.pendingReview, 1);
  const [a] = desk.assignments;
  assert.equal(a.roster.length, 2);
  assert.equal(a.chapter, 'Quadratic Equations');
  assert.equal(a.submissions[0].state, 'pending');
});
