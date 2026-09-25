import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createContactHandler } from '../api/contact.mjs';

const env = {
  RESEND_API_KEY: 'test-private-resend-key', CONTACT_FROM_EMAIL: 'enquiries@sthara.in',
  CONTACT_TO_EMAIL: 'coo@sthara.in', CONTACT_ALLOWED_ORIGINS: 'https://sthara.in,https://www.sthara.in',
  TURNSTILE_SITE_KEY: 'test-public-site-key', TURNSTILE_SECRET_KEY: 'test-private-turnstile-key',
};
const body = {
  name: 'Alex School', email: 'alex@example.org', school: 'Example School', role: 'school-leader',
  phone: '', message: 'Please show us the school platform.', consent: true, website: '',
  submissionId: 'de305d54-75b4-431b-adb2-eb6b9e546014', turnstileToken: 'mock-challenge-token',
};
function req(overrides = {}) {
  return { method: 'POST', headers: { host: 'sthara.in', origin: 'https://sthara.in', 'content-type': 'application/json' }, body: { ...body }, ...overrides };
}
function provider() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => url.includes('siteverify') ? { success: true, hostname: 'sthara.in', action: 'enquiry' } : { id: 'mock-receipt-id' } };
  };
  return { calls, fetchImpl };
}
async function invoke(request = req(), overrides = {}) {
  const mock = provider();
  const handler = createContactHandler({ env, fetchImpl: mock.fetchImpl, ...overrides });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.data = JSON.parse(value); } };
  await handler(request, res);
  return { ...res, calls: mock.calls };
}

