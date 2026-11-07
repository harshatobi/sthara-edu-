import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { todayFor } from '@/lib/admin/todayServer';

export const dynamic = 'force-dynamic';

/** GET: what is waiting today for this office account's roles, and today's registers (lib/admin/todayServer). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;
  try {
    return NextResponse.json(await todayFor(auth.db, auth.admin));
  } catch (e) {
    console.error('[admin today]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load today.' }, { status: 500 });
  }
}
