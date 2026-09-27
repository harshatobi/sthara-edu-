import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, fingerprintOf, hash, isNoise, normaliseMessage, scrub, topFrame } from './fingerprint';

test('scrub: tokens, emails, phone numbers and passwords never reach the log', () => {
  const s = scrub('Bearer abc.def-123 for priya@school.in with password=Hunter2 and phone 9876543210, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijklmn');
  assert.ok(!/abc\.def-123|priya@school|Hunter2|9876543210|eyJhbGci/.test(s), s);
  assert.match(s, /\[token\].*\[email\].*\[redacted\].*\[phone\]/);
});

test('paths lose their query strings and ids', () => {
  assert.equal(cleanPath('/admin/schedule?tab=cover&token=x'), '/admin/schedule');
  assert.equal(cleanPath('/api/ops/schools/3f1c2a44-1111-2222-3333-444455556666/people'), '/api/ops/schools/:id/people');
  assert.equal(cleanPath(null), null);
});

test('repeats of one problem group together; different problems do not', () => {
  assert.equal(normaliseMessage('Row 12 of "Class 10-A" failed for 3f1c2a44-1111-2222-3333-444455556666'), 'Row # of "…" failed for :id');
  const a = fingerprintOf({ source: 'server', kind: 'logged', message: '[attendance] insert failed: row 17', route: '/api/admin/attendance' });
  const b = fingerprintOf({ source: 'server', kind: 'logged', message: '[attendance] insert failed: row 942', route: '/api/admin/attendance' });
  const c = fingerprintOf({ source: 'server', kind: 'logged', message: '[attendance] update failed: row 17', route: '/api/admin/attendance' });
  const d = fingerprintOf({ source: 'client', kind: 'logged', message: '[attendance] insert failed: row 17', route: '/api/admin/attendance' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(a.length, 16);
  assert.equal(hash('x'), hash('x'));
});

test('the top frame is our code, without line numbers', () => {
  const stack = `TypeError: x is undefined
    at Object.fn (/var/task/node_modules/react/index.js:10:5)
    at loadDesk (/var/task/.next/server/chunks/desk.js:120:33)
    at main (/var/task/.next/server/app.js:1:1)`;
  assert.equal(topFrame(stack), 'at loadDesk (/var/task/.next/server/chunks/desk.js');
  assert.equal(topFrame(null), '');
});

test('browser noise is dropped', () => {
  assert.ok(isNoise({ message: 'Script error.' }));
  assert.ok(isNoise({ message: 'ResizeObserver loop completed with undelivered notifications.' }));
  assert.ok(isNoise({ message: 'x', stack: 'at chrome-extension://abc/content.js:1:1' }));
  assert.ok(!isNoise({ message: "Cannot read properties of undefined (reading 'map')" }));
});
