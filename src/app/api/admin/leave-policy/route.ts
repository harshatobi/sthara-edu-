import { NextResponse, type NextRequest } from 'next/server';
import { bad, requireAdmin } from '@/lib/admin/serverAuth';
import { isSession, sessionOf } from '@/lib/admin/format';
import { BALANCE_TYPES } from '@/lib/admin/leave';

export const dynamic = 'force-dynamic';

/**
 * Leave entitlements for a session (leave.policy).
 *   PUT { session?, days: { casual: 12, sick: 10, ... } }   a blank or missing type removes its cap
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'leave.policy');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b?.days || typeof b.days !== 'object') return bad('Invalid request.');
  const session = isSession(b.session) ? b.session : sessionOf();
  const rows = [];
  const remove: string[] = [];
  for (const t of BALANCE_TYPES) {
    const v = b.days[t];
    if (v === '' || v === null || v === undefined) { remove.push(t); continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 2) !== n * 2) return bad('Days must be between 0 and 366, in half days.');
    rows.push({ school_id: admin.schoolId, session, leave_type: t, days_per_year: n, updated_by: admin.id });
  }
  if (rows.length) {
    const { error } = await db.from('leave_policies').upsert(rows, { onConflict: 'school_id,session,leave_type' });
    if (error) return bad(error.message, 500);
  }
  if (remove.length) await db.from('leave_policies').delete().eq('school_id', admin.schoolId).eq('session', session).in('leave_type', remove);
  return NextResponse.json({ ok: true });
}
