import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toClaudeMessages } from './messages';
import { aiFailure } from './retry';

test('a plain prompt becomes one user message', () => {
  assert.deepEqual(toClaudeMessages('Hello'), [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);
});

test('model turns become assistant turns; same-role turns merge; history starts on the user', () => {
  const out = toClaudeMessages([
    { role: 'model', parts: [{ text: 'Welcome back.' }] },
    { role: 'user', parts: [{ text: 'a' }] },
    { role: 'user', parts: [{ text: 'b' }] },
    { role: 'model', parts: [{ text: 'c' }] },
    { role: 'user', parts: [{ text: '  ' }, { text: 'd' }] },
  ]);
  assert.deepEqual(out.map(m => m.role), ['user', 'assistant', 'user']);
  assert.equal((out[0].content as unknown[]).length, 2);
  assert.equal((out[2].content as unknown[]).length, 1);
});

test('photographed pages become base64 image blocks', () => {
  const [m] = toClaudeMessages([{ role: 'user', parts: [{ text: 'Grade this' }, { inlineData: { data: 'QUJD', mimeType: 'image/jpeg' } }] }]);
  assert.deepEqual((m.content as unknown[])[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
});

test('Claude errors classify like Gemini ones', () => {
  assert.equal(aiFailure(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')), 'busy');
  assert.equal(aiFailure(new Error('429 {"type":"error","error":{"type":"rate_limit_error"}}')), 'quota');
  assert.equal(aiFailure(new Error('400 {"type":"error","error":{"type":"invalid_request_error"}}')), 'other');
});
