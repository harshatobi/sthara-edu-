/**
 * TE.040 NFR-SEC-06, OPS-SCH-03 (automated): rate limits and the commercial tiers, pinned to what
 * the test documents state. A change here must be a decision, reflected in the UAT expected results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { RATE_LIMITS, AI_MODELS } from '@/lib/settings/limits';
import { PLAN_INFO, PLATFORM_SETTINGS, planOf } from '@/lib/settings/registry';

test('the limiter allows the limit, refuses the next, and opens a new window after it', () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const key = `qa:${Math.random()}`;
    for (let i = 1; i <= 3; i++) assert.equal(checkRateLimit(key, 3, 60_000).allowed, true, `call ${i}`);
    const blocked = checkRateLimit(key, 3, 60_000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.resetMs > 0 && blocked.resetMs <= 60_000);
    assert.equal(checkRateLimit(`${key}:other`, 3, 60_000).allowed, true, 'keys are independent');
    now += 60_001;
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true, 'a new window');
  } finally { Date.now = realNow; }
});

test('the caller address is the first X-Forwarded-For hop, then X-Real-IP', () => {
  assert.equal(getClientIp(new Request('https://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })), '203.0.113.9');
  assert.equal(getClientIp(new Request('https://x', { headers: { 'x-real-ip': '198.51.100.7' } })), '198.51.100.7');
  assert.equal(getClientIp(new Request('https://x')), '127.0.0.1');
});

test('rate limits are the signed-off values (requests per window)', () => {
  const table = Object.fromEntries(Object.entries(RATE_LIMITS).map(([k, v]) => [k, `${v.limit}/${v.windowMs / 60_000}m per ${v.per}`]));
  assert.deepEqual(table, {
    admin: '120/1m per user+ip', submitTyped: '20/5m per user', quizGrade: '15/5m per user',
    quizGenerate: '10/5m per user', homeworkGrade: '10/5m per user', verifySchool: '30/10m per ip',
    tutorSession: '40/5m per user', examTrack: '20/10m per user', quizGen: '15/10m per user', homeworkGen: '15/10m per user',
    paperGen: '10/10m per user', assignments: '60/10m per user', course: '120/10m per user', feed: '120/1m per user', copilot: '40/10m per user',
    copilotImage: '12/10m per user', boardPaper: '6/60m per user',
    lessons: '120/10m per user', lab: '60/10m per user', labRuns: '300/10m per user', lessonDraft: '12/10m per user', leave: '20/10m per user', checkin: '20/10m per user', capturePage: '300/10m per user',
    captureGrade: '60/10m per user', parentDesk: '60/5m per user', parentAsk: '30/10m per user', staffAsk: '30/10m per user',
    staffWhatsapp: '30/10m per user', schoolMessages: '40/10m per user', whatsappLink: '5/15m per user',
    whatsappInbound: '20/10m per user', clientErrors: '30/1m per ip',
  });
});

test('AI models by job', () => {
  assert.deepEqual({ ...AI_MODELS }, { standard: 'gemini-2.5-flash', deep: 'gemini-2.5-pro', handwriting: 'gemini-2.5-flash', fast: 'gemini-2.5-flash-lite', image: 'gemini-2.5-flash-image' });
});

test('commercial tiers: list prices per student per year (INR), and old plan names read as tiers', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PLAN_INFO).map(([k, v]) => [k, v.price])), { pilot: null, aadhara: 2000, sthamba: 2500, shikhara: 3500, mandala: null });
  assert.equal(planOf('trial'), 'pilot');
  assert.equal(planOf('standard'), 'sthamba');
  assert.equal(planOf('premium'), 'shikhara');
  assert.equal(planOf('enterprise'), 'mandala');
  assert.equal(planOf('garbage'), 'pilot');
});

test('platform settings and their bounds', () => {
  const s = PLATFORM_SETTINGS as Record<string, { type: string; default: unknown; min?: number; max?: number }>;
  assert.deepEqual(Object.keys(s).sort(), ['ai.enabled', 'debug.request_log', 'notice.message', 'notice.tone', 'trial.default_days']);
  // The request explorer's log (ops debug tools, 2026-10-13): on by default, records no query, body or names.
  assert.equal(s['debug.request_log'].type, 'boolean');
  assert.equal(s['debug.request_log'].default, true);
  assert.equal(s['ai.enabled'].default, true);
  assert.deepEqual([s['trial.default_days'].default, s['trial.default_days'].min, s['trial.default_days'].max], [30, 7, 180]);
});
