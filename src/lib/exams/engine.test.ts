import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CBSE_EIGHT_POINT, countedSubjects, gradeFor, gradingProblem, matchImport, mustClear, parseCell, parseCsv, presetScheme, rankBy,
  scaleScore, studentResult, subjectTerm, termProblem, toRules, unmarked,
  type Assessment, type Mark, type PresetScheme, type SubjectMarks, type Term,
} from './engine';

/** Turns a preset into the stored shape (ids from codes and seqs) for the result functions. */
function build(p: PresetScheme) {
  const terms: Term[] = p.terms.map(t => ({ id: `t${t.seq}`, name: t.name, seq: t.seq, startsOn: t.startsOn, endsOn: t.endsOn, weight: t.weight, components: t.components, subjectWeights: t.subjectWeights }));
  const assessments: Assessment[] = p.assessments.map((a, i) => ({ id: a.code, termId: `t${a.termSeq}`, code: a.code, name: a.name, kind: a.kind, maxMarks: a.maxMarks, seq: i, subjects: a.subjects, heldFrom: null, heldTo: null }));
  return { scheme: { grading: p.grading, rules: p.rules }, terms, assessments };
}
const marks = (o: Record<string, number | 'AB' | 'ML' | 'EX' | [number, number]>): SubjectMarks =>
  new Map(Object.entries(o).map(([code, v]) => [code, Array.isArray(v) ? { marks: v[0], code: null, max: v[1] } : typeof v === 'number' ? { marks: v, code: null, max: 0 } : { marks: null, code: v, max: 0 }]));
/** Fills each mark's max from the assessment (the sheet's max in real use). */
function withMax(m: SubjectMarks, as: Assessment[], subject: string): SubjectMarks {
  for (const [code, v] of m) if (!v.max) { const a = as.find(x => x.code === code)!; v.max = a.subjects[subject]?.max ?? a.subjects['*']?.max ?? a.maxMarks; }
  return m;
}

test('grades: CBSE eight-point bands on the rounded percentage', () => {
  assert.equal(gradeFor(90.5, CBSE_EIGHT_POINT)?.grade, 'A1');
  assert.equal(gradeFor(90.4, CBSE_EIGHT_POINT)?.grade, 'A2');
  assert.equal(gradeFor(33, CBSE_EIGHT_POINT)?.grade, 'D');
  assert.equal(gradeFor(32.4, CBSE_EIGHT_POINT)?.grade, 'E');
  assert.equal(gradeFor(null, CBSE_EIGHT_POINT), null);
  assert.equal(gradingProblem(CBSE_EIGHT_POINT), null);
  assert.match(gradingProblem([{ min: 50, grade: 'P' }]) ?? '', /start at 0/);
});

test('middle preset: term 1 is PT 10 + notebook 5 + enrichment 5 + half-yearly 80', () => {
  const { scheme, terms, assessments } = build(presetScheme('middle', '2026-27', ['english', 'mathematics']));
  const t1 = terms[0];
  const r = subjectTerm(t1, new Map(assessments.map(a => [a.code, a])), 'mathematics',
    withMax(marks({ PT1: 30, NB1: 4, SE1: 5, HY: 60 }), assessments, 'mathematics'), scheme.rules, scheme.grading);
  // 30/40 of 10 = 7.5, 4, 5, 60 -> 76.5 out of 100
  assert.equal(r.total, 76.5);
  assert.equal(r.outOf, 100);
  assert.equal(r.grade, 'B1');
  assert.deepEqual(r.missing, []);
});

test('missing marks leave the result open; exempt and medical rescale; absent counts zero', () => {
  const { scheme, terms, assessments } = build(presetScheme('middle', '2026-27', ['science']));
  const byCode = new Map(assessments.map(a => [a.code, a]));
  const open = subjectTerm(terms[0], byCode, 'science', withMax(marks({ PT1: 40, NB1: 5, SE1: 5 }), assessments, 'science'), scheme.rules, scheme.grading);
  assert.equal(open.pct, null);
  assert.deepEqual(open.missing, ['HY']);
  // Medical in the half-yearly: the other 20 marks are scaled to 100.
  const ml = subjectTerm(terms[0], byCode, 'science', withMax(marks({ PT1: 40, NB1: 5, SE1: 5, HY: 'ML' }), assessments, 'science'), scheme.rules, scheme.grading);
  assert.equal(ml.pct, 100);
  assert.equal(ml.total, 100);
  const ab = subjectTerm(terms[0], byCode, 'science', withMax(marks({ PT1: 40, NB1: 5, SE1: 5, HY: 'AB' }), assessments, 'science'), scheme.rules, scheme.grading);
  assert.equal(ab.pct, 20);
  // A school that counts medical as zero.
  const zero = subjectTerm(terms[0], byCode, 'science', withMax(marks({ PT1: 40, NB1: 5, SE1: 5, HY: 'ML' }), assessments, 'science'), { medical: 'zero' }, scheme.grading);
  assert.equal(zero.pct, 20);
});

