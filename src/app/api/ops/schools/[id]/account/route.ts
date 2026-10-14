import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { activeGrant, grantsForSchool } from '@/lib/ops/access';
import { loadOperators, placeSchool } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { loadTerritories } from '@/lib/ops/scope';
import { territoryPath } from '@/lib/ops/territories';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/schools/:id/account — where the school sits (state, district, territory), who owns it,
 * and its break-glass history: every window opened on its records, and the caller's open one.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'schools.read', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const db = createAdminClient();
  const [{ data: a }, territories, ops, grants, mine] = await Promise.all([
    db.from('ops_accounts').select('state, district, territory_id, owner_id, updated_at').eq('school_id', id).maybeSingle(),
    loadTerritories(db), loadOperators(db), grantsForSchool(db, id, 50), activeGrant(db, op.id, id),
  ]);
  const active = ops.filter(o => o.active);
  const { data: names } = active.length ? await db.from('users').select('id, name, email').in('id', active.map(o => o.id)) : { data: [] };
  const nameOf = new Map((names || []).map(u => [u.id as string, (u.name || u.email) as string]));
  return NextResponse.json({
    account: {
      state: a?.state ?? null, district: a?.district ?? null, territoryId: a?.territory_id ?? null,
      territory: a?.territory_id ? territoryPath(territories, a.territory_id) : null,
      ownerId: a?.owner_id ?? null, owner: a?.owner_id ? nameOf.get(a.owner_id) ?? 'Former operator' : null, updatedAt: a?.updated_at ?? null,
    },
    owners: active.map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    grants,
    myGrant: mine,
    can: { assign: can(op.role, 'assign'), breakglass: can(op.role, 'breakglass') },
  });
}

/** PATCH /api/ops/schools/:id/account — { state?, district?, ownerId?, reason }. The territory follows the address. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'assign', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the audit log.' }, { status: 400 });
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const out = await placeSchool(db, op, id, b, reason);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
}
