import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultKind, officialName, officialSubjects, planLinking, resolveSubject, subjectSlug, suggestedClassSubjects } from './catalog';

test('slugs are stable, class-independent keys', () => {
  assert.equal(subjectSlug('English Language and Literature'), 'english-language-and-literature');
  assert.equal(subjectSlug('Telugu (Telangana)'), 'telugu-telangana');
  assert.equal(subjectSlug('Physical Education and Well-being'), 'physical-education-and-well-being');
});

test('resolve: everyday names map to the official subject of that class level', () => {
  assert.equal(resolveSubject('Class 10-A', 'Maths')?.name, 'Mathematics');
  assert.equal(resolveSubject('Class 9-B', 'SST')?.name, 'Social Science');
  assert.equal(resolveSubject('Class 10-A', 'English')?.name, 'English Language and Literature');
  assert.equal(resolveSubject('Class 11-A', 'English')?.name, 'English Core');
  assert.equal(resolveSubject('Class 12-C', 'physics')?.key, 'physics');
  assert.equal(resolveSubject('Class 8-A', 'Maths')?.level, '8');
  // Same subject key across levels, so TML follows a student from 9 to 10.
  assert.equal(resolveSubject('9-A', 'Mathematics')?.key, resolveSubject('10-A', 'Mathematics')?.key);
  assert.equal(resolveSubject('Class 10-A', 'Underwater Basket Weaving'), null);
  assert.equal(resolveSubject('Class 7-A', 'Maths'), null, 'no curriculum for Class 7 yet');
  assert.equal(officialName('Class 10-A', 'maths'), 'Mathematics');
  assert.equal(officialName('Class 7-A', 'Maths'), 'Maths');
});

test('core vs elective defaults', () => {
  assert.equal(defaultKind('Class 10-A', 'Mathematics'), 'core');
  assert.equal(defaultKind('Class 10-A', 'Painting'), 'elective');
  assert.equal(defaultKind('Class 11-A', 'English Core'), 'core');
  assert.equal(defaultKind('Class 11-A', 'Physics'), 'elective');
  assert.equal(defaultKind('Class 8-A', 'Science'), 'core');
  assert.equal(defaultKind('Class 8-A', 'Sanskrit'), 'elective');
  assert.deepEqual(suggestedClassSubjects('Class 10-A').map(s => s.name), ['English Language and Literature', 'Hindi Course A', 'Mathematics', 'Science', 'Social Science']);
  assert.ok(officialSubjects('Class 12').some(g => g.subjects.some(s => s.name === 'Accountancy')));
});

test('linking plan: class lists, teacher assignments, what is already linked and what cannot be', () => {
  const plan = planLinking(
    [
      { id: 'c10', name: 'Class 10-A', subjects: ['Maths', 'English', 'Science', 'Robotics Club'] },
      { id: 'c7', name: 'Class 7-B', subjects: ['Maths'] },
    ],
    [{ classId: 'c10', subjectKey: 'science', subjectName: 'Science', kind: 'core' }],
    [{ id: 't1', name: 'Priya', assignments: [{ class: '10A', subject: 'Maths' }, { class: 'Class 10-A', subject: 'Yoga Club' }, { class: '12-Z', subject: 'Physics' }] }],
  );
  const c10 = plan.classes.find(c => c.classId === 'c10')!;
  assert.deepEqual(c10.items.map(i => [i.raw, i.status, i.official?.name ?? null]), [
    ['Maths', 'will-link', 'Mathematics'],
    ['English', 'will-link', 'English Language and Literature'],
    ['Science', 'linked', 'Science'],
    ['Robotics Club', 'no-match', null],
  ]);
  assert.equal(plan.classes.find(c => c.classId === 'c7')!.items[0].status, 'unknown-class');
  const t = plan.teachers[0].items;
  assert.deepEqual(t.map(i => [i.cls, i.status]), [['Class 10-A', 'will-link'], ['Class 10-A', 'no-match'], ['12-Z', 'unknown-class']]);
  assert.equal(t[0].official?.name, 'Mathematics');
});
