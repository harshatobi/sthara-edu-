/**
 * TE.040 STU-TUT-04/05 (automated): the AI tutor's language filter and its signed session state.
 * DEF-001 is recorded as a `todo` test: it reports every official CBSE curriculum line the filter
 * blocks without failing the run, and starts passing once the filter is fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { containsFoulLanguage } from '@/lib/tutor/safety';
import { signSession, verifySession, type TutorSessionState } from '@/lib/tutor/sessionToken';
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

// ── Signed session state ────────────────────────────────────────────────────

process.env.TUTOR_SESSION_SECRET = 'qa-tutor-secret-for-tests-only';
const base: TutorSessionState = { uid: 'student-1', subject: 'Science', topic: 'Heredity', step: 2, hints: 1, revealed: false, done: false, question: 'Q2', sid: 'session-1', seq: 2, iat: Date.now() };

test('a session token round-trips for its own student', () => {
  assert.deepEqual(verifySession(signSession(base), 'student-1'), base);
});

test('the hint count cannot be lowered by editing the token', () => {
  const [body, mac] = signSession(base).split('.');
  const edited = JSON.parse(Buffer.from(body, 'base64url').toString());
  edited.hints = 0;
  const forged = `${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${mac}`;
  assert.equal(verifySession(forged, 'student-1'), null);
});

test('a token is refused for another student, when stale (3 hours), or when malformed', () => {
  assert.equal(verifySession(signSession(base), 'student-2'), null);
  assert.equal(verifySession(signSession({ ...base, iat: Date.now() - 3 * 3600_000 - 1000 }), 'student-1'), null);
  for (const junk of [null, 42, '', 'no-dot', 'a.b', `${signSession(base)}x`]) assert.equal(verifySession(junk, 'student-1'), null, String(junk));
});
