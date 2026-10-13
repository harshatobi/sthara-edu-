import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadOperators, resolvePlacement } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { loadSight, loadTerritories } from '@/lib/ops/scope';
import { sees, territoryPath } from '@/lib/ops/territories';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'contacted', 'qualified', 'closed', 'spam'];

/**
 * GET /api/ops/enquiries — website enquiries, newest first, with their territory and owner.
 * Operators who work a territory get the enquiries placed in it (or owned by them or their reports);
 * enquiries nobody has placed yet reach only the roles that see everything.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'enquiries.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const base = 'id, name, email, school, role, phone, designation, city, student_count, board, improvement_goal, message, source_origin, status, note, handled_by, created_at, updated_at';
  let { data, error } = await db.from('enquiries').select(`${base}, state, district, territory_id, owner_id`).order('created_at', { ascending: false }).limit(500);
  // A database older than the ops_foundation migration has no placement columns yet.
  if (error?.code === '42703') ({ data, error } = await db.from('enquiries').select(base).order('created_at', { ascending: false }).limit(500) as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [sight, territories, ops] = await Promise.all([loadSight(db, op), loadTerritories(db), loadOperators(db)]);
  const { data: names } = ops.length ? await db.from('users').select('id, name, email').in('id', ops.map(o => o.id)) : { data: [] };
  const nameOf = new Map((names || []).map(u => [u.id as string, (u.name || u.email) as string]));
  return NextResponse.json((data || [])
    .filter(e => sees(sight, { territoryId: e.territory_id ?? null, ownerId: e.owner_id ?? null }))
    .map(e => ({
      ...e,
      state: e.state ?? null, district: e.district ?? null, owner_id: e.owner_id ?? null,
      territory: e.territory_id ? territoryPath(territories, e.territory_id) : null,
      owner: e.owner_id ? nameOf.get(e.owner_id) ?? 'Former operator' : null,
    })));
}

/**
 * PATCH /api/ops/enquiries — { id, status?, note?, state?, district?, ownerId? }
 * The territory follows the address. Picking the owner by hand needs the 'assign' capability;
 * otherwise the territory's default owner takes it.
 */
export async function PATCH(req: NextRequest) {
  const op = await operatorFor(req, 'enquiries.manage');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: 'Pick an enquiry.' }, { status: 400 });
  const db = createAdminClient();
  const placing = b.state !== undefined || b.district !== undefined || b.ownerId !== undefined;
  const { data: cur, error: curErr } = await db.from('enquiries').select(placing ? 'id, state, district, territory_id, owner_id' : 'id').eq('id', b.id).maybeSingle() as
    { data: { id: string; state?: string | null; district?: string | null; territory_id?: string | null; owner_id?: string | null } | null; error: { code?: string; message: string } | null };
  if (curErr?.code === '42703') return NextResponse.json({ error: 'The database is not ready for territories yet (apply the ops_foundation migration).' }, { status: 409 });
  const sight = await loadSight(db, op);
  if (!cur) return NextResponse.json({ error: 'That enquiry no longer exists.' }, { status: 404 });
  if (!sight.all) {
    const { data: at } = await db.from('enquiries').select('territory_id, owner_id').eq('id', b.id).maybeSingle();
    if (!at || !sees(sight, { territoryId: at.territory_id, ownerId: at.owner_id })) return NextResponse.json({ error: 'That enquiry no longer exists.' }, { status: 404 });
  }

  const patch: Record<string, unknown> = { handled_by: op.id };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    patch.status = b.status;
  }
  if (b.note !== undefined) patch.note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) || null : null;
  if (placing) {
    if (b.ownerId !== undefined && !can(op.role, 'assign')) return NextResponse.json({ error: 'Your role cannot pick the owner. Set the address and the territory’s owner takes it.' }, { status: 403 });
    const p = await resolvePlacement(db, { state: b.state, district: b.district, ownerId: b.ownerId },
      { state: cur.state ?? null, district: cur.district ?? null, ownerId: b.state !== undefined || b.district !== undefined ? null : cur.owner_id ?? null });
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
    Object.assign(patch, { state: p.state, district: p.district, territory_id: p.territoryId, owner_id: p.ownerId });
    await db.from('audit_log').insert({
      actor_id: op.id, actor_role: 'operator', action: 'enquiry.placed', table_name: 'enquiries', row_id: b.id, school_id: null,
      new_values: { state: p.state, district: p.district, territoryId: p.territoryId, ownerId: p.ownerId },
    });
  }
  const { error } = await db.from('enquiries').update(patch).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
