import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadOperators, removeTerritory, saveTerritory } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { loadAccounts, loadSight, loadTerritories } from '@/lib/ops/scope';
import { sees } from '@/lib/ops/territories';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const noReason = () => NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the audit log.' }, { status: 400 });

/**
 * GET /api/ops/territories — the territory tree with who works each one and how many schools and open
 * enquiries sit in it, plus the active operators (for owner pickers). Any operator: the counts only cover
 * what that operator can see.
 */
export async function GET(req: NextRequest) {
  const me = await operatorFor(req, null);
  if (me instanceof Response) return me;
  const db = createAdminClient();
  const [territories, accounts, ops, sight, { data: members }, { data: enquiries }] = await Promise.all([
    loadTerritories(db), loadAccounts(db), loadOperators(db), loadSight(db, me),
    db.from('ops_territory_members').select('territory_id, operator_id'),
    db.from('enquiries').select('territory_id, owner_id, status').in('status', ['new', 'contacted', 'qualified']),
  ]);
  const active = ops.filter(o => o.active);
  const { data: names } = active.length ? await db.from('users').select('id, name, email').in('id', active.map(o => o.id)) : { data: [] };
  const nameOf = new Map((names || []).map(u => [u.id as string, (u.name || u.email) as string]));
  const schools = new Map<string, number>(), leads = new Map<string, number>();
  for (const a of accounts.values()) if (a.territoryId && sees(sight, a)) schools.set(a.territoryId, (schools.get(a.territoryId) ?? 0) + 1);
  for (const e of enquiries || []) {
    if (e.territory_id && sees(sight, { territoryId: e.territory_id, ownerId: e.owner_id })) leads.set(e.territory_id, (leads.get(e.territory_id) ?? 0) + 1);
  }
  const membersOf = new Map<string, string[]>();
  for (const m of members || []) membersOf.set(m.territory_id, [...(membersOf.get(m.territory_id) ?? []), m.operator_id]);
  return NextResponse.json({
    territories: territories.map(t => ({ ...t, memberIds: membersOf.get(t.id) ?? [], schools: schools.get(t.id) ?? 0, enquiries: leads.get(t.id) ?? 0 })),
    operators: active.map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    unplacedSchools: sight.all ? [...accounts.values()].filter(a => !a.territoryId).length : 0,
    canManage: can(me.role, 'operators.manage'),
  });
}

/** POST /api/ops/territories — { level, name?, parentId?, state?, district?, defaultOwnerId?, reason } */
export async function POST(req: NextRequest) {
  const me = await operatorFor(req, 'operators.manage');
  if (me instanceof Response) return me;
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return noReason();
  const out = await saveTerritory(createAdminClient(), me, null, b, reason);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}

/** PATCH /api/ops/territories — { id, name?, parentId?, defaultOwnerId?, reason }. Level, state and district are fixed once made. */
export async function PATCH(req: NextRequest) {
  const me = await operatorFor(req, 'operators.manage');
  if (me instanceof Response) return me;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick a territory.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return noReason();
  const out = await saveTerritory(createAdminClient(), me, b.id, b, reason);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}

/** DELETE /api/ops/territories — { id, reason }. Regions and districts only, and only when nothing sits beneath. */
export async function DELETE(req: NextRequest) {
  const me = await operatorFor(req, 'operators.manage');
  if (me instanceof Response) return me;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick a territory.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return noReason();
  const out = await removeTerritory(createAdminClient(), me, b.id, reason);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
