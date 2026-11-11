import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultBlueprint, itemCount, makeBlueprint, markTotal, parseBlueprint, slotsOf } from './blueprint';
import { fingerprint, findRepeat, similarity } from './fingerprint';
import { checkNumeric, evaluate, parseAnswerNumber } from './numeric';
import { abcSets, assembleClass, bandOf, perStudent, reasonFor, sameShape } from './pick';
import { forStudent, readingLevel, toQuestion } from './handout';
import { blocking, parseItem, parseQuestionSet } from './items';
import type { Competency, QKind, StudioItem } from './types';

let n = 0;
function item(p: { competency?: Competency; marks?: number; qtype?: QKind; topic?: string; difficulty?: number | null; flagged?: boolean }): StudioItem {
  const qtype = p.qtype ?? ((p.marks ?? 1) === 1 ? 'mcq' : 'short');
  n++;
  return {
    id: `it${n}`, bankId: null, source: 'bank', qtype, competency: p.competency ?? 'apply', marks: p.marks ?? 1, chapterKey: 'light',
    topic: p.topic ?? 'Refraction', text: `Question ${n} about ${p.topic ?? 'refraction'}`, scheme: '',
    ...(qtype === 'mcq' ? { options: ['a', 'b', 'c', 'd'], answer: 1 } : {}),
    check: { status: p.flagged ? 'flagged' : 'passed', notes: [] }, difficulty: p.difficulty ?? null,
  };
}

test('blueprint totals, slots in paper order, and bad input', () => {
  const bp = makeBlueprint({ remember_understand: { 1: 3, 2: 1 }, apply: { 1: 2, 2: 2, 3: 1 }, analyse_evaluate: { 2: 1, 3: 1 } });
  assert.equal(itemCount(bp), 11);
  assert.equal(markTotal(bp), 3 + 2 + 2 + 4 + 3 + 2 + 3);
  const slots = slotsOf(bp);
  assert.equal(slots.length, 11);
  assert.ok(slots.every((s, i) => i === 0 || slots[i - 1].marks <= s.marks), 'small questions first');
  assert.equal(slots[0].qtype, 'mcq');
  assert.equal(parseBlueprint({ cells: { apply: { 1: 99 } } })?.cells.apply[1], 10, 'cells are capped');
  assert.equal(parseBlueprint({}), null, 'an empty blueprint is refused');
  assert.ok(slotsOf(defaultBlueprint('quiz'), { quiz: true }).every(s => s.qtype === 'mcq' && s.marks === 1), 'quizzes are all 1-mark choice');
});

test('fingerprint ignores case, punctuation and option order; similarity catches re-wording', () => {
  assert.equal(fingerprint('Which way does light bend?', ['Away', 'Towards']), fingerprint('which way does LIGHT bend', ['towards', 'away']));
  assert.notEqual(fingerprint('Which way does light bend?'), fingerprint('Which way does sound bend?'));
  assert.ok(similarity('A ray of light passes from air into glass. Which way does it bend?', 'A ray of light goes from air into glass. Which way does it bend?') > 0.72);
  assert.ok(similarity('State Ohm’s law.', 'Define refractive index.') < 0.3);
  assert.equal(findRepeat('Define refractive index.', [{ text: 'State Ohm’s law.', where: 'Quiz 1' }]), null);
  assert.equal(fingerprint('प्रकाश का अपवर्तन क्या है?').length, 28, 'Indian scripts hash too');
});

test('the calculator: arithmetic, functions in degrees, and nothing else', () => {
  assert.equal(evaluate('3e8 / 1.5'), 2e8);
  assert.equal(evaluate('2^3^2'), 512, 'power is right-associative');
  assert.ok(Math.abs(evaluate('sin(30)')! - 0.5) < 1e-12, 'trig in degrees');
  assert.equal(evaluate('-(4 - 6) * 2'), 4);
  assert.equal(evaluate('2pi'), 2 * Math.PI);
  assert.ok(Math.abs(evaluate('1/(1/20 + 1/30)')! - 12) < 1e-9, 'lens formula');
  for (const bad of ['process.exit()', 'constructor', 'x + 1', '2 +', 'alert(1)', '1/0']) assert.equal(evaluate(bad), null, bad);
});