test('valid enquiry requires verified challenge and a provider receipt', async () => {
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.calls.length, 2);
  assert.deepEqual(result.calls[1].body.to, ['coo@sthara.in']);
  assert.equal(result.calls[1].body.reply_to, body.email);
  assert.equal(result.calls[1].options.headers['Idempotency-Key'], `sthara-enquiry/${body.submissionId}`);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('confirmed recipient is the server fallback and can be overridden', async () => {
  let result = await invoke(req(), { env: { ...env, CONTACT_TO_EMAIL: '' } });
  assert.deepEqual(result.calls[1].body.to, ['coo@sthara.in']);
  result = await invoke(req(), { env: { ...env, CONTACT_TO_EMAIL: 'team@example.org' } });
  assert.deepEqual(result.calls[1].body.to, ['team@example.org']);
});

test('GET exposes only the public sitekey with a same-origin referrer', async () => {
  const result = await invoke(req({ method: 'GET', headers: { host: 'sthara.in', referer: 'https://sthara.in/#contact' } }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.data, { ok: true, siteKey: env.TURNSTILE_SITE_KEY });
  assert.equal(result.calls.length, 0);
  assert.ok(!JSON.stringify(result.data).includes('private'));
});

test('only GET and POST are allowed', async () => {
  for (const method of ['PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD']) {
    const result = await invoke(req({ method }));
    assert.equal(result.statusCode, 405);
    assert.equal(result.headers.Allow, 'GET, POST');
    assert.equal(result.calls.length, 0);
  }
});

test('missing email, origin or Turnstile configuration fails closed', async () => {
  for (const key of ['RESEND_API_KEY', 'CONTACT_FROM_EMAIL', 'CONTACT_ALLOWED_ORIGINS', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
    const result = await invoke(req(), { env: { ...env, [key]: '' } });
    assert.equal(result.statusCode, 503, key);
    assert.equal(result.data.ok, false);
    assert.equal(result.calls.length, 0);
  }
});

test('public setup rejects dummy Turnstile keys and invalid mail configuration', async () => {
  for (const patch of [
    { TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
    { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
    { CONTACT_FROM_EMAIL: 'School <enquiries@sthara.in>' },
    { CONTACT_TO_EMAIL: 'a@example.org\r\nBcc: outsider@example.org' },
  ]) {
    const result = await invoke(req(), { env: { ...env, ...patch } });
    assert.equal(result.statusCode, 503);
    assert.equal(result.calls.length, 0);
  }
});

test('invalid allowlists fail closed, including wildcards and nonlocal HTTP', async () => {
  for (const allowed of ['*', 'https://*.sthara.in', 'http://sthara.in', 'https://sthara.in/path', 'https://sthara.in?x=1', 'https://user:password@sthara.in', 'https://sthara.in,']) {
    const result = await invoke(req(), { env: { ...env, CONTACT_ALLOWED_ORIGINS: allowed } });
    assert.ok([403, 503].includes(result.statusCode), allowed);
    assert.equal(result.calls.length, 0);
  }
});

test('POST rejects absent, cross-origin, null, malformed and mismatched-host origins', async () => {
  for (const patch of [
    { origin: '' }, { origin: 'null' }, { origin: 'https://attacker.example' },
    { origin: 'https://sthara.in.attacker.example' }, { origin: 'https://sthara.in/' },
    { origin: 'https://www.sthara.in' }, { host: 'spoofed.example' },
    { 'sec-fetch-site': 'cross-site' }, { origin: ['https://sthara.in'] },
  ]) {
    const request = req();
    Object.assign(request.headers, patch);
    const result = await invoke(request);
    assert.equal(result.statusCode, 403);
    assert.equal(result.calls.length, 0);
  }
});

test('both configured hostnames work when origin and request host match', async () => {
  const request = req({ method: 'GET', headers: { origin: 'https://www.sthara.in', host: 'www.sthara.in' } });
  assert.equal((await invoke(request)).statusCode, 200);
});

test('only JSON content is accepted; URL-encoded forms do not bypass origin checks', async () => {
  for (const contentType of ['', 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonp']) {
    const request = req(); request.headers['content-type'] = contentType;
    const result = await invoke(request);
    assert.equal(result.statusCode, 415);
    assert.equal(result.calls.length, 0);
  }
});

test('valid raw JSON, buffers and streamed requests are accepted', async () => {
  assert.equal((await invoke(req({ body: JSON.stringify(body) }))).statusCode, 200);
  assert.equal((await invoke(req({ body: Buffer.from(JSON.stringify(body)) }))).statusCode, 200);
  const request = Readable.from([JSON.stringify(body)]);
  Object.assign(request, { method: 'POST', headers: req().headers });
  assert.equal((await invoke(request)).statusCode, 200);
});

test('malformed and nonobject bodies reject without sending', async () => {
  for (const value of ['{', '[]', 'null', '"string"', 123]) {
    const result = await invoke(req({ body: value }));
    assert.equal(result.statusCode, 400);
    assert.equal(result.calls.length, 0);
  }
  const request = req();
  Object.defineProperty(request, 'body', { get() { throw new SyntaxError('Malformed JSON'); } });
  assert.equal((await invoke(request)).statusCode, 400);
});

test('size limits apply to declared, parsed and streamed bodies', async () => {
  let request = req(); request.headers['content-length'] = '20000';
  assert.equal((await invoke(request)).statusCode, 413);
  assert.equal((await invoke(req({ body: { ...body, padding: 'x'.repeat(17000) } }))).statusCode, 413);
  request = Readable.from(['x'.repeat(9000), 'x'.repeat(9000)]);
  Object.assign(request, { method: 'POST', headers: req().headers });
  assert.equal((await invoke(request)).statusCode, 413);
});

test('all required fields, lengths, email, role, phone and consent are validated', async () => {
  for (const [key, value] of [
    ['name', ''], ['name', 'x'.repeat(101)], ['school', 27], ['email', 'bad@email'],
    ['email', 'person@example.org\r\nBcc: other@example.org'], ['school', 'My\nSchool'],
    ['role', 'hacker'], ['phone', 'abc123'], ['message', 'short'], ['message', 'x'.repeat(3001)],
    ['message', 'Contains a null\x00 character'], ['consent', false], ['consent', 'true'],
    ['submissionId', 'not-a-uuid'], ['turnstileToken', ''], ['turnstileToken', 'x'.repeat(2049)],
  ]) {
    const result = await invoke(req({ body: { ...body, [key]: value } }));
    assert.equal(result.statusCode, 400, key);
    assert.equal(result.calls.length, 0, key);
  }
});

test('filled honeypot is rejected without false success or provider calls', async () => {
  const result = await invoke(req({ body: { ...body, website: 'https://spam.example' } }));
  assert.equal(result.statusCode, 400);
  assert.equal(result.data.ok, false);
  assert.equal(result.calls.length, 0);
});

test('untrusted HTML remains plain text and cannot alter routing or headers', async () => {
  const result = await invoke(req({ body: { ...body, name: '<img src=x onerror=alert(1)>', message: '<script>alert("payload")</script>', to: 'attacker@example.org', from: 'attacker@example.org', subject: 'Injected' } }));
  assert.equal(result.statusCode, 200);
  const mail = result.calls[1].body;
  assert.equal(mail.html, undefined);
  assert.ok(mail.text.includes('<script>alert("payload")</script>'));
  assert.deepEqual(mail.to, ['coo@sthara.in']);
  assert.equal(mail.from, env.CONTACT_FROM_EMAIL);
  assert.equal(mail.subject, 'New Sthara school enquiry');
});

test('challenge failures, hostname mismatch and action mismatch never reach mail', async () => {
  for (const verification of [{ success: false }, { success: true, hostname: 'attacker.example', action: 'enquiry' }, { success: true, hostname: 'sthara.in', action: 'login' }]) {
    let calls = 0;
    const result = await invoke(req(), { fetchImpl: async () => { calls++; return { ok: true, json: async () => verification }; } });
    assert.equal(result.statusCode, 400);
    assert.equal(calls, 1);
  }
});

test('provider failures, malformed receipts and network errors never report success', async () => {
  for (const stage of ['verification-http', 'verification-json', 'mail-http', 'mail-json', 'mail-receipt', 'network']) {
    const result = await invoke(req(), { fetchImpl: async url => {
      const challenge = url.includes('siteverify');
      if (stage === 'network') throw new Error('provider-secret-should-not-leak');
      return {
        ok: !(stage === 'verification-http' && challenge) && !(stage === 'mail-http' && !challenge),
        json: async () => {
          if ((stage === 'verification-json' && challenge) || (stage === 'mail-json' && !challenge)) throw new Error('bad JSON');
          return challenge ? { success: true, hostname: 'sthara.in', action: 'enquiry' } : stage === 'mail-receipt' ? {} : { id: 'receipt' };
        },
      };
    } });
    assert.equal(result.statusCode, 502, stage);
    assert.equal(result.data.ok, false);
    assert.ok(!JSON.stringify(result.data).includes('provider-secret'));
  }
});

test('a timed out provider request aborts and returns a delivery error', async () => {
  let aborted = false;
  const result = await invoke(req(), {
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true })),
  });
  assert.equal(aborted, true);
  assert.equal(result.statusCode, 502);
  assert.equal(result.data.ok, false);
});