test('secondary preset: annual counts the best two of three periodic tests', () => {
  const { scheme, terms, assessments } = build(presetScheme('secondary', '2026-27', ['english', 'hindi', 'mathematics', 'science', 'social-science']));
  const byCode = new Map(assessments.map(a => [a.code, a]));
  const r = subjectTerm(terms[1], byCode, 'mathematics',
    withMax(marks({ PT1: 20, PT2: 40, PT3: 30, MA: 5, PF2: 5, SE2: 5, AN: 60 }), assessments, 'mathematics'), scheme.rules, scheme.grading);
  const pt = r.components.find(c => c.key === 'pt')!;
  // best of 40/40 and 30/40 = 87.5% of 5
  assert.equal(pt.score, 4.38);
  assert.deepEqual(pt.parts.map(p => p.used), [false, true, true]);
  assert.equal(r.total, 79.38);
});

test('secondary preset: a skill subject is 50 theory + 50 practical, internal assessment not applied', () => {
  const p = presetScheme('secondary', '2026-27', ['english', 'hindi', 'mathematics', 'science', 'social-science', 'computer-applications']);
  const { scheme, terms, assessments } = build(p);
  const byCode = new Map(assessments.map(a => [a.code, a]));
  assert.equal(assessments.find(a => a.code === 'PR')!.subjects.mathematics, undefined);
  const r = subjectTerm(terms[1], byCode, 'computer-applications', withMax(marks({ AN: 40, PR: 50 }), assessments, 'computer-applications'), scheme.rules, scheme.grading);
  assert.deepEqual(r.missing, []);
  assert.equal(r.pct, 75); // 40/80 of 50 + 50/50 of 50
  // Maths has no practical sheet at all.
  const m = subjectTerm(terms[1], byCode, 'mathematics', withMax(marks({ PT1: 40, PT2: 40, PT3: 40, MA: 5, PF2: 5, SE2: 5, AN: 80 }), assessments, 'mathematics'), scheme.rules, scheme.grading);
  assert.equal(m.pct, 100);
  assert.ok(!m.components.some(c => c.key === 'pr'));
});

test('senior preset: practical subjects 70/30, others 80/20; theory must be passed on its own', () => {
  const subjects = ['english-core', 'physics', 'chemistry', 'mathematics', 'economics', 'physical-education'];
  const p = presetScheme('senior', '2026-27', subjects);
  const { scheme, terms, assessments } = build(p);
  const byCode = new Map(assessments.map(a => [a.code, a]));
  const phy = subjectTerm(terms[1], byCode, 'physics', withMax(marks({ UT1: 20, UT2: 25, AN: 35, PR2: 30 }), assessments, 'physics'), scheme.rules, scheme.grading);
  assert.equal(phy.outOf, 100);
  assert.equal(phy.pct, 65);
  assert.equal(phy.components.find(c => c.key === 'ut')!.weight, 0);
  const eco = subjectTerm(terms[1], byCode, 'economics', withMax(marks({ UT1: 20, UT2: 25, AN: 60, PR2: 20 }), assessments, 'economics'), scheme.rules, scheme.grading);
  assert.equal(eco.pct, 80);

  // Physics: 20/70 theory (28.6%) but 30/30 practical -> 50% overall, still a fail on theory.
  const all = new Map(subjects.map(s => [s, withMax(marks({ UT1: 20, UT2: 20, AN: s === 'physics' ? 20 : 60, PR2: s === 'physics' ? 30 : 15 }), assessments, s)]));
  const res = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), all, 2);
  const physics = res.subjects.find(s => s.key === 'physics')!;
  assert.equal(physics.final!.pct, 50);
  assert.equal(physics.passed, false);
  // Six subjects, best five: the failed physics is covered by the sixth.
  assert.equal(res.result, 'pass');
  assert.ok(!res.aggregate!.counted.includes('physics'));
  assert.ok(res.aggregate!.counted.includes('english-core'));
});

