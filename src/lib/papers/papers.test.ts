import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, designMarks, slotsOf, designsFor } from './designs';
import { getCurriculum } from '@/lib/curriculum';

// Totals from the official 2026-27 sample papers.
const OFFICIAL: Record<string, { marks: number; questions: number; byMarks?: Record<number, number> }> = {
  '10-science': { marks: 80, questions: 39, byMarks: { 1: 20, 2: 6, 3: 7, 4: 3, 5: 3 } },
  '10-maths-standard': { marks: 80, questions: 38, byMarks: { 1: 20, 2: 5, 3: 6, 4: 3, 5: 4 } },
  '10-maths-basic': { marks: 80, questions: 38, byMarks: { 1: 20, 2: 5, 3: 6, 4: 3, 5: 4 } },
  '10-social-science': { marks: 80, questions: 38 },
  '10-english-ll': { marks: 80, questions: 11 },
  '12-physics': { marks: 70, questions: 33, byMarks: { 1: 16, 2: 5, 3: 7, 4: 2, 5: 3 } },
  '12-chemistry': { marks: 70, questions: 33, byMarks: { 1: 16, 2: 5, 3: 7, 4: 2, 5: 3 } },
  '12-maths': { marks: 80, questions: 38, byMarks: { 1: 20, 2: 5, 3: 6, 4: 3, 5: 4 } },
  '12-biology': { marks: 70, questions: 33, byMarks: { 1: 16, 2: 5, 3: 7, 4: 2, 5: 3 } },
};

test('every design matches its official paper: marks, question count, numbering, mark split', () => {
  assert.deepEqual(DESIGNS.map(d => d.key).sort(), Object.keys(OFFICIAL).sort());
  for (const d of DESIGNS) {
    const o = OFFICIAL[d.key], slots = slotsOf(d);
    assert.equal(designMarks(d), o.marks, `${d.key} marks`);
    assert.equal(d.maxMarks, o.marks, `${d.key} maxMarks`);
    assert.equal(slots.length, o.questions, `${d.key} questions`);
    assert.deepEqual(slots.map(s => s.q), slots.map((_, i) => i + 1), `${d.key} numbered 1..n in order`);
    if (o.byMarks) {
      const split: Record<number, number> = {};
      for (const s of slots) split[s.marks] = (split[s.marks] ?? 0) + 1;
      assert.deepEqual(split, o.byMarks, `${d.key} split`);
    }
    for (const s of slots) if (s.parts) assert.equal(s.parts.reduce((a, b) => a + b, 0), s.marks, `${d.key} Q${s.q} parts add up`);
  }
});

test('Social Science sections are 20 marks each; Science sections 30/25/25', () => {
  const by = (key: string) => DESIGNS.find(d => d.key === key)!.sections.map(s => s.slots.reduce((n, x) => n + x.marks, 0));
  assert.deepEqual(by('10-social-science'), [20, 20, 20, 20]);
  assert.deepEqual(by('10-science'), [30, 25, 25]);
  assert.deepEqual(by('10-english-ll'), [20, 20, 40]);
});

test('every unit a design names exists in that subject’s curriculum, and section marks match unit marks', () => {
  for (const d of DESIGNS) {
    const cur = getCurriculum(`Class ${d.cls}`, d.subject);
    assert.ok(cur, `${d.key}: curriculum for Class ${d.cls} ${d.subject}`);
    const codes = new Set(cur!.units.map(u => u.code));
    for (const s of slotsOf(d)) for (const u of s.units ?? []) assert.ok(codes.has(u), `${d.key} Q${s.q}: unit ${u}`);
    for (const sec of d.sections) {
      if (!sec.units) continue;
      const weight: number = cur!.units.filter(u => sec.units!.includes(u.code)).reduce((n: number, u) => n + (u.marks ?? 0), 0);
      assert.equal(sec.slots.reduce((n, x) => n + x.marks, 0), weight, `${d.key} section ${sec.id} marks = its units' marks`);
    }
  }
});

test('designs are found by class and subject; Class 10 Maths offers Standard and Basic', () => {
  assert.deepEqual(designsFor('Class 10-A', 'Mathematics').map(d => d.variant), ['Standard', 'Basic']);
  assert.equal(designsFor('10-A', 'Science')[0].key, '10-science');
  assert.equal(designsFor('12-B', 'Physics')[0].key, '12-physics');
  assert.equal(designsFor('9-A', 'Science').length, 0, 'Class 9 has no board paper');
});

import { buildBlueprint, unitMarks } from './blueprint';

