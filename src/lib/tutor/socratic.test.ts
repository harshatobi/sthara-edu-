import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, computeRubric, initialState, legacyTotals, parseSummary, parseVerdict, progress, clampSteps, type SocraticState, type Verdict } from './socratic';

const v = (o: Partial<Verdict> = {}): Verdict => ({ correct: true, partial: false, reasoning: 3, misconceptions: [], teachback: null, transcription: null, note: '', ...o });
const fresh = () => initialState('standard', 'A problem', 'Q1');
const withSteps = (s: SocraticState, n: number) => ({ ...s, scaffoldTotal: n });

test('strong diagnosis skips scaffolding and goes to transfer', () => {
  const r = advance('diagnose', fresh(), { type: 'answer', verdict: v({ reasoning: 2 }) });
  assert.equal(r.stage, 'transfer');
  assert.equal(r.state.skippedScaffold, true);
  assert.deepEqual(r.action, { kind: 'to_transfer', skipped: true });
});

test('correct but unexplained diagnosis still scaffolds', () => {
  const r = advance('diagnose', fresh(), { type: 'answer', verdict: v({ reasoning: 1 }) });
  assert.equal(r.stage, 'scaffold');
  assert.equal(r.state.scaffoldStep, 1);
});

test('hint ladder: nudge, method, then walkthrough', () => {
  let s = withSteps(advance('diagnose', fresh(), { type: 'answer', verdict: v({ correct: false, reasoning: 0 }) }).state, 2);
  let r = advance('scaffold', s, { type: 'answer', verdict: v({ correct: false, reasoning: 0 }) });
  assert.deepEqual(r.action, { kind: 'hint', level: 1 });
  r = advance('scaffold', r.state, { type: 'answer', verdict: v({ correct: false, reasoning: 1 }) });
  assert.deepEqual(r.action, { kind: 'hint', level: 2 });
  r = advance('scaffold', r.state, { type: 'answer', verdict: v({ correct: false, reasoning: 1 }) });
  assert.deepEqual(r.action, { kind: 'walkthrough', then: 'scaffold' });
  assert.equal(r.state.scaffoldStep, 2);
  assert.equal(r.state.stepHints, 0);
  assert.deepEqual(r.state.scaffold[0], { hints: 2, walked: true, reasoning: 1 });
  s = r.state;
  r = advance('scaffold', s, { type: 'answer', verdict: v() });
  assert.equal(r.stage, 'transfer');
  assert.deepEqual(r.action, { kind: 'to_transfer', skipped: false });
});

test('stuck on the last scaffold step walks through and moves to transfer', () => {
  const s = { ...withSteps(fresh(), 2), scaffoldStep: 2, scaffold: [{ hints: 0, walked: false, reasoning: 3 }] };
  const r = advance('scaffold', s, { type: 'stuck' });
  assert.equal(r.stage, 'transfer');
  assert.deepEqual(r.action, { kind: 'walkthrough', then: 'transfer' });
});

test('transfer takes one attempt, then teach-back, then done', () => {
  let r = advance('transfer', fresh(), { type: 'answer', verdict: v({ correct: false, partial: true, reasoning: 2 }) });
  assert.equal(r.stage, 'teachback');
  assert.deepEqual(r.action, { kind: 'transfer_review', result: 'partial' });
  r = advance('teachback', r.state, { type: 'answer', verdict: v({ teachback: 2 }) });
  assert.equal(r.stage, 'done');
  assert.equal(r.state.teachback?.score, 2);
});

test('finish ends early from any stage', () => {
  const r = advance('scaffold', fresh(), { type: 'finish' });
  assert.equal(r.stage, 'done');
  assert.deepEqual(r.action, { kind: 'wrap_up', early: true });
  assert.throws(() => advance('done', fresh(), { type: 'finish' }));
});

test('perfect session scores 100', () => {
  let r = advance('diagnose', fresh(), { type: 'answer', verdict: v() });
  r = advance(r.stage, r.state, { type: 'answer', verdict: v() });
  r = advance(r.stage, r.state, { type: 'answer', verdict: v({ teachback: 3 }) });
  assert.deepEqual(computeRubric(r.state), { independence: 100, reasoning: 100, transfer: 100, teachback: 100, depth: 100 });
});

test('weights are 30/30/30/10 and unattempted parts score 0', () => {
  const s: SocraticState = { ...fresh(), scaffold: [{ hints: 1, walked: false, reasoning: 2 }, { hints: 0, walked: true, reasoning: null }], reasoning: [0, 2, 1], transfer: { result: 'partial', reasoning: 1 }, teachback: null };
  const r = computeRubric(s);
  assert.equal(r.independence, 35); // (60 + 10) / 2
  assert.equal(r.reasoning, 33.3); // mean 1 of 3
  assert.equal(r.transfer, 50);
  assert.equal(r.teachback, 0);
  assert.equal(r.depth, Math.round((0.3 * 35 + 0.3 * (100 / 3) + 0.3 * 50) * 10) / 10);
});

test('empty session scores 0', () => {
  assert.equal(computeRubric(fresh()).depth, 0);
});

test('misconceptions are counted per id with the stage first seen', () => {
  let r = advance('diagnose', fresh(), { type: 'answer', verdict: v({ correct: false, reasoning: 0, misconceptions: ['m1'] }) });
  r = advance('scaffold', withSteps(r.state, 3), { type: 'answer', verdict: v({ correct: false, reasoning: 0, misconceptions: ['m1', 'm2'] }) });
  assert.deepEqual(r.state.misconceptions, { m1: { stage: 'diagnose', seen: 2 }, m2: { stage: 'scaffold', seen: 1 } });
});

test('parseVerdict keeps only known bank ids and clamps marks', () => {
  const p = parseVerdict({ result: 'partial', reasoning: 7, misconceptions: ['a', 'zzz', 'a', 3], teachback: '2', transcription: '  x = 2 ' }, ['a', 'b']);
  assert.equal(p.correct, false);
  assert.equal(p.partial, true);
  assert.equal(p.reasoning, 3);
  assert.deepEqual(p.misconceptions, ['a']);
  assert.equal(p.teachback, 2);
  assert.equal(p.transcription, 'x = 2');
  assert.equal(parseVerdict({ correct: true }, []).reasoning, 1);
  assert.equal(parseVerdict({ result: 'correct', partial: true }, []).partial, false);
});

test('legacy totals and helpers', () => {
  const s: SocraticState = { ...fresh(), scaffold: [{ hints: 2, walked: true, reasoning: 1 }], stepHints: 1 };
  assert.deepEqual(legacyTotals(s), { hints: 3, revealed: true });
  assert.deepEqual(parseSummary({ strengths: ['a', 4, ' b '], to_fix: ['c'], next: 'n' }), { strengths: ['a', 'b'], toFix: ['c'], next: 'n' });
  assert.equal(clampSteps(9), 4);
  assert.equal(clampSteps('x'), 3);
  assert.deepEqual(progress('transfer', { skippedScaffold: true }).map(p => p.status), ['done', 'skipped', 'current', 'todo']);
  assert.deepEqual(progress('done', { skippedScaffold: false }).map(p => p.status), ['done', 'done', 'done', 'done']);
});
