import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { feeLinkKey, retryDelaySeconds, seal, toPaise, unseal, verifyPaySignature } from './book';

const sign = (secret: string, ts: string, body: string) => `v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

test('accepts what Pay signed', () => {
  const now = 1_800_000_000_000, ts = String(now);
  assert.equal(verifyPaySignature('s3cret', ts, sign('s3cret', ts, '{"a":1}'), '{"a":1}', now), true);
});
test('refuses a wrong secret, a changed body, a missing header', () => {
  const now = 1_800_000_000_000, ts = String(now), sig = sign('s3cret', ts, 'body');
  assert.equal(verifyPaySignature('other', ts, sig, 'body', now), false);
  assert.equal(verifyPaySignature('s3cret', ts, sig, 'body ', now), false);
  assert.equal(verifyPaySignature('s3cret', null, sig, 'body', now), false);
  assert.equal(verifyPaySignature('s3cret', ts, null, 'body', now), false);
  assert.equal(verifyPaySignature('', ts, sig, 'body', now), false);
  assert.equal(verifyPaySignature('s3cret', ts, sig.slice(3), 'body', now), false);
});
test('refuses a replay outside five minutes, either way', () => {
  const now = 1_800_000_000_000, old = String(now - 6 * 60_000), future = String(now + 6 * 60_000);
  assert.equal(verifyPaySignature('s', old, sign('s', old, 'b'), 'b', now), false);
  assert.equal(verifyPaySignature('s', future, sign('s', future, 'b'), 'b', now), false);
});
test('a sealed key opens only for its own school', () => {
  const k = randomBytes(32).toString('base64');
  const sealed = seal('spk_secret', 'school-a', k);
  assert.ok(!sealed.includes('spk_secret'));
  assert.equal(unseal(sealed, 'school-a', k), 'spk_secret');
  assert.throws(() => unseal(sealed, 'school-b', k));
  assert.throws(() => unseal(sealed, 'school-a', randomBytes(32).toString('base64')));
});
test('rupees become exact paise', () => {
  assert.equal(toPaise(12500.5), 1250050);
  assert.equal(toPaise(0.07), 7);
  assert.equal(toPaise(1234.56), 123456);
});
test('the same invoice, balance and day give the same link key; anything else gives a new one', () => {
  assert.equal(feeLinkKey('i', 100, '2026-11-03'), feeLinkKey('i', 100, '2026-11-03'));
  assert.notEqual(feeLinkKey('i', 100, '2026-11-03'), feeLinkKey('i', 90, '2026-11-03'));
  assert.notEqual(feeLinkKey('i', 100, '2026-11-03'), feeLinkKey('i', 100, '2026-11-04'));
});
test('retries back off and stop growing', () => {
  assert.equal(retryDelaySeconds(1), 60);
  assert.equal(retryDelaySeconds(3), 240);
  assert.equal(retryDelaySeconds(50), 21600);
});
