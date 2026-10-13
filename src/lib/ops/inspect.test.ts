import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN, INSPECT_GROUPS, INSPECT_TABLES, isInspectable, isSecretField, maskRow, summarise } from './inspect';

test('wellbeing, pay and Sthara\'s own tables are not in the catalogue', () => {
  for (const t of ['wellness_logs', 'incidents', 'staff_statutory', 'staff_salaries', 'pay_run_lines', 'tutor_sessions', 'ops_access_grants', 'audit_log', 'whatsapp_links']) {
    assert.equal(isInspectable(t), false, t);
  }
  assert.ok(isInspectable('fee_invoices') && isInspectable('users'));
  assert.equal(isInspectable('__proto__'), false);
  for (const t of Object.values(INSPECT_TABLES)) assert.ok(INSPECT_GROUPS.includes(t.group));
});

test('secret fields are blanked at any depth; ordinary ones are left alone', () => {
  for (const f of ['password', 'otp_hash', 'token_hash', 'bank_account', 'bank_ifsc', 'aadhaar_last4', 'pan', 'employer_pan', 'uan', 'mustChangePassword']) assert.ok(isSecretField(f), f);
  for (const f of ['name', 'company', 'span', 'expand', 'input_tokens', 'quantity']) assert.equal(isSecretField(f), false, f);
  const out = maskRow({ id: '1', name: 'A', metadata: { tempPassword: 'x1', nested: [{ bank_account: '123', ok: 1 }] }, pan: null, otp_hash: '' });
  assert.deepEqual(out, { id: '1', name: 'A', metadata: { tempPassword: HIDDEN, nested: [{ bank_account: HIDDEN, ok: 1 }] }, pan: null, otp_hash: '' });
});

test('a row is summarised by its most telling fields and its time', () => {
  const s = summarise({ id: 'abcdef12-0000', subject: 'Mathematics', type: 'homework', status: 'published', created_at: '2026-10-01T10:00:00Z', settings: { a: 1 } });
  assert.equal(s.title, 'Mathematics');
  assert.deepEqual(s.facts, ['type: homework', 'status: published']);
  assert.equal(s.when, '2026-10-01T10:00:00Z');
  assert.equal(summarise({ id: 'abcdef12-0000', amount: 5 }).title, 'abcdef12');
  assert.equal(summarise({ id: 'x', name: 'n'.repeat(200) }).title.length, 80);
});
