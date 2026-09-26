import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Access, activeGrants, PERMS, ROLES, ROLE_KEYS } from './rbac';

test('role catalogue matches the database seed', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260924140000_admin_rbac.sql'), 'utf8');
  const seed = sql.slice(sql.indexOf('INSERT INTO public.role_permissions'), sql.indexOf(') AS t(r, ps)'));
  const rows = [...seed.matchAll(/\('(\w+)', ARRAY\[([^\]]*)\]\)/g)];
  const db: Record<string, string[]> = Object.fromEntries(rows.map(m => [m[1], m[2].match(/'([^']+)'/g)!.map(s => s.slice(1, -1))]));
  // Permissions added to the catalogue by later migrations (INSERT … ON CONFLICT DO NOTHING).
  const later = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260925180000_parent_connect.sql'), 'utf8');
  const add = later.slice(later.indexOf('INSERT INTO public.role_permissions'), later.indexOf('ON CONFLICT DO NOTHING'));
  for (const m of add.matchAll(/\('(\w+)', ARRAY\[([^\]]*)\]\)/g)) db[m[1]] = [...(db[m[1]] || []), ...m[2].match(/'([^']+)'/g)!.map(s => s.slice(1, -1))];
  for (const k of Object.keys(db)) db[k] = [...new Set(db[k])].sort();
  assert.deepEqual(Object.keys(db).sort(), [...ROLE_KEYS].sort());
  for (const r of ROLE_KEYS) assert.deepEqual(db[r], [...ROLES[r].perms].sort(), `role ${r}`);
  for (const ps of Object.values(db)) for (const p of ps) assert.ok(p in PERMS, `unknown perm ${p}`);
  // The CHECK constraint on role_grants lists the same roles.
  const check = sql.match(/role_key\s+text NOT NULL CHECK \(role_key IN \(([^)]*)\)\)/)![1];
  assert.deepEqual(check.match(/'([^']+)'/g)!.map(s => s.slice(1, -1)).sort(), [...ROLE_KEYS].sort());
});

test('separation of duties is built into the roles', () => {
  assert.ok(!ROLES.accountant.perms.includes('fees.concession.approve'), 'accountant requests, does not approve');
  assert.ok(!ROLES.accountant.perms.includes('fees.void'));
  assert.ok(!ROLES.cashier.perms.includes('fees.dayclose'), 'cashier does not close their own day');
  assert.ok(!ROLES.principal.perms.includes('access.manage'));
  assert.ok(!ROLES.counsellor.perms.includes('fees.read'));
  assert.ok(!ROLES.finance_head.perms.includes('wellness.read'));
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
