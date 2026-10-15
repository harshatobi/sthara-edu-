/**
 * TE.040 AUTH-02, NFR-SEC-04/05, OPS-ERR-03, WA-SEC-01 (automated): the endpoints that are open on
 * purpose, and the machine-to-machine ones, behave as designed with bad input.
 */
import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { IS_LOCAL } from '../support/env';

const ip = () => ({ 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

test('health reports on the app and its database without exposing secrets', async ({ request }) => {
  const res = await request.get('/api/health');
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(JSON.stringify(body)).not.toMatch(/key|secret|password|token/i);
  if (!IS_LOCAL) expect(res.status(), 'the production database should be reachable').toBe(200);
});

test('the public platform settings expose only the sign-in notice and the pilot length', async ({ request }) => {
  const res = await request.get('/api/platform/public');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(['notice', 'trialDays']);
  expect(body.trialDays).toBeGreaterThanOrEqual(7);
  expect(body.trialDays).toBeLessThanOrEqual(180);
  if (body.notice) expect(['info', 'warning', 'critical']).toContain(body.notice.tone);
});

test('school code lookup refuses an empty or too-short code', async ({ request }) => {
  for (const schoolCode of [undefined, '', 'ab', '   ']) {
    const res = await request.post('/api/auth/verify-school', { data: { schoolCode }, headers: ip() });
    expect(res.status(), String(schoolCode)).toBe(400);
    expect(await res.json()).toMatchObject({ valid: false, error: 'Enter your school code.' });
  }
});

test('school code lookup is rate limited per address (30 in 10 minutes)', async ({ request }) => {
  test.skip(!process.env.E2E_RATE_LIMITS, 'Set E2E_RATE_LIMITS=1: this sends 31 lookups from one address.');
  const headers = { 'x-forwarded-for': '10.250.250.250' };
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await request.post('/api/auth/verify-school', { data: { schoolCode: 'ZZQA000' }, headers })).status();
  expect(last).toBe(429);
});

test('the WhatsApp webhook refuses a wrong verify token', async ({ request }) => {
  const res = await request.get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-qa&hub.challenge=123');
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toContain('123');
});

test('the WhatsApp webhook refuses deliveries without a valid Meta signature', async ({ request }) => {
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const unsigned = await request.post('/api/whatsapp/webhook', { data: payload, headers: { 'content-type': 'application/json' } });
  expect(unsigned.status()).toBe(401);
  const wrong = 'sha256=' + crypto.createHmac('sha256', 'not-the-app-secret').update(payload).digest('hex');
  const forged = await request.post('/api/whatsapp/webhook', { data: payload, headers: { 'content-type': 'application/json', 'x-hub-signature-256': wrong } });
  expect(forged.status()).toBe(401);
});

test('the attendance job refuses callers without the cron secret', async ({ request }) => {
  for (const auth of [undefined, 'Bearer wrong', 'Bearer ']) {
    const res = await request.post('/api/cron/attendance', { headers: auth ? { authorization: auth } : {} });
    expect(res.status(), String(auth)).toBe(401);
  }
});

test('biometric devices without a token are refused', async ({ request }) => {
  const res = await request.post('/api/attendance/device', { data: { punches: [] } });
  expect(res.status()).toBe(401);
  const short = await request.post('/api/attendance/device', { data: { punches: [] }, headers: { 'x-device-token': 'short' } });
  expect(short.status()).toBe(401);
});

test('browser error reports: junk and oversized bodies are absorbed, never a server error', async ({ request }) => {
  const junk = await request.post('/api/errors', { data: 'not json', headers: { 'content-type': 'application/json', ...ip() } });
  expect(junk.status()).toBeLessThan(500);
  // Commit 99e7dfe: the route reads at most 16 KB whatever Content-Length says.
  const big = await request.post('/api/errors', {
    data: JSON.stringify({ kind: 'render', message: 'x'.repeat(200_000) }),
    headers: { 'content-type': 'application/json', ...ip() },
  });
  expect(big.status()).toBeLessThan(500);
});

test('the enquiry form endpoint only answers the website itself', async ({ request, baseURL }) => {
  const foreign = await request.post('/api/contact', { data: {}, headers: { ...ip(), origin: 'https://evil.example' } });
  expect(foreign.status()).toBe(403);
  const noOrigin = await request.post('/api/contact', { data: {}, headers: ip() });
  expect(noOrigin.status()).toBe(403);
  const ownEmpty = await request.post('/api/contact', { data: {}, headers: { ...ip(), origin: baseURL! } });
  expect(ownEmpty.status(), 'an empty enquiry from the site is a validation error, never stored').toBe(400);
  const widget = await request.get('/api/contact', { headers: { referer: `${baseURL}/contact` } });
  expect(widget.status()).toBe(200);
  expect(Object.keys(await widget.json()).sort()).toEqual(['ok', 'siteKey']);
});