test('answers as students write them', () => {
  assert.equal(parseAnswerNumber('2 x 10^8 m/s'), 2e8);
  assert.equal(parseAnswerNumber('2×10⁸ m/s'), 2e8);
  assert.equal(parseAnswerNumber('-0.25 D'), -0.25);
  assert.equal(parseAnswerNumber('1/2'), 0.5);
  assert.equal(parseAnswerNumber('3.0e8'), 3e8);
  assert.equal(parseAnswerNumber('about 1,500 m'), 1500);
  assert.equal(parseAnswerNumber('towards the normal'), null);
});

test('checkNumeric matches the key, catches a wrong key and a duplicate option', () => {
  const opts = ['4.5 x 10^8 m/s', '2 x 10^8 m/s', '1.5 x 10^8 m/s', '3 x 10^8 m/s'];
  assert.equal(checkNumeric({ expression: '3e8/1.5', key: opts[1], options: opts, answer: 1 }).ok, true);
  const wrong = checkNumeric({ expression: '3e8/1.5', key: opts[0], options: opts, answer: 0 });
  assert.equal(wrong.ok, false);
  assert.match(wrong.note, /working gives/);
  assert.equal(checkNumeric({ expression: '3e8/1.5', key: '2e8', options: ['2e8', '200000000 m/s'], answer: 0 }).ok, false, 'two options with the right value');
  assert.equal(checkNumeric({ expression: 'rm -rf', key: 1 }).ok, false);
});

test('assembleClass fills from the bank, prefers wanted topics, skips flagged and seen items, reports gaps', () => {
  const bp = makeBlueprint({ apply: { 1: 2, 3: 1 } });
  const pool = [item({ topic: 'Mirrors' }), item({ topic: 'Refractive index' }), item({ topic: 'Refractive index', flagged: true }), item({ topic: 'Lenses' })];
  const seen = item({ topic: 'Refractive index' });
  const { picked, gaps } = assembleClass(slotsOf(bp), [...pool, seen], { topics: ['Refractive index'], exclude: new Set([seen.id]) });
  assert.equal(picked[0]?.topic, 'Refractive index', 'wanted topic first');
  assert.ok(picked.every(p => !p || (p.check.status !== 'flagged' && p.id !== seen.id)));
  assert.equal(gaps.length, 1, 'no 3-mark item in the bank');
  assert.equal(gaps[0].slot.marks, 3);
  assert.deepEqual(assembleClass(slotsOf(bp), pool, { seed: 7 }).picked.map(p => p?.id), assembleClass(slotsOf(bp), pool, { seed: 7 }).picked.map(p => p?.id), 'same seed, same set');
});

test('perStudent: every version has the same shape and band; topics follow each student', () => {
  const bp = makeBlueprint({ remember_understand: { 1: 1 }, apply: { 1: 2 } });
  const pool = [
    ...['Refraction', 'Lenses', 'Mirrors'].flatMap(t => [item({ competency: 'remember_understand', topic: t, difficulty: 0.5 }), item({ topic: t, difficulty: 0.55 }), item({ topic: t, difficulty: 0.6 })]),
    item({ topic: 'Lenses', difficulty: 0.95 }), // easy: must not be used, the slot's band is medium
  ];
  const { versions, gaps } = perStudent(slotsOf(bp), pool, [
    { studentId: 'a', weakTopics: ['Lenses'] }, { studentId: 'b', weakTopics: ['Mirrors'] }, { studentId: 'c', weakTopics: [] },
  ]);
  assert.equal(gaps.length, 0);
  assert.ok(sameShape(versions[0].picked, versions[1].picked) && sameShape(versions[1].picked, versions[2].picked), 'fair to compare');
  assert.ok(versions[0].picked.every(p => p?.topic === 'Lenses'), 'a gets Lenses');
  assert.ok(versions[1].picked.every(p => p?.topic === 'Mirrors'), 'b gets Mirrors');
  assert.ok(versions.every(v => new Set(v.picked.map(p => p!.id)).size === v.picked.length), 'no repeats inside a version');
  assert.ok(versions.every(v => v.picked.every(p => bandOf(p!.difficulty) === 'medium')));
});

