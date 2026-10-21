import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { IMPORT_ROLES, recordAccess, requireGrant } from '@/lib/ops/access';
import { actionResponse, jobResponse } from '@/lib/import/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; jobId: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/** One import's detail names rows of the school's data, so it needs the import window too. */
async function gate(req: NextRequest, id: string) {
  const op = await operatorFor(req, 'schools.manage', id);
  if (op instanceof Response) return op;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  if (!IMPORT_ROLES.includes(op.role)) return NextResponse.json({ error: 'Only a director can import for a school.' }, { status: 403 });
  const db = createAdminClient();
  const g = await requireGrant(db, op.id, id, 'import');
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return { op, db, grant: g.grant };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, jobId } = await params;
  const g = await gate(req, id);
  if (g instanceof Response) return g;
  return jobResponse(g.db, id, jobId);
}

/** POST { action: 'uploaded' | 'commit' | 'undo' | 'cancel' }. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, jobId } = await params;
  const g = await gate(req, id);
  if (g instanceof Response) return g;
  const body = await req.json().catch(() => null);
  const res = await actionResponse(g.db, { kind: 'operator', id: g.op.id, name: `Sthara (${g.op.email})`, schoolId: id, grantId: g.grant.id }, jobId, body);
  if (res.ok) await recordAccess(g.db, g.grant.id, `import.${String((body as { action?: unknown } | null)?.action ?? '').slice(0, 20)}`, `import_jobs/${jobId}`);
  return res;
}
