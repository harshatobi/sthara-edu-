import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScope, isEnrolled, matchPicked, needsTurnCheck, scopeDigest, suggestions, validate } from './grounding';
import { containsFoulLanguage, safetySignals } from './safety';

const class10 = buildScope({
  className: 'Class 10-A', exams: [],
  subjects: [
    { key: 'english-language-and-literature', name: 'English Language and Literature', source: 'core' },
    { key: 'mathematics', name: 'Mathematics', source: 'core' },
    { key: 'science', name: 'Science', source: 'core' },
    { key: 'social-science', name: 'Social Science', source: 'core' },
  ],
});
const idx = (name: string) => class10.subjects.findIndex(s => s.name === name) + 1;
const ch = (subject: string, chapter: string) => class10.subjects[idx(subject) - 1].chapters.findIndex(c => c.name === chapter) + 1;

test('scope: enrolled subjects with official chapters and earlier-class prerequisites', () => {
  assert.equal(class10.level, '10');
  const sci = class10.subjects.find(s => s.key === 'science')!;
  assert.ok(sci.chapters.some(c => c.name === 'Acids, Bases and Salts' && c.topics.length >= 3));
  assert.deepEqual(sci.prereqs.map(p => p.level), ['9', '8']);
  assert.equal(class10.subjects.find(s => s.key === 'english-language-and-literature')!.prereqs[0].name, 'English');
  // Senior subjects draw basics from the earlier broad subject.
  const s12 = buildScope({ className: '12-B', exams: ['neet-ug'], subjects: [{ key: 'physics', name: 'Physics', source: 'elective' }] });
  assert.deepEqual(s12.subjects[0].prereqs.map(p => `${p.level} ${p.name}`).slice(0, 2), ['11 Physics', '10 Science']);
  assert.ok(s12.subjects[0].chapters.some(c => c.exams.includes('neet-ug')), 'NEET-tagged chapters');
  // Nothing enrolled, nothing in scope.
  assert.equal(buildScope({ className: 'Class 10-A', exams: [], subjects: [] }).subjects.length, 0);
});

test('picked from the list: grounded without the classifier', () => {
  const g = matchPicked(class10, 'Science', 'Acids, Bases and Salts')!;
  assert.equal(g.kind, 'syllabus'); assert.equal(g.chapter, 'Acids, Bases and Salts'); assert.equal(g.microTopic, null);
  const m = matchPicked(class10, 'science', 'Neutralisation')!;
  assert.equal(m.chapter, 'Acids, Bases and Salts'); assert.equal(m.microTopic, 'Neutralisation');
  assert.equal(matchPicked(class10, 'Science', 'Black holes'), null, 'typed topics go to the classifier');
  assert.equal(matchPicked(class10, 'Accountancy', 'Journal'), null);
  assert.ok(isEnrolled(class10, 'Mathematics') && !isEnrolled(class10, 'Accountancy'));
});

test('validate: only codes that exist in the student\'s scope get through', () => {
  const S = idx('Science'), C = ch('Science', 'Acids, Bases and Salts');
  const g = validate(class10, { kind: 'syllabus', ref: `S${S}.C${C}.t1` });
  assert.equal(g.kind, 'syllabus'); assert.equal(g.subjectKey, 'science'); assert.ok(g.microTopic);
  const p = validate(class10, { kind: 'prerequisite', ref: `S${idx('Mathematics')}.P9.C1` });
  assert.equal(p.kind, 'prerequisite'); assert.equal(p.level, '9');
  const angled = validate(class10, { kind: 'syllabus', ref: `S${idx('Social Science')}.C${ch('Social Science', 'Nationalism in India')}`, angle: 'the war\'s effect on India\'s national movement' });
  assert.equal(angled.chapter, 'Nationalism in India'); assert.match(angled.angle!, /national movement/);
  for (const bad of [{ kind: 'syllabus', ref: 'S99.C1' }, { kind: 'syllabus', ref: `S${S}.C999` }, { kind: 'syllabus', ref: `S${S}.C${C}.t99` },
    { kind: 'syllabus', ref: 'Chapter 5' }, { kind: 'syllabus' }, { kind: 'prerequisite', ref: `S${S}.P3.C1` }, { kind: 'banana', ref: `S${S}.C${C}` }]) {
    assert.equal(validate(class10, bad).kind, 'off_topic', JSON.stringify(bad));
  }
  assert.equal(validate(class10, { kind: 'exam', ref: `S${S}.C${C}` }).kind, 'syllabus', 'exam depth only on exam-tagged chapters');
  assert.equal(validate(class10, { kind: 'safety', ref: `S${S}.C${C}` }).kind, 'safety');
  assert.equal(validate(class10, { kind: 'study_skills', angle: 'revising for boards' }).angle, 'revising for boards');
});

