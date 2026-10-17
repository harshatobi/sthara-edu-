import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiFailure, retryDelaySeconds, withRetry, pooled } from './retry';

const busy = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
const daily = new Error('{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}');
const perMinute = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"1s"}]}}');

test('Gemini failures are told apart', () => {
  assert.equal(aiFailure(busy), 'busy');
  assert.equal(aiFailure(daily), 'quota');
  assert.equal(aiFailure(new Error('JSON parse')), 'other');
  assert.equal(retryDelaySeconds(perMinute), 1);
  assert.equal(retryDelaySeconds(daily), null);
});

test('busy is retried, with a fallback on later attempts; a daily quota is not', async () => {
  const seen: number[] = [];
  const r = await withRetry(async a => { seen.push(a); if (a < 2) throw busy; return 'ok'; }, { baseMs: 1 });
  assert.equal(r, 'ok'); assert.deepEqual(seen, [0, 1, 2]);
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw daily; }, { baseMs: 1 }));
  assert.equal(calls, 1, 'no point retrying a quota that will not clear');
  calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw busy; }, { baseMs: 1, tries: 3 }));
  assert.equal(calls, 3);
});

test('pooled keeps order and never runs more than the limit at once', async () => {
  let live = 0, peak = 0;
  const tasks = [5, 1, 3, 2, 4].map(n => async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, n)); live--; return n; });
  assert.deepEqual(await pooled(tasks, 2), [5, 1, 3, 2, 4]);
  assert.equal(peak, 2);
});