test('result: mandatory subjects cannot be replaced; compartment up to the limit', () => {
  const rules = toRules({ bestOf: 5, mandatory: ['english', 'hindi'], compartmentMax: 2, result: 'pass_fail' });
  const rows = (fails: string[]) => ['english', 'hindi', 'mathematics', 'science', 'social-science', 'computer-applications']
    .map(k => ({ key: k, passed: !fails.includes(k) }));
  assert.deepEqual(mustClear(rows([]), rules), []);
  assert.deepEqual(mustClear(rows(['science']), rules), []);
  assert.deepEqual(mustClear(rows(['hindi']), rules), ['hindi']);
  assert.deepEqual(mustClear(rows(['science', 'mathematics']), rules), ['science']);
  // No best-of: every failure counts.
  assert.deepEqual(mustClear(rows(['science']), { bestOf: null, mandatory: [] }), ['science']);
});

test('result: pass / compartment / fail on the last term only', () => {
  const subjects = ['english', 'hindi', 'mathematics', 'science', 'social-science'];
  const { scheme, terms, assessments } = build(presetScheme('secondary', '2026-27', subjects));
  const full = (an: Record<string, number>) => new Map(subjects.map(s => [s, withMax(marks({ PT1: 10, HY: 30, PF1: 3, SE1: 3, PT2: 10, PT3: 10, MA: 3, PF2: 3, SE2: 3, AN: an[s] ?? 50 }), assessments, s)]));
  const half = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), full({}), 1);
  assert.equal(half.result, null);
  assert.equal(half.subjects[0].final, null); // the half-yearly has weight 0
  const pass = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), full({}), 2);
  assert.equal(pass.result, 'pass');
  assert.equal(pass.complete, true);
  const comp = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), full({ mathematics: 5, science: 5 }), 2);
  assert.equal(comp.result, 'compartment');
  assert.deepEqual(comp.toClear.sort(), ['mathematics', 'science']);
  const fail = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), full({ mathematics: 5, science: 5, english: 5 }), 2);
  assert.equal(fail.result, 'fail');
});

test('final result weights the terms (primary: half of each)', () => {
  const subjects = ['english'];
  const { scheme, terms, assessments } = build(presetScheme('primary', '2026-27', subjects));
  const m = new Map([['english', withMax(marks({ PT1: 20, NB1: 5, SE1: 5, HY: 80, PT2: 10, NB2: 5, SE2: 5, AN: 40 }), assessments, 'english')]]);
  const r = studentResult(scheme, terms, assessments, [{ key: 'english', name: 'English' }], m, 2);
  // Term 1 100, term 2: 5 + 5 + 5 + 40 = 55 -> 77.5
  assert.equal(r.subjects[0].final!.pct, 77.5);
  assert.equal(r.result, null); // primary decides no pass / fail
});

test('counted subjects: mandatory always, then the best of the rest', () => {
  const rows = [
    { key: 'english', final: { pct: 40 } }, { key: 'hindi', final: { pct: 50 } }, { key: 'maths', final: { pct: 90 } },
    { key: 'science', final: { pct: 30 } }, { key: 'sst', final: { pct: 80 } }, { key: 'it', final: { pct: 95 } },
  ];
  assert.deepEqual(countedSubjects(rows, { bestOf: 5, mandatory: ['english', 'hindi'] }).map(r => r.key), ['english', 'hindi', 'it', 'maths', 'sst']);
  assert.equal(countedSubjects(rows, { bestOf: null, mandatory: [] }).length, 6);
});

test('ranks: ties share a rank, the next rank skips', () => {
  const xs = [{ n: 'a', s: 90 }, { n: 'b', s: 95 }, { n: 'c', s: 90 }, { n: 'd', s: 70 }, { n: 'e', s: null }];
  const r = rankBy(xs, x => x.s);
  assert.deepEqual(xs.map(x => r.get(x) ?? null), [2, 1, 2, 4, null]);
});

test('term validation catches unknown codes and best-of counts', () => {
  const codes = new Set(['PT1', 'HY']);
  assert.equal(termProblem({ name: 'T1', weight: 50, components: [{ key: 'a', name: 'PT', weight: 20, codes: ['PT1'], rule: 'sum' }, { key: 'b', name: 'Exam', weight: 80, codes: ['HY'], rule: 'sum' }] }, codes), null);
  assert.match(termProblem({ name: 'T1', weight: 50, components: [{ key: 'a', name: 'PT', weight: 20, codes: ['PT9'], rule: 'sum' }] }, codes) ?? '', /PT9/);
  assert.match(termProblem({ name: 'T1', weight: 50, components: [{ key: 'a', name: 'PT', weight: 20, codes: ['PT1'], rule: 'best', best: 2 }] }, codes) ?? '', /best of/);
  assert.match(termProblem({ name: 'T1', weight: 50, components: [{ key: 'a', name: 'PT', weight: 0, codes: ['PT1'], rule: 'sum' }] }, codes) ?? '', /must count/);
});

