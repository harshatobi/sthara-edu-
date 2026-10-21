import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Access, activeGrants, PERMS, ROLES, ROLE_KEYS } from './rbac';

test('role catalogue matches the database seed', () => {
  // The baseline migration carries the catalogue as dumped from the database, one (role_key, perm) row per line.
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const sql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('_baseline.sql'))!), 'utf8');
  const start = sql.indexOf('INSERT INTO public.role_permissions');
  const seed = sql.slice(start, sql.indexOf(';\n', start));
  const db: Record<string, string[]> = {};
  for (const m of seed.matchAll(/\('(\w+)', '([^']+)'\)/g)) (db[m[1]] ||= []).push(m[2]);
  for (const k of Object.keys(db)) db[k] = [...new Set(db[k])].sort();
  assert.deepEqual(Object.keys(db).sort(), [...ROLE_KEYS].sort());
  for (const r of ROLE_KEYS) assert.deepEqual(db[r], [...ROLES[r].perms].sort(), `role ${r}`);
  for (const ps of Object.values(db)) for (const p of ps) assert.ok(p in PERMS, `unknown perm ${p}`);
  // The CHECK constraint on role_grants lists the same roles.
  const check = sql.match(/"role_grants_role_key_check" CHECK \(\("role_key" = ANY \(ARRAY\[([^\]]*)\]\)\)\)/)![1];
  assert.deepEqual(check.match(/'([^']+)'/g)!.map(s => s.slice(1, -1)).sort(), [...ROLE_KEYS].sort());
});

test('separation of duties is built into the roles', () => {
  assert.ok(!ROLES.accountant.perms.includes('fees.concession.approve'), 'accountant requests, does not approve');
  assert.ok(!ROLES.accountant.perms.includes('fees.void'));
  assert.ok(!ROLES.cashier.perms.includes('fees.dayclose'), 'cashier does not close their own day');
  assert.ok(!ROLES.principal.perms.includes('access.manage'));
  assert.ok(!ROLES.counsellor.perms.includes('fees.read'));
  assert.ok(!ROLES.finance_head.perms.includes('wellness.read'));
  // Ask the School OS about the whole school is for leadership only.
  assert.deepEqual(ROLE_KEYS.filter(r => ROLES[r].perms.includes('os.ask')).sort(), ['principal', 'school_admin', 'vice_principal']);
  // A student's safety disclosure reaches the counsellor and the principal, no one else.
  assert.deepEqual(ROLE_KEYS.filter(r => ROLES[r].perms.includes('safeguarding.read')).sort(), ['counsellor', 'principal', 'school_admin']);
  // Payroll: the roles that prepare a run are not the ones that only approve it.
  assert.ok(!ROLES.finance_head.perms.includes('payroll.prepare') && !ROLES.accountant.perms.includes('payroll.approve') && !ROLES.hr_manager.perms.includes('payroll.approve'));
  assert.ok(!ROLES.cashier.perms.includes('payroll.read') && !ROLES.vice_principal.perms.includes('payroll.read'));
  // Exams: the exam cell runs marks entry; only the principal (and school admin) publish report cards.
  assert.deepEqual(ROLE_KEYS.filter(r => ROLES[r].perms.includes('exams.publish')).sort(), ['principal', 'school_admin']);
  assert.ok(ROLES.academic_coordinator.perms.includes('exams.manage'));
  // Staff bank, PAN and personal details: HR and the heads of the school, nobody else who can merely see the workforce.
  assert.deepEqual(ROLE_KEYS.filter(r => ROLES[r].perms.includes('hr.sensitive')).sort(), ['hr_manager', 'principal', 'school_admin']);
});

test('access is the union of active roles', () => {
  const a = new Access(['cashier', 'counsellor']);
  assert.ok(a.can('fees.collect') && a.can('wellness.read'));
  assert.ok(!a.can('fees.void'));
  assert.equal(a.label, 'Cashier, Counsellor');
  assert.ok(new Access([], true).can('access.manage'));
  const g = activeGrants([
    { id: '1', user_id: 'u', role_key: 'cashier', revoked_at: null, expires_on: null },
    { id: '2', user_id: 'u', role_key: 'principal', revoked_at: '2026-01-01', expires_on: null },
    { id: '3', user_id: 'u', role_key: 'hr_manager', revoked_at: null, expires_on: '2026-09-23' },
    { id: '4', user_id: 'u', role_key: 'dpo', revoked_at: null, expires_on: '2026-09-24' },
  ], '2026-09-24');
  assert.deepEqual(g.map(x => x.role), ['cashier', 'dpo']);
});