test('abcSets: three equal sets with no shared question, gaps when the bank runs short', () => {
  const bp = makeBlueprint({ apply: { 1: 2 } });
  const pool = Array.from({ length: 5 }, () => item({ difficulty: 0.5 }));
  const { sets, gaps } = abcSets(slotsOf(bp), pool, 3);
  const used = sets.flat().filter(Boolean).map(i => i!.id);
  assert.equal(new Set(used).size, used.length, 'no question in two sets');
  assert.equal(gaps.reduce((k, g) => k + g.count, 0), 1, '6 needed, 5 in the bank');
});

test('handout: choice and written questions, access needs, reading level, the student line', () => {
  const mcq = item({ topic: 'Refraction' });
  const written = { ...item({ marks: 3 }), scheme: 'Bends towards the normal (1); reason (2)', figure: { svg: null, alt: 'A ray entering a glass slab at 30 degrees.' } };
  assert.equal(toQuestion(mcq).type, 'mcq');
  assert.equal(toQuestion(written).type, 'short');
  assert.equal(toQuestion(written).marks, 3);
  assert.match(toQuestion(written).why!, /value|normal/);
  const { questions, access } = forStudent([written], ['no_figures', 'large_print']);
  assert.match(questions[0].questionText, /glass slab/);
  assert.deepEqual(access, ['no_figures', 'large_print']);
  assert.equal(readingLevel('Which way does light bend in glass?', 'Class 10'), null);
  assert.ok(readingLevel(`${'word '.repeat(40)}end.`, 'Class 9'));
  assert.equal(reasonFor(['Refractive index']), "This set focuses on Refractive index, where you're still building.");
});

