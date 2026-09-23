import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { createPeople } from '@/lib/ops/accounts';
import type { PersonInput } from '@/lib/ops/people';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Rows per request, so a large roster never hits the function time limit. The console sends batches. */
const MAX_BATCH = 25;

/**
 * POST /api/ops/schools/:id/people — { people: PersonInput[] }
 * Validates the whole batch first (nothing is created if any row is invalid),
 * then creates accounts and returns each one's temporary password once.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const people: PersonInput[] = Array.isArray(b.people) ? b.people : [];
  if (!people.length) return NextResponse.json({ error: 'No people in the request.' }, { status: 400 });
  if (people.length > MAX_BATCH) return NextResponse.json({ error: `Send at most ${MAX_BATCH} people per request.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: school } = await admin.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const { issues, results } = await createPeople(admin, id, op.id, people);
  if (issues.length) return NextResponse.json({ issues }, { status: 422 });
  return NextResponse.json({ results });
}