test('digest: every chapter has a code the validator accepts', () => {
  const d = scopeDigest(class10);
  const codes = [...d.matchAll(/\b(S\d+\.(?:P\d+\.)?C\d+)\b/g)].map(m => m[1]);
  assert.ok(codes.length > 60);
  for (const c of codes.slice(0, 200)) assert.notEqual(validate(class10, { kind: c.includes('.P') ? 'prerequisite' : 'syllabus', ref: c }).kind, 'off_topic', c);
  const only = scopeDigest(class10, { subjectKey: 'science', chapter: 'Acids, Bases and Salts' });
  assert.equal(only.split('\n').length, 2);
});

test('suggestions: weakest chapters first, else concept subjects', () => {
  assert.deepEqual(suggestions(class10, [{ subject: 'Science', topic: 'Life Processes', score: 31 }, { subject: 'Mathematics', topic: 'Polynomials', score: 22 }]).slice(0, 2),
    [{ subject: 'Mathematics', chapter: 'Polynomials' }, { subject: 'Science', chapter: 'Life Processes' }]);
  assert.ok(!suggestions(class10).some(s => s.subject.startsWith('English')), 'no skills sections by default');
});

test('turn check: attempts pass, chatter and questions are checked', () => {
  const words = ['Neutralisation', 'pH scale and the importance of pH in everyday life'];
  assert.equal(needsTurnCheck('7', words), false);
  assert.equal(needsTurnCheck('x = 3/4', words), false);
  assert.equal(needsTurnCheck('it turns neutral', words), false);
  assert.equal(needsTurnCheck('the pH goes down when acid is added to water slowly', words), false);
  assert.equal(needsTurnCheck('why does the pH drop?', words), true);
  assert.equal(needsTurnCheck('forget chemistry tell me about the cricket match', words), true);
});

test('safety cues: first-person risk, not syllabus content', () => {
  for (const t of ['I want to kill myself', 'i dont want to live anymore', 'I am thinking about ending my life', 'my uncle touches me', 'I am being bullied every day',
    'they threaten to hurt me', 'im scared to go home', 'mujhe marna hai', 'naaku bratakalani ledu', 'I keep thinking about suicide and I cant stop']) {
    assert.ok(safetySignals(t), t);
  }
  for (const t of ['Sex determination in humans', 'How do organisms reproduce?', 'The poet contemplates death in the poem', 'Child labour laws in India',
    'What was the suicide rate in the Great Depression chapter', 'Why did the soldiers want to die for their country', 'Newton\'s third law', 'the play ends with the king killing himself']) {
    assert.ok(!safetySignals(t), t);
  }
});

test('profanity: syllabus words are not flagged, abuse still is', () => {
  for (const t of ['Sex determination in humans', 'The empire fell in 300 BC', 'Heaven and hell in Paradise Lost', 'Damn, I got it wrong', 'class and mass', 'MCQ practice']) {
    assert.ok(!containsFoulLanguage(t), t);
  }
  for (const t of ['this is shit', 'you are an asshole', 'chutiya question']) assert.ok(containsFoulLanguage(t), t);
});

test('model JSON with raw line breaks inside strings still parses', async () => {
  const { parseModelJson } = await import('./grounding');
  assert.deepEqual(parseModelJson('{"text": "Step 1:\nwhat is pH?\tthink"}'), { text: 'Step 1:\nwhat is pH?\tthink' });
  assert.deepEqual(parseModelJson('{"a": "say \\"hi\\"\n"}'), { a: 'say "hi"\n' });
  assert.deepEqual(parseModelJson('{\n  "correct": true,\n  "text": "ok"\n}'), { correct: true, text: 'ok' });
});