test('parseItem and parseQuestionSet drop what can’t be valid', () => {
  assert.equal(parseItem({ qtype: 'mcq', text: 'x', options: ['a', 'a'], answer: 0 }), null, 'duplicate options');
  assert.equal(parseItem({ qtype: 'mcq', text: 'x', options: ['a', 'b'], answer: 5 }), null, 'answer out of range');
  assert.equal(parseItem({ text: '' }), null);
  assert.equal(parseItem({ qtype: 'mcq', text: 'x', options: ['A. a', 'B. b'], answer: 1, marks: 4 })?.marks, 1, 'choice questions are 1 mark');
  assert.deepEqual(parseItem({ qtype: 'mcq', text: 'x', options: ['A. a', 'B. b'], answer: 1 })?.options, ['a', 'b'], 'letters stripped');
  const fig = parseItem({ text: 'Label it', figure: { svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>', alt: 'a circle' } });
  assert.ok(fig?.figure && !/script/i.test(fig.figure.svg ?? ''), 'figures are sanitised');
  const set = parseQuestionSet({ type: 'questions', items: [{ id: 'q1', text: 'One', qtype: 'short', marks: 2, check: { status: 'flagged', notes: ['out of syllabus'] } }], order: ['q1', 'ghost'], versions: [{ studentId: 'not-a-uuid', itemIds: ['q1'] }] });
  assert.deepEqual(set?.order, ['q1']);
  assert.equal(set?.versions.length, 0);
  assert.equal(blocking(set!).length, 1, 'a flagged item blocks handing out');
  assert.equal(parseQuestionSet({ type: 'lesson' }), null);
});

import { judge } from './checks';
import { matchTopic, rankWeakTopics } from './weak';

const solve = (p: Partial<{ choice: number | null; expression: string | null; inSyllabus: boolean; clear: boolean; syllabusNote: string }>) =>
  ({ n: 1, choice: null, expression: null, inSyllabus: true, syllabusNote: '', clear: true, clarityNote: '', ...p });

test('judge: separate solve, computed numericals, syllabus, clarity and repeats', () => {
  const mcq = { ...item({}), text: 'Which way does light bend entering glass?', options: ['Away from the normal', 'Towards the normal', 'No bend', 'Along the surface'], answer: 1 };
  assert.deepEqual(judge(mcq, solve({ choice: 1 }), []).fails, []);
  assert.match(judge(mcq, solve({ choice: 0 }), []).fails[0], /picked option A, not the keyed B/);
  const num = { ...item({}), text: 'Speed of light in glass (n = 1.5)?', options: ['4.5 x 10^8 m/s', '2 x 10^8 m/s', '1.5 x 10^8 m/s', '3 x 10^8 m/s'], answer: 1 };
  assert.equal(judge(num, solve({ expression: '3e8/1.5' }), []).computed, true);
  assert.match(judge({ ...num, answer: 0 }, solve({ expression: '3e8/1.5' }), []).fails[0], /working gives/);
  const written = { ...item({ marks: 3, qtype: 'numerical' }), value: 12, unit: 'cm' };
  assert.deepEqual(judge(written, solve({ expression: '1/(1/20 + 1/30)' }), []).fails, []);
  assert.match(judge(mcq, solve({ choice: 1, inSyllabus: false, syllabusNote: 'needs the lens-maker formula' }), []).fails[0], /Outside the CBSE syllabus.*lens-maker/);
  assert.match(judge(mcq, solve({ choice: 1, clear: false }), []).fails[0], /Not clear/);
  assert.match(judge(mcq, solve({ choice: 1 }), [{ text: 'Which way does light bend when entering glass?', where: 'Quiz 3, question 4' }]).fails[0], /Repeats Quiz 3, question 4/);
});

test('weak topics: ranked from answers and tutor struggles; no evidence keeps the teacher order', () => {
  const chosen = ['Refraction through a glass slab', 'Refractive index', 'Spherical lenses'];
  assert.equal(matchTopic('refractive index of glass', chosen), 'Refractive index');
  assert.equal(matchTopic('Photosynthesis', chosen), null);
  const ranked = rankWeakTopics([
    { studentId: 'a', topic: 'Refractive index', kind: 'answer', score: 0, max: 2 },
    { studentId: 'a', topic: 'Refraction through a glass slab', kind: 'answer', score: 2, max: 2 },
    { studentId: 'b', topic: 'spherical lenses', kind: 'tutor', score: 0, max: 0, struggled: true },
  ], chosen, ['a', 'b', 'c']);
  assert.equal(ranked.get('a')![0], 'Refractive index');
  assert.equal(ranked.get('a')!.at(-1), 'Spherical lenses', 'unknown is not weak: it ranks after measured topics');
  assert.equal(ranked.get('b')![0], 'Spherical lenses');
  assert.deepEqual(ranked.get('c'), chosen);
});

import { pace, readyFor, standing, week } from './home';

test('home: standing, pace, the week and what is worth doing', () => {
  const roster = [{ id: 'a', name: 'Aditi Rao' }, { id: 'b', name: 'Kabir M' }, { id: 'c', name: 'Sneha P' }];
  const st = standing(roster, [
    { student_id: 'a', topic_name: 'Light', score: 20, computed_at: '2026-11-01' },
    { student_id: 'a', topic_name: 'Light', score: 30, computed_at: '2026-11-08' },
    { student_id: 'b', topic_name: 'Light', score: 50, computed_at: '2026-11-08' },
    { student_id: 'c', topic_name: 'Light', score: 70, computed_at: '2026-11-08' },
    { student_id: 'c', topic_name: 'Electricity', score: 90, computed_at: '2026-11-08' },
  ]);
  assert.equal(st.lowest?.chapter, 'Light', 'Electricity has one student, not enough to call it');
  assert.equal(st.lowest?.score, 50, 'latest per student: 30, 50, 70');
  assert.deepEqual(st.belowForty.map(s => s.id), ['a']);
  assert.equal(pace({ today: '2026-10-01', termStart: '2026-04-01', termEnd: '2027-02-28', periodsPerWeek: 6, totalTopics: 60, taught: 20 }), -62, 'a third taught at the half-way mark');
  assert.ok(Math.abs(pace({ today: '2026-10-01', termStart: '2026-04-01', termEnd: '2027-02-28', periodsPerWeek: 6, totalTopics: 60, taught: 33 })!) <= 1, 'on pace');
  assert.equal(pace({ today: '2026-03-01', termStart: '2026-04-01', termEnd: '2027-02-28', periodsPerWeek: 6, totalTopics: 60, taught: 0 }), null);
  const w = week({
    today: '2026-11-10', // a Tuesday
    slots: [{ weekday: 1, period_no: 2 }, { weekday: 2, period_no: 3 }, { weekday: 4, period_no: 1 }, { weekday: 5, period_no: 1 }],
    lessons: [
      { id: 'l1', lesson_date: '2026-11-09', period: 2, title: 'Mirrors', chapter_name: 'Light', status: 'taught', materials: [], taught_on: '2026-11-09' },
      { id: 'l2', lesson_date: '2026-11-10', period: 3, title: 'Refraction', chapter_name: 'Light', status: 'draft', materials: [{ label: 'Demo' }], taught_on: null },
      { id: 'l3', lesson_date: '2026-11-12', period: 1, title: 'Refraction 2', chapter_name: 'Light', status: 'draft', materials: [], taught_on: null },
    ],
    events: [{ kind: 'holiday', title: 'Guru Nanak Jayanti', starts_on: '2026-11-13', ends_on: '2026-11-13', suspends_classes: true }],
  });
  assert.equal(w.length, 6);
  assert.equal(w[0].periods[0].state, 'done');
  assert.equal(w[1].label, 'Today');
  assert.equal(w[1].periods[0].state, 'ready');
  assert.equal(w[3].periods[0].state, 'partial');
  assert.equal(w[4].periods[0].state, 'off');
  const ready = readyFor({ standing: st, className: '10-B', today: '2026-11-10', missing: [{ id: 'b', name: 'Kabir M', count: 3 }], drafts: [], nextExam: null,
    nextLesson: { id: 'l3', lesson_date: '2026-11-12', title: 'Refraction 2', chapter_name: 'Light', hasMaterials: false } });
  assert.equal(ready[0].kind, 'catchup');
  assert.deepEqual(ready[0].preset.students, ['a']);
  assert.ok(ready.some(r => r.kind === 'lesson') && ready.some(r => r.kind === 'parent_note'));
});

test('bank pictures: only paths in the bank folder survive, and they reach students but the answer pictures do not', async () => {
  const { parseFigures, figureWidth } = await import('./figures');
  const { sanitizeQuestions } = await import('../teacher/questions');
  const ok = { path: 'cbse/2026-27/class-10/science/sqp/q2_1.png', w: 300.4, h: 162.8, col: 438 };
  assert.deepEqual(parseFigures([ok, 'https://evil.example/x.png', 'cbse/../secret.png', 'cbse/a.svg', 'other/x/y.png', { path: 'cbse/x/y.png' }]).map(f => f.path),
    ['cbse/2026-27/class-10/science/sqp/q2_1.png', 'cbse/x/y.png']);
  assert.equal(figureWidth(parseFigures([ok])[0]), 69);
  assert.equal(figureWidth({ path: 'cbse/x/y.png' }), 100);

  const it = parseItem({ qtype: 'mcq', competency: 'apply', marks: 1, text: 'In which setup is lime water cloudiest?', options: ['P', 'Q', 'R', 'S'], answer: 2, scheme: 'C. R',
    figures: [ok], schemeFigures: [{ path: 'cbse/2026-27/class-10/science/ms/q2_1.png' }],
    access: { text: 'Which statement is incorrect?', options: ['w', 'x', 'y', 'z'], answer: 1, scheme: 'B' } })!;
  assert.equal(it.figures?.length, 1);
  assert.equal(it.textVersion?.answer, 1);
  const q = toQuestion(it);
  assert.equal(q.figures?.[0].path, ok.path);
  assert.equal((q as any).schemeFigures, undefined, 'answer pictures stay on the teacher side');
  assert.equal(sanitizeQuestions([{ ...q, figures: [...(q.figures ?? []), 'https://evil.example/x.png'] }]).questions[0].figures?.length, 1);

  // Text instead of figures: CBSE's own text-only version with its own key, and no pictures.
  const [tv] = forStudent([it], ['no_figures']).questions;
  assert.equal(tv.questionText, 'Which statement is incorrect?');
  assert.equal(tv.answer, 1);
  assert.equal(tv.figures, undefined);
  assert.equal(forStudent([it], []).questions[0].figures?.length, 1);
});
