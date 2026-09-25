import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'contacted', 'qualified', 'closed', 'spam'];

/** GET /api/ops/enquiries — website enquiries, newest first (operators only; 404 for everyone else). */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { data, error } = await createAdminClient().from('enquiries')
    .select('id, name, email, school, role, phone, message, source_origin, status, note, handled_by, created_at, updated_at')
    .order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** PATCH /api/ops/enquiries — { id, status?, note? } */
export async function PATCH(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: 'Pick an enquiry.' }, { status: 400 });
  const patch: Record<string, unknown> = { handled_by: op.id };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
    patch.status = b.status;
  }
  if (b.note !== undefined) patch.note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) || null : null;
  const { error } = await createAdminClient().from('enquiries').update(patch).eq('id', b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
