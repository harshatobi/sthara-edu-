import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_FEATURES, MODEL_PRICES, costUsd, countsFrom } from './pricing';
import { daysInIstMonth, usageWindow } from './window';
import { AI_MODELS, CLAUDE_BY_FEATURE, CLAUDE_MODELS, claudeChoice } from '../settings/limits';

const zero = { input: 0, output: 0, thinking: 0, cached: 0 };

test('every model the routes use has a price', () => {
  for (const m of Object.values(AI_MODELS)) assert.ok(MODEL_PRICES[m], `no price for ${m}`);
});

test('flash: input, output and thinking at list price', () => {
  // 1M in @ $0.30 + 1M out @ $2.50 + 1M thinking @ $2.50
  assert.equal(costUsd('gemini-2.5-flash', { input: 1e6, output: 1e6, thinking: 1e6, cached: 0 }), 5.3);
  assert.equal(costUsd('gemini-2.5-flash', { ...zero, input: 1000, output: 200 }), 0.0008);
});

test('cached tokens are part of input and bill at the cached rate', () => {
  // 1M prompt, 400k of it cached: 600k @ 0.30 + 400k @ 0.03
  assert.equal(costUsd('gemini-2.5-flash', { ...zero, input: 1e6, cached: 4e5 }), 0.192);
  // cached can never exceed input
  assert.equal(costUsd('gemini-2.5-flash', { ...zero, input: 100, cached: 500 }), costUsd('gemini-2.5-flash', { ...zero, input: 100, cached: 100 }));
});

test('pro switches to long-context rates above 200k prompt tokens', () => {
  assert.equal(costUsd('gemini-2.5-pro', { ...zero, input: 200_000, output: 1000 }), 0.26);
  assert.equal(costUsd('gemini-2.5-pro', { ...zero, input: 200_001, output: 1000 }), 0.5150025);
});

test('unknown models are unpriced, never guessed', () => {
  assert.equal(costUsd('some-new-model', { ...zero, input: 10 }), null);
});

test('usage metadata maps from Gemini field names; junk counts as zero', () => {
  assert.deepEqual(countsFrom({ promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 7, cachedContentTokenCount: 2, totalTokenCount: 24 }),
    { input: 12, output: 5, thinking: 7, cached: 2 });
  assert.deepEqual(countsFrom(undefined), zero);
  assert.deepEqual(countsFrom({ promptTokenCount: -4, candidatesTokenCount: 'x', thoughtsTokenCount: NaN }), zero);
});

test('feature keys are unique labels', () => {
  const labels = Object.values(AI_FEATURES).map(f => f.label);
  assert.equal(new Set(labels).size, labels.length);
});

// 2026-09-25 22:00 IST = 16:30 UTC
const NOW = new Date('2026-09-25T16:30:00Z');

test('windows are whole IST days ending tonight', () => {
  const w = usageWindow({ range: '7d' }, NOW);
  assert.ok(!('error' in w));
  if ('error' in w) return;
  assert.equal(w.to.toISOString(), '2026-09-25T18:30:00.000Z'); // midnight IST 26 Sep
  assert.equal(w.from.toISOString(), '2026-09-18T18:30:00.000Z'); // midnight IST 19 Sep
  assert.equal(w.days, 7);
});

test('late-night UTC is already the next IST day', () => {
  const w = usageWindow({ range: 'today' }, new Date('2026-09-25T19:00:00Z')); // 00:30 IST on the 26th
  if ('error' in w) throw new Error(w.error);
  assert.equal(w.from.toISOString(), '2026-09-25T18:30:00.000Z');
});

test('this month and last month', () => {
  const m = usageWindow({ range: 'mtd' }, NOW);
  const l = usageWindow({ range: 'lastmonth' }, NOW);
  if ('error' in m || 'error' in l) throw new Error('window');
  assert.equal(m.from.toISOString(), '2026-08-31T18:30:00.000Z');
  assert.equal(m.days, 25);
  assert.equal(l.from.toISOString(), '2026-07-31T18:30:00.000Z');
  assert.equal(l.to.toISOString(), '2026-08-31T18:30:00.000Z');
  assert.equal(l.days, 31);
  assert.equal(daysInIstMonth(NOW), 30);
});

test('custom dates are validated', () => {
  const ok = usageWindow({ from: '2026-09-01', to: '2026-09-03' }, NOW);
  if ('error' in ok) throw new Error(ok.error);
  assert.equal(ok.days, 3);
  assert.ok('error' in usageWindow({ from: '2026-09-03', to: '2026-09-01' }, NOW));
  assert.ok('error' in usageWindow({ from: '2026-02-30', to: '2026-03-01' }, NOW));
  assert.ok('error' in usageWindow({ from: '2026-09-01' }, NOW));
  assert.ok('error' in usageWindow({ from: '2024-01-01', to: '2026-01-01' }, NOW));
});

test('unknown range falls back to 30 days', () => {
  const w = usageWindow({ range: 'forever' }, NOW);
  if ('error' in w) throw new Error(w.error);
  assert.equal(w.key, '30d');
});

test('every Claude model the routes use has a price', () => {
  for (const { model } of Object.values(CLAUDE_MODELS)) assert.ok(MODEL_PRICES[model], `no price for ${model}`);
});

test('Claude jobs run on Sonnet or Haiku only, never Opus', () => {
  for (const { model } of [...Object.values(CLAUDE_MODELS), ...Object.values(CLAUDE_BY_FEATURE)]) assert.match(model, /^claude-(sonnet|haiku)-/);
  assert.ok(!Object.keys(MODEL_PRICES).some(m => m.includes('opus')));
});

test('Claude usage: cache reads fold into input and bill at the cached rate; thinking is already in output', () => {
  const t = countsFrom({ input_tokens: 1000, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0, output_tokens: 500 });
  assert.deepEqual(t, { input: 5000, output: 500, thinking: 0, cached: 4000 });
  // 1,000 @ $2 + 4,000 @ $0.20 + 500 @ $10 per 1M
  assert.equal(costUsd('claude-sonnet-5-5', t), 0.0078);
});

test('Gemini usage is still read the Gemini way', () => {
  assert.deepEqual(countsFrom({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 1 }), { input: 10, output: 5, thinking: 2, cached: 1 });
});

test('features pick their own Claude model for standard work; other jobs keep theirs', () => {
  assert.deepEqual(claudeChoice('standard', 'parentAsk'), { model: 'claude-haiku-5-5', effort: 'low' });
  assert.deepEqual(claudeChoice('standard', 'copilot'), { model: 'claude-sonnet-5-5', effort: 'low' });
  assert.deepEqual(claudeChoice('standard', 'boardPaper'), CLAUDE_MODELS.standard);
  assert.deepEqual(claudeChoice('deep', 'boardPaper'), CLAUDE_MODELS.deep);
  assert.deepEqual(claudeChoice('handwriting', 'captureGrade'), CLAUDE_MODELS.handwriting);
});

test('Claude cache writes bill at 1.25x input, reads at the cached rate', () => {
  const t = countsFrom({ input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 4000, output_tokens: 200 });
  assert.deepEqual(t, { input: 4100, output: 200, thinking: 0, cached: 0, cacheWrite: 4000 });
  // 100 @ $2 + 4,000 @ $2.50 + 200 @ $10 per 1M
  assert.equal(costUsd('claude-sonnet-5-5', t), 0.0122);
  const next = countsFrom({ input_tokens: 150, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0, output_tokens: 200 });
  // 150 @ $2 + 4,000 @ $0.20 + 200 @ $10 per 1M
  assert.equal(costUsd('claude-sonnet-5-5', next), 0.0031);
});
