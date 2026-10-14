/** TE.040 WA-01..04, WA-SEC-01 (automated): numbers, channel mode, link usability and the webhook signature. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { toE164, maskPhone, whatsappConfig, linkUsable } from '@/lib/whatsapp/config';
import { verifySignature } from '@/lib/whatsapp/send';

const env = process.env as Record<string, string | undefined>;
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete env[k]; else env[k] = v; }
  try { fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete env[k]; else env[k] = v; } }
}

test('Indian mobile numbers get +91; others must be written in full', () => {
  assert.equal(toE164('98765 43210'), '+919876543210');
  assert.equal(toE164('098765-43210'), '+919876543210');
  assert.equal(toE164('+91 98765 43210'), '+919876543210');
  assert.equal(toE164('0044 20 7946 0958'), '+442079460958');
  for (const bad of ['', '12345', 'abc', null, 9876543210, '+0123456789']) assert.equal(toE164(bad as never), null, String(bad));
});

test('numbers are masked for display', () => {
  assert.equal(maskPhone('+919876543210'), '+91 98xxxxx210');
});

test('with no real Cloud API credentials the channel is simulated (nothing is sent)', () => {
  withEnv({ WHATSAPP_ACCESS_TOKEN: 'dummy-token', WHATSAPP_PHONE_NUMBER_ID: undefined }, () => {
    assert.equal(whatsappConfig().mode, 'simulated');
    assert.equal(linkUsable({ verified_at: '2026-09-27T10:00:00Z', verified_mode: 'simulated' }), true);
  });
  withEnv({ WHATSAPP_ACCESS_TOKEN: 'EAAG-real', WHATSAPP_PHONE_NUMBER_ID: '1234567890' }, () => {
    assert.equal(whatsappConfig().mode, 'live');
    assert.equal(linkUsable({ verified_at: '2026-09-27T10:00:00Z', verified_mode: 'simulated' }), false, 'a simulated code does not verify a live link');
    assert.equal(linkUsable({ verified_at: '2026-09-27T10:00:00Z', verified_mode: 'live' }), true);
  });
  assert.equal(linkUsable({ verified_at: null }), false);
  assert.equal(linkUsable(null), false);
});

test('webhook deliveries need the exact Meta signature over the raw body', () => {
  withEnv({ WHATSAPP_APP_SECRET: 'qa-app-secret' }, () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const good = 'sha256=' + crypto.createHmac('sha256', 'qa-app-secret').update(body, 'utf8').digest('hex');
    assert.equal(verifySignature(body, good), true);
    assert.equal(verifySignature(body + ' ', good), false, 'a changed body');
    assert.equal(verifySignature(body, good.replace('sha256=', 'sha1=')), false);
    assert.equal(verifySignature(body, null), false);
    assert.equal(verifySignature(body, 'sha256=' + '0'.repeat(64)), false);
  });
  withEnv({ WHATSAPP_APP_SECRET: undefined }, () => {
    assert.equal(verifySignature('{}', 'sha256=' + crypto.createHmac('sha256', '').update('{}').digest('hex')), false, 'no secret configured: refuse everything');
  });
});
