import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { addOperator, createOperatorLogin, loadOperators, resetOperatorPassword, updateOperator } from '@/lib/ops/org';
import { tempPassword } from '@/lib/ops/people';
import { can } from '@/lib/ops/roles';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noReason = () => NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the audit log.' }, { status: 400 });

/**
 * GET /api/ops/operators — everyone who can open this console: role, reporting line, territories and sign-in activity.
 * Directors come from users.role = 'superadmin' / public.superadmins; every other role from public.ops_operators.
 */
export async function GET(req: NextRequest) {
  const me = await operatorFor(req, 'operators.read');
  if (me instanceof Response) return me;
  const db = createAdminClient();
  const [ops, { data: byRole }, { data: listed }, { data: members }] = await Promise.all([
    loadOperators(db),
    db.from('users').select('id').eq('role', 'superadmin'),
    db.from('superadmins').select('user_id'),
    db.from('ops_territory_members').select('territory_id, operator_id'),
  ]);
  const superadmins = new Set([...(byRole || []).map(u => u.id as string), ...(listed || []).map(l => l.user_id as string)]);
  const rowOf = new Map(ops.map(o => [o.id, o]));
  const ids = [...new Set([...superadmins, ...ops.map(o => o.id)])];
  const { data: profiles } = ids.length ? await db.from('users').select('id, name, email, created_at').in('id', ids) : { data: [] };
  const profile = new Map((profiles || []).map(u => [u.id, u]));
  const territoriesOf = new Map<string, string[]>();
  for (const m of members || []) territoriesOf.set(m.operator_id, [...(territoriesOf.get(m.operator_id) ?? []), m.territory_id]);

  const rows = await Promise.all(ids.map(async id => {
    const { data } = await db.auth.admin.getUserById(id);
    const p = profile.get(id), o = rowOf.get(id);
    // A superadmin with no row yet is a director; a director row without superadmin rights grants nothing.
    const role = o?.role ?? 'director';
    return {
      id,
      name: p?.name ?? null,
      email: data.user?.email ?? p?.email ?? null,
      role,
      title: o?.title ?? null,
      managerId: o?.managerId ?? null,
      territoryIds: territoriesOf.get(id) ?? [],
      active: (o?.active ?? true) && !(role === 'director' && !superadmins.has(id)),
      lastSignIn: data.user?.last_sign_in_at ?? null,
      createdAt: o?.createdAt ?? data.user?.created_at ?? p?.created_at ?? null,
      mfa: (data.user?.factors ?? []).some(f => f.status === 'verified'),
      banned: !!(data.user as { banned_until?: string | null } | null)?.banned_until,
      you: id === me.id,
    };
  }));
  return NextResponse.json({
    operators: rows.sort((a, b) => Number(b.active) - Number(a.active) || (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '')),
    canManage: can(me.role, 'operators.manage'),
  });
}

/**
 * POST /api/ops/operators — { email, name?, createLogin?, role, managerId?, title?, territoryIds?, reason }
 * Makes an account an operator. With createLogin, the Sthara login is created first and its temporary password
 * comes back once. Director is never given here.
 *
 * POST { action: 'reset-password', id, reason } gives an operator (never the director) a new temporary password,
 * returned once.
 */
export async function POST(req: NextRequest) {
  const me = await operatorFor(req, 'operators.manage');
  if (me instanceof Response) return me;
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return noReason();
  if (b.action === 'reset-password') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick an operator.' }, { status: 400 });
    const temp = tempPassword(randomInt);
    const out = await resetOperatorPassword(createAdminClient(), me, b.id, temp, reason);
    return out.ok ? NextResponse.json({ ok: true, email: out.email, tempPassword: temp }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ error: 'Enter the operator’s email.' }, { status: 400 });
  const db = createAdminClient();
  let password: string | null = null, created: string | null = null;
  if (b.createLogin === true) {
    const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (name.length < 2) return NextResponse.json({ error: 'Enter the operator’s name.' }, { status: 400 });
    password = tempPassword(randomInt);
    const made = await createOperatorLogin(db, email, name, password);
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
    created = made.id;
  }
  const out = await addOperator(db, me, email, b, reason);
  if (!out.ok) {
    // Nothing half-made: a login created a moment ago for an operator that was then refused is removed again.
    if (created) { await db.from('users').delete().eq('id', created); await db.auth.admin.deleteUser(created); }
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ ok: true, id: out.id, tempPassword: password });
}

/** PATCH /api/ops/operators — { id, role?, managerId?, title?, territoryIds?, active?, reason } */
export async function PATCH(req: NextRequest) {
  const me = await operatorFor(req, 'operators.manage');
  if (me instanceof Response) return me;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return NextResponse.json({ error: 'Pick an operator.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return noReason();
  const out = await updateOperator(createAdminClient(), me, b.id, b, reason);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
}
