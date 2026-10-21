import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { IMPORT_ROLES, recordAccess, requireGrant } from '@/lib/ops/access';
import { createResponse, listResponse } from '@/lib/import/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Bulk import on a school's behalf, for schools that cannot do it themselves.
 *   GET   the school's import history (who, when, which file, counts; no rows)
 *   POST  { dataset, fileName, fileBytes } start an import. Directors only, inside an open 'import' access
 *         window; the school sees the import as done by Sthara, with the operator's name.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const op = await operatorFor(req, 'schools.read', id);
  if (op instanceof Response) return op;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  return listResponse(createAdminClient(), id);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const op = await operatorFor(req, 'schools.manage', id);
  if (op instanceof Response) return op;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  if (!IMPORT_ROLES.includes(op.role)) return NextResponse.json({ error: 'Only a director can import for a school.' }, { status: 403 });
  const db = createAdminClient();
  const g = await requireGrant(db, op.id, id, 'import');
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const res = await createResponse(db, { kind: 'operator', id: op.id, name: `Sthara (${op.email})`, schoolId: id, grantId: g.grant.id }, await req.json().catch(() => null));
  if (res.ok) await recordAccess(db, g.grant.id, 'import.started');
  return res;
}
