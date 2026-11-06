/**
 * TE.040 STU-TUT-04/05 (automated): the AI tutor's language filter and its server-side scoring (the Socratic engine).
 * DEF-001 is recorded as a `todo` test: it reports every official CBSE curriculum line the filter
 * blocks without failing the run, and starts passing once the filter is fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { containsFoulLanguage } from '@/lib/tutor/safety';
import { advance, computeRubric, initialState, type Verdict } from '@/lib/tutor/socratic';
import { ROOT } from '../../tools/inventory';

test('the filter matches whole words only: school words that contain a blocked word pass', () => {
  for (const ok of ['the class mass surpass', 'Hello, is this right?', 'Scroll down', 'assessment of the passage', 'Dickens wrote novels', 'shell and hellish']) {
    assert.equal(containsFoulLanguage(ok), false, ok);
  }
});

test('abuse is caught in English and Hindi slang, whatever the case and punctuation', () => {
  for (const bad of ['this is SHIT', 'no... fuck this', 'tu chutiya hai', 'WTF']) {
    assert.equal(containsFoulLanguage(bad), true, bad);
  }
});

function curriculumStrings(): { file: string; text: string }[] {
  const dir = path.join(ROOT, 'src/lib/curriculum/cbse-2026-27');
  const out: { file: string; text: string }[] = [];
  const walk = (o: unknown, file: string) => {
    if (typeof o === 'string') out.push({ file, text: o });
    else if (Array.isArray(o)) o.forEach(x => walk(x, file));
    else if (o && typeof o === 'object') Object.values(o).forEach(x => walk(x, file));
  };
  for (const f of fs.readdirSync(dir)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f);
  return out;
}

test('DEF-001: no official CBSE curriculum line is blocked by the tutor filter', { todo: 'DEF-001 open: "sex", "bc", "mc" are blocked as whole words' }, () => {
  const blocked = curriculumStrings().filter(s => containsFoulLanguage(s.text)).map(s => `${s.file}: ${s.text.slice(0, 90)}`);
  assert.deepEqual(blocked, []);
});

test('DEF-001: ordinary answers in History and Economics are not treated as abuse', { todo: 'DEF-001 open' }, () => {
  for (const answer of ['The Harappan cities flourished around 2500 BC', 'Equilibrium is where MR = MC', 'Sex determination in humans is by the father\'s chromosome']) {
    assert.equal(containsFoulLanguage(answer), false, answer);
  }
});

test('DEF-001 evidence: how many curriculum lines the filter blocks today', () => {
  const n = curriculumStrings().filter(s => containsFoulLanguage(s.text)).length;
  // 8 on main at 99e7dfe. When this changes, update DEF-001 in the defect log.
  console.log(`  DEF-001: ${n} official curriculum line(s) blocked by the tutor filter`);
  assert.ok(n >= 0);
});

// ── Scoring state (server-side since 2026-11-06) ─────────────────────────────
// The session's state lives in tutor_sessions on the server; the client only sends its answer and the turn
// number, so it has nothing to edit. What it can't change is decided by the engine below.

const verdict = (o: Partial<Verdict> = {}): Verdict => ({ correct: false, partial: false, reasoning: 0, misconceptions: [], teachback: null, transcription: null, note: '', ...o });

test('the hint ladder cannot be skipped: nudge, method, then the step is walked through and scored as a reveal', () => {
  let r = advance('diagnose', initialState('standard', 'P', 'Q'), { type: 'answer', verdict: verdict() });
  r = advance('scaffold', { ...r.state, scaffoldTotal: 2 }, { type: 'answer', verdict: verdict() });
  assert.deepEqual(r.action, { kind: 'hint', level: 1 });
  r = advance('scaffold', r.state, { type: 'answer', verdict: verdict() });
  assert.deepEqual(r.action, { kind: 'hint', level: 2 });
  r = advance('scaffold', r.state, { type: 'answer', verdict: verdict() });
  assert.equal(r.action.kind, 'walkthrough');
  assert.equal(r.state.scaffold[0].walked, true);
});

test('tutor depth is 30% independence, 30% reasoning, 30% transfer, 10% teach-back; ending early scores what was done', () => {
  const full = { ...initialState('standard', 'P', 'Q'), skippedScaffold: true, reasoning: [3, 3], transfer: { result: 'correct' as const, reasoning: 3 }, teachback: { score: 3 } };
  assert.equal(computeRubric(full).depth, 100);
  assert.equal(computeRubric({ ...full, teachback: null }).depth, 90);
  assert.equal(computeRubric({ ...full, transfer: null, teachback: null }).depth, 60);
});
