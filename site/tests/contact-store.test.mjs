import test from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../api/contact.mjs';

// Store mode: the host app (sthara-edu-) saves enquiries in its own database.
const body = {
  name: 'Alex School', email: 'alex@example.org', school: 'Example School', role: 'school-leader',
  phone: '', message: 'Please show us the school platform.', consent: true, website: '',
  submissionId: 'de305d54-75b4-431b-adb2-eb6b9e546014',
};
const req = (over = {}) => ({ method: 'POST', headers: { host: 'www.sthara.in', origin: 'https://www.sthara.in', 'content-type': 'application/json' }, body: { ...body }, ...over });
function setup(env = {}, storeImpl) {
  const saved = [];
  const calls = [];
  const store = storeImpl || (async (fields, meta) => { saved.push({ fields, meta }); });
  const fetchImpl = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => (url.includes('siteverify') ? { success: true, hostname: 'www.sthara.in', action: 'enquiry' } : { id: 'r1' }) }; };
  const handler = createContactHandler({ env, fetchImpl, store });
  const run = async r => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.data = JSON.parse(v); } }; await handler(r, res); return res; };
  return { run, saved, calls };
}

test('stores a same-origin enquiry with no email or Turnstile configured', async () => {
  const { run, saved, calls } = setup();
  const res = await run(req());
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].fields.email, 'alex@example.org');
  assert.deepEqual(saved[0].meta, { submissionId: body.submissionId, origin: 'https://www.sthara.in' });
  assert.equal(calls.length, 0, 'no provider traffic');
});

test('GET reports no widget, so the form can open without Turnstile', async () => {
  const { run } = setup();
  const res = await run({ method: 'GET', headers: { host: 'www.sthara.in', referer: 'https://www.sthara.in/contact' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.siteKey, null);
});

test('without an allowlist only this same site is accepted', async () => {
  const { run, saved } = setup();
  assert.equal((await run(req({ headers: { host: 'www.sthara.in', origin: 'https://evil.example', 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal((await run(req({ headers: { host: 'www.sthara.in', origin: 'http://www.sthara.in', 'content-type': 'application/json' } }))).statusCode, 403, 'plain HTTP off localhost');
  assert.equal((await run(req({ headers: { host: 'www.sthara.in', origin: 'https://www.sthara.in', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' } }))).statusCode, 403);
  assert.equal((await run(req({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' } }))).statusCode, 200, 'local dev');
  assert.equal(saved.length, 1);
});

test('an allowlist, when set, still applies in store mode', async () => {
  const { run } = setup({ CONTACT_ALLOWED_ORIGINS: 'https://sthara.in' });
  assert.equal((await run(req())).statusCode, 403);
  assert.equal((await run(req({ headers: { host: 'sthara.in', origin: 'https://sthara.in', 'content-type': 'application/json' } }))).statusCode, 200);
});

test('validation, honeypot and consent still apply before anything is stored', async () => {
  const { run, saved } = setup();
  assert.equal((await run(req({ body: { ...body, consent: false } }))).statusCode, 400);
  assert.equal((await run(req({ body: { ...body, website: 'http://spam' } }))).statusCode, 400);
  assert.equal((await run(req({ body: { ...body, email: 'nope' } }))).statusCode, 400);
  assert.equal(saved.length, 0);
});

test('a storage failure never reports success', async () => {
  const { run } = setup({}, async () => { throw new Error('db down'); });
  const res = await run(req());
  assert.equal(res.statusCode, 502);
  assert.equal(res.data.ok, false);
});

test('once Turnstile is configured it is required and verified before storing', async () => {
  const env = { TURNSTILE_SITE_KEY: 'live-site-key', TURNSTILE_SECRET_KEY: 'live-secret' };
  const { run, saved, calls } = setup(env);
  assert.equal((await run(req())).statusCode, 400, 'missing token');
  const ok = await run(req({ body: { ...body, turnstileToken: 'tok' } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(calls[0].url.includes('siteverify'), true);
  assert.equal(saved.length, 1);
});

test('dummy Turnstile keys are ignored rather than trusted', async () => {
  const { run } = setup({ TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' });
  const res = await run({ method: 'GET', headers: { host: 'www.sthara.in', referer: 'https://www.sthara.in/contact' } });
  assert.equal(res.data.siteKey, null);
});

test('stored enquiries succeed even if the optional email fails', async () => {
  const saved = [];
  const env = { RESEND_API_KEY: 'k', CONTACT_FROM_EMAIL: 'enquiries@sthara.in', CONTACT_TO_EMAIL: 'coo@sthara.in' };
  const handler = createContactHandler({ env, store: async f => { saved.push(f); }, fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.data = JSON.parse(v); } };
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 1);
});