test('cells: numbers, codes, limits', () => {
  assert.deepEqual(parseCell('37.5', 40), { ok: true, mark: { marks: 37.5, code: null } });
  assert.deepEqual(parseCell('ab', 40), { ok: true, mark: { marks: null, code: 'AB' } });
  assert.deepEqual(parseCell(' ', 40), { ok: true, mark: { marks: null, code: null } });
  assert.equal(parseCell('41', 40).ok, false);
  assert.equal(parseCell('3.333', 40).ok, false);
  assert.equal(parseCell('x', 40).ok, false);
  const m = new Map<string, Mark>([['s1', { marks: 3, code: null }], ['s2', { marks: null, code: 'AB' }]]);
  assert.deepEqual(unmarked([{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }, { id: 's3', name: 'C' }], m), ['C']);
});

test('scaling a test score to the sheet', () => {
  assert.equal(scaleScore(17, 20, 40), 34);
  assert.equal(scaleScore(7, 9, 10), 8); // 7.78 -> 8
  assert.equal(scaleScore(5, 8, 10), 6.5); // 6.25 -> 6.5 (nearest half)
  assert.equal(scaleScore(5, 0, 10), 0);
});

test('import: csv with quotes, matched by admission number, roll, then name', () => {
  const rows = parseCsv('Adm No,Name,Marks\nVN001,"Rao, Aarav",34\n,Diya Sharma,AB\nVN009,Nobody,12\n,Kiran,50\n');
  assert.equal(rows[1][1], 'Rao, Aarav');
  const students = [
    { id: '1', name: 'Rao, Aarav', admissionNo: 'VN001', rollNo: '1' },
    { id: '2', name: 'Diya Sharma', admissionNo: 'VN002', rollNo: '2' },
    { id: '3', name: 'Kiran', admissionNo: 'VN003', rollNo: '3' },
  ];
  const r = matchImport(rows, students, 40);
  assert.deepEqual(r.matched.map(m => [m.studentId, m.mark.marks, m.mark.code]), [['1', 34, null], ['2', null, 'AB']]);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[0], /Line 4/);
  assert.match(r.problems[1], /more than the maximum/);
  // Tabs from a spreadsheet paste, no header.
  const t = matchImport(parseCsv('VN003\t39'), students, 40);
  assert.deepEqual(t.matched.map(m => m.studentId), ['3']);
});

test('a subject excused throughout (medical in its only counted paper) is left out, not blanking the result', () => {
  const subjects = ['english-language-and-literature', 'hindi-course-a', 'mathematics', 'science', 'social-science', 'computer-applications'];
  const { scheme, terms, assessments } = build(presetScheme('secondary', '2026-27', subjects));
  const t1 = (k: string) => withMax(marks(k === 'computer-applications' ? { HY: 'ML' } : { PT1: 30, PF1: 4, SE1: 4, HY: 60 }), assessments, k);
  const half = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), new Map(subjects.map(k => [k, t1(k)])), 1);
  const ca = half.subjects.find(s => s.key === 'computer-applications')!;
  assert.equal(ca.terms.t1.excused, true);
  assert.equal(ca.terms.t1.pct, null);
  assert.equal(half.complete, true);
  // Annual: medical in the skill subject's theory and practical.
  const t2 = (k: string) => {
    const m = t1(k);
    const extra = k === 'computer-applications' ? marks({ AN: 'ML', PR: 'EX' }) : marks({ PT2: 30, PT3: 30, MA: 4, PF2: 4, SE2: 4, AN: 60 });
    for (const [c, v] of withMax(extra, assessments, k)) m.set(c, v);
    return m;
  };
  const year = studentResult(scheme, terms, assessments, subjects.map(k => ({ key: k, name: k })), new Map(subjects.map(k => [k, t2(k)])), 2);
  const ca2 = year.subjects.find(s => s.key === 'computer-applications')!;
  assert.equal(ca2.excused, true);
  assert.equal(ca2.final, null);
  assert.equal(ca2.passed, null);
  assert.ok(year.aggregate, 'the other five still make an aggregate');
  assert.equal(year.aggregate!.counted.length, 5);
  assert.equal(year.result, 'pass');
});
