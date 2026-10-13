import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { endGrant, openGrant } from '@/lib/ops/access';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/ops/schools/:id/access — { reason, caseRef?, scope? }: open a 30-minute, read-only window onto the
 * school's own records. The school's administrators see who opened it and why.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'breakglass', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const out = await openGrant(db, op, id, await req.json().catch(() => ({})));
  return out.ok ? NextResponse.json({ ok: true, grant: out.grant }) : NextResponse.json({ error: out.error }, { status: out.status });
}

/** DELETE /api/ops/schools/:id/access — { grantId }: end a window before its time. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'breakglass', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(id) || typeof b.grantId !== 'string' || !UUID.test(b.grantId)) return NextResponse.json({ error: 'Pick a window.' }, { status: 400 });
  const out = await endGrant(createAdminClient(), op, id, b.grantId);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
}