test('blueprints follow the unit weightage, never use internally-assessed chapters, and vary by seed', () => {
  for (const d of DESIGNS) {
    const cur = getCurriculum(`Class ${d.cls}`, d.subject)!;
    for (const seed of [1, 2, 3, 99]) {
      const bp = buildBlueprint(d, cur, seed);
      assert.equal(bp.length, slotsOf(d).length);
      const formative = new Set(cur.units.flatMap(u => u.chapters.filter(c => c.formativeOnly).map(c => c.name)));
      for (const i of bp) assert.ok(!formative.has(i.chapter), `${d.key} Q${i.q}: ${i.chapter} is assessed only internally`);
      // Each unit lands within one question's worth of its weight (marks come in whole questions).
      const got = unitMarks(bp);
      const total = d.maxMarks, theory = cur.units.reduce((n, u) => n + (u.marks ?? 0), 0);
      for (const u of cur.units.filter(x => (x.marks ?? 0) > 0)) {
        const want = ((u.marks ?? 0) * total) / theory;
        assert.ok(Math.abs((got[u.code] ?? 0) - want) <= 5, `${d.key} seed ${seed}: unit ${u.code} got ${got[u.code] ?? 0}, weight ${want}`);
      }
    }
  }
  const sci = DESIGNS.find(d => d.key === '10-science')!, cur = getCurriculum('Class 10', 'Science')!;
  assert.deepEqual(unitMarks(buildBlueprint(sci, cur, 1)), { I: 25, II: 25, III: 12, IV: 13, V: 5 }, 'Class 10 Science lands exactly on the weightage');
  const a = buildBlueprint(sci, cur, 1).map(i => i.chapter).join(), b = buildBlueprint(sci, cur, 2).map(i => i.chapter).join();
  assert.notEqual(a, b, 'a different seed gives a different spread');
  assert.equal(a, buildBlueprint(sci, cur, 1).map(i => i.chapter).join(), 'the same seed gives the same plan');
});

import { readSection, AR_OPTIONS, checkPaper } from './paper';

test('a section is checked against its blueprint; marks come from the design, not the model', () => {
  const sci = DESIGNS.find(d => d.key === '10-science')!;
  const bp = buildBlueprint(sci, getCurriculum('Class 10', 'Science')!, 1).filter(i => [1, 8, 10, 11, 15].includes(i.q));
  const good = { questions: [
    { q: 1, text: 'Which gas…?', options: ['a', 'b', 'c', 'd'], answer: 2, scheme: 'c', marks: 99 },
    { q: 8, assertion: 'A…', reason: 'R…', answer: 0, scheme: 'A' },
    { q: 10, text: 'Explain…', scheme: '1 + 1' },
    { q: 11, text: 'Why…?', scheme: '2', alt: { text: 'Or why…?', scheme: '2' } },
    { q: 15, passage: 'Case…', text: '', scheme: '', parts: [
      { label: '(i)', text: 'a', marks: 1, scheme: 'x' }, { label: '(ii)', text: 'b', marks: 1, scheme: 'y' },
      { label: '(iii)', text: 'c', marks: 2, scheme: 'z', or: { text: 'c or', scheme: 'z2' } }] },
  ] };
  const r = readSection(bp, good);
  assert.deepEqual(r.problems, []);
  assert.equal(r.questions[0].marks, 1, 'the model said 99; the design says 1');
  assert.deepEqual(r.questions[1].options, AR_OPTIONS);

  const bad = readSection(bp, { questions: [
    { q: 1, text: 'x', options: ['a', 'b'], answer: 5, scheme: 'c' },
    { q: 10, text: 'x', scheme: '', figure: { svg: '<svg viewBox="0 0 9 9"><rect width="2" height="2"/></svg>' } },
    { q: 11, text: 'Why?', scheme: '2' },
    { q: 15, passage: 'Case', text: '', scheme: '', parts: [{ text: 'a', marks: 2, scheme: 'x' }, { text: 'b', marks: 2, scheme: 'y' }] },
  ] });
  const all = bad.problems.join(' | ');
  for (const want of [/Q1: an MCQ needs/, /Q8 is missing/, /Q10: needs text and a marking scheme/, /Q10: has a figure/, /Q11: needs an "alt"/, /Q15: needs 3 parts carrying 1, 1, 2/, /Q15: the 2-mark sub-part needs an "or"/]) {
    assert.match(all, want);
  }
});

test('"attempt any" questions need exactly the parts the design gives', () => {
  const en = DESIGNS.find(d => d.key === '10-english-ll')!;
  const q8 = buildBlueprint(en, getCurriculum('Class 10', 'English Language and Literature')!, 1).filter(i => i.q === 8);
  const parts = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Q${i}`, marks: 3, scheme: 's' }));
  assert.deepEqual(readSection(q8, { questions: [{ q: 8, text: 'Answer any four', scheme: '', parts: parts(5) }] }).problems, []);
  assert.match(readSection(q8, { questions: [{ q: 8, text: 'x', scheme: '', parts: parts(4) }] }).problems.join(), /exactly 5 parts/);
});

test('a stored paper is re-checked against its design', () => {
  assert.equal(checkPaper({ design: 'nope', sections: [] }), null);
  assert.equal(checkPaper({ design: '10-science', sections: [{ questions: [{ q: 1 }] }] }), null, 'missing questions');
});

test('a seed plans the same paper however the engine sorts (no randomness inside comparators)', () => {
  const sci = DESIGNS.find(d => d.key === '10-science')!, cur = getCurriculum('Class 10', 'Science')!;
  const plain = buildBlueprint(sci, cur, 7).map(i => i.chapter).join();
  const realSort = Array.prototype.sort;
  try {
    // An engine that calls the comparator in a different order: sort a reversed copy, then reverse back.
    Array.prototype.sort = function (this: unknown[], cmp?: (a: unknown, b: unknown) => number) {
      const copy = [...this].reverse();
      const sorted = realSort.call(copy, cmp) as unknown[];
      for (let i = 0; i < this.length; i++) this[i] = sorted[i];
      return this;
    } as typeof Array.prototype.sort;
    assert.equal(buildBlueprint(sci, cur, 7).map(i => i.chapter).join(), plain);
  } finally { Array.prototype.sort = realSort; }
});
