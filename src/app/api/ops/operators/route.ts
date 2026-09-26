import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/operators — every account that can open this console
 * (users.role = 'superadmin' or listed in public.superadmins), with sign-in activity.
 * Read-only: granting operator access stays a deliberate database change.
 */
export async function GET(req: NextRequest) {
  const me = await operatorFromRequest(req);
  if (!me) return notFoundResponse();
  const db = createAdminClient();
  const [{ data: byRole }, { data: listed }] = await Promise.all([
    db.from('users').select('id, name, email, created_at').eq('role', 'superadmin'),
    db.from('superadmins').select('user_id'),
  ]);
  const ids = [...new Set([...(byRole || []).map(u => u.id), ...(listed || []).map(l => l.user_id)])];
  const profiles = new Map((byRole || []).map(u => [u.id, u]));
  const missing = ids.filter(id => !profiles.has(id));
  if (missing.length) {
    const { data } = await db.from('users').select('id, name, email, created_at').in('id', missing);
    for (const u of data || []) profiles.set(u.id, u);
  }
  const listedSet = new Set((listed || []).map(l => l.user_id));
  const roleSet = new Set((byRole || []).map(u => u.id));
  const rows = await Promise.all(ids.map(async id => {
    const { data } = await db.auth.admin.getUserById(id);
    const p = profiles.get(id);
    return {
      id,
      name: p?.name ?? null,
      email: data.user?.email ?? p?.email ?? null,
      grantedBy: [roleSet.has(id) && 'users.role', listedSet.has(id) && 'superadmins table'].filter(Boolean) as string[],
      lastSignIn: data.user?.last_sign_in_at ?? null,
      createdAt: data.user?.created_at ?? p?.created_at ?? null,
      mfa: (data.user?.factors ?? []).some(f => f.status === 'verified'),
      banned: !!(data.user as { banned_until?: string | null } | null)?.banned_until,
      you: id === me.id,
    };
  }));
  return NextResponse.json({ operators: rows.sort((a, b) => (b.lastSignIn ?? '').localeCompare(a.lastSignIn ?? '')) });
}
