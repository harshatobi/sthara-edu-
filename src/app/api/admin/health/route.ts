import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { healthBoard, healthSettings, saveRetention } from '@/lib/students/healthServer';
import { decideRequest, pendingRequests } from '@/lib/students/family';

export const dynamic = 'force-dynamic';

/**
 * Admin › Health (health.read): every current student with alerts, special needs and consent, the parents' requested
 * changes, and the retention setting.
 *   POST (health.manage) { action: 'retention', days } | { action: 'decide', id, approve, note }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'health.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  try {
    const { data: school } = await db.from('schools').select('settings').eq('id', admin.schoolId).maybeSingle();
    const [board, settings, requests] = await Promise.all([healthBoard(db, admin.schoolId, school?.settings), healthSettings(db, admin.schoolId), pendingRequests(db, admin.schoolId, ['health'])]);
    return NextResponse.json({ ...board, settings, requests, can: { manage: admin.access.can('health.manage') } });
  } catch (e) {
    console.error('[admin/health]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the health records.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'health.manage');
  if ('res' in auth) return auth.res;
  const d = deny(auth.admin, 'health.manage'); if (d) return d;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: auth.admin.id, schoolId: auth.admin.schoolId };
  const out = b.action === 'retention' ? await saveRetention(auth.db, a, b.days)
    : b.action === 'decide' ? (isUuid(b.id) ? await decideRequest(auth.db, a, b.id, b.approve === true, str(b.note, 300), ['health']) : { ok: false as const, error: 'Request not found', status: 404 })
      : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
