import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetOf, type Lookups } from './datasets';
import { fingerprint } from '@/lib/studio/fingerprint';

const look: Lookups = { students: new Map(), classes: new Map(), sheets: new Map() };
const d = datasetOf('question_bank')!;

test('a school past-paper MCQ becomes a bank row with a fingerprint and the right answer', () => {
  const r = d.build({ class: 'Class 10', subject: 'Science', chapter: 'Life Processes', type: 'mcq', marks: 1, question: 'Which organelle is the powerhouse of the cell?', option_a: 'Nucleus', option_b: 'Mitochondria', answer: '(b)', model_answer: 'ATP' }, 2, look);
  assert.equal(r.ok, true);
  const row = (r as { row: any }).row;
  assert.equal(row.chapter_key, 'life processes');
  assert.deepEqual(row.body, { text: 'Which organelle is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria'], answer: 1, scheme: 'ATP' });
  assert.equal(row.fingerprint, fingerprint('Which organelle is the powerhouse of the cell?', ['Nucleus', 'Mitochondria']));
  assert.equal(d.identity({ question: 'which organelle is the POWERHOUSE of the cell', option_a: 'Mitochondria', option_b: 'Nucleus' }), row.fingerprint, 'same question, options in any order');
});

test('problems are reported against the column; a blank chapter is left for the tagger', () => {
  const noAns = d.build({ class: '10', subject: 'Science', type: 'mcq', marks: 1, question: 'Q?', option_a: 'x', option_b: 'y' }, 3, look);
  assert.equal(noAns.ok, false);
  assert.equal((noAns as any).problems[0].column, 'answer');
  const oneOpt = d.build({ class: '10', subject: 'Science', type: 'mcq', marks: 1, question: 'Q?', option_a: 'x', answer: 'A' }, 4, look);
  assert.equal((oneOpt as any).problems[0].column, 'option_a');
  const short = d.build({ class: '10', subject: 'Maths', type: 'numerical', marks: 2, question: 'Solve 3x + 7 = 22', answer: 'x = 5' }, 5, look);
  assert.equal((short as any).row.chapter_key, 'untagged');
  assert.equal((short as any).row.body.value, 5);
});
