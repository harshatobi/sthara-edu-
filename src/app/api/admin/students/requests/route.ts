import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { decideRequest, pendingRequests } from '@/lib/students/family';

export const dynamic = 'force-dynamic';

/**
 * Changes parents propose to family and contact details.
 *   GET                               the school's pending requests, oldest first (students.read)
 *   POST { id, approve, note }        apply or reject (students.manage); a rejection needs a note for the parent
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'students.read');
  if ('res' in auth) return auth.res;
  try {
    return NextResponse.json({ requests: await pendingRequests(auth.db, auth.admin.schoolId, ['address', 'family', 'emergency']), can: { manage: auth.admin.access.can('students.manage') } });
  } catch (e) {
    console.error('[admin/students/requests]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the requests.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'students.manage');
  if ('res' in auth) return auth.res;
  const d = deny(auth.admin, 'students.manage'); if (d) return d;
  const b = (await req.json().catch(() => null)) || {};
  if (!isUuid(b.id)) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  const out = await decideRequest(auth.db, { id: auth.admin.id, schoolId: auth.admin.schoolId }, b.id, b.approve === true, str(b.note, 300), ['address', 'family', 'emergency']);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
