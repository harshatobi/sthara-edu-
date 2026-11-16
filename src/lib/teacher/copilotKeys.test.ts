import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageKeySource, normText, paperKeySource, replyKeySource } from './copilotKeys';

const base = { cls: 'Class 9-B', subject: 'Science', chapter: 'The Fundamental Unit of Life', messages: [{ role: 'teacher', text: 'Make a worksheet on cells, 10 questions.' }] };

test('the same request, written differently, gets the same key', () => {
  assert.equal(normText('  Make a Worksheet!  on   cells… '), 'make a worksheet on cells');
  const a = replyKeySource(base);
  assert.equal(a, replyKeySource({ ...base, cls: '9b', subject: 'science', chapter: 'the fundamental unit of life', messages: [{ role: 'user', text: 'make a worksheet on cells 10 questions' }] }));
  const st = { kind: 'worksheet', count: 10, difficulty: 'Mixed', targets: ['b', 'a'] };
  assert.equal(replyKeySource({ ...base, studio: st }), replyKeySource({ ...base, studio: { ...st, targets: ['a', 'b'] } }), 'student order does not matter');
});

test('a different class, chapter, setting or follow-up is a different request', () => {
  const a = replyKeySource(base);
  assert.notEqual(a, replyKeySource({ ...base, cls: 'Class 9-A' }));
  assert.notEqual(a, replyKeySource({ ...base, chapter: 'Tissues' }));
  assert.notEqual(replyKeySource({ ...base, studio: { kind: 'worksheet', count: 10 } }), replyKeySource({ ...base, studio: { kind: 'worksheet', count: 12 } }));
  assert.notEqual(a, replyKeySource({ ...base, messages: [...base.messages, { role: 'copilot', text: 'Here it is' }, { role: 'teacher', text: 'Make it easier' }] }));
});

test('board papers and pictures match across sections of a class level', () => {
  assert.equal(paperKeySource('science-std', 'Class 10-A', 'Science'), paperKeySource('science-std', '10B', 'science'));
  assert.notEqual(paperKeySource('science-std', 'Class 10-A', 'Science'), paperKeySource('science-std', 'Class 9-A', 'Science'));
  assert.notEqual(paperKeySource('maths-std', 'Class 10-A', 'Maths'), paperKeySource('maths-basic', 'Class 10-A', 'Maths'));
  assert.equal(imageKeySource('A farmer ploughing a field.', 'Class 7-A', 'Social Science'), imageKeySource('a farmer ploughing a field', '7C', 'social science'));
  assert.notEqual(imageKeySource('A farmer ploughing a field', 'Class 7-A', 'Social Science'), imageKeySource('A farmer sowing seeds', 'Class 7-A', 'Social Science'));
});
