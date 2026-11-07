import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminCore } from './loadRows';
import { assembleAdminDesk } from './desk';

/** A stand-in database client that records which tables were read. */
function fakeDb(rows: Record<string, any[]>) {
  const read: string[] = [];
  const query = (table: string) => {
    read.push(table);
    const data = rows[table] ?? [];
    const q: any = {
      select: () => q, eq: () => q, order: () => q,
      range: async () => ({ data, error: null }),
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
    };
    return q;
  };
  return { db: { from: query } as any, read };
}

test('the core load reads only the school and role grants, and still knows what this person may do', async () => {
  const { db, read } = fakeDb({
    schools: [{ id: 's1', name: 'Vidya Niketan', settings: { code: 'VNSS' } }],
    role_grants: [
      { user_id: 'me', role_key: 'principal', granted_at: '2026-04-01', revoked_at: null, expires_on: null },
      { user_id: 'other', role_key: 'accountant', granted_at: '2026-04-01', revoked_at: null, expires_on: null },
    ],
  });
  const rows = await loadAdminCore(db, { schoolId: 's1', uid: 'me', superadmin: false });
  assert.deepEqual([...new Set(read)].sort(), ['role_grants', 'schools']);
  const desk = assembleAdminDesk(rows, Date.parse('2026-11-06T10:00:00Z'), false);
  assert.equal(desk.full, false);
  assert.equal(desk.school.name, 'Vidya Niketan');
  assert.ok(desk.me.access.can('fees.read'), 'the principal’s permissions come from the grants');
  assert.deepEqual(desk.students, []);
});
