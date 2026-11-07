import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { isUuid } from '@/lib/admin/serverAuth';
import { backfillStudentHistory } from '@/lib/tml/backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BATCH = 60;

/**
 * POST /api/ops/tml-backfill   { schoolId, offset?, limit?, dry? }
 * Rebuilds TML history (weekly trends) for one batch of a school's students, in id order, so a caller can walk the
 * whole school a batch at a time: the reply carries `next` (the offset to send next) until it is null.
 * Operators with support fixes (schools.manage) in that school only. The service key never leaves the server.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const schoolId = body?.schoolId;
  if (!isUuid(schoolId)) return NextResponse.json({ error: 'Pick a school.' }, { status: 400 });
  const op = await operatorFor(req, 'schools.manage', schoolId);
  if (op instanceof Response) return op;
  const offset = Math.max(0, Math.floor(Number(body?.offset) || 0));
  const limit = Math.min(MAX_BATCH, Math.max(1, Math.floor(Number(body?.limit) || 30)));
  const dry = body?.dry === true;
  const db = createAdminClient();
  const { count, error: cErr } = await db.from('users').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'student');
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const { data: batch, error } = await db.from('users').select('id').eq('school_id', schoolId).eq('role', 'student').order('id').range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let rows = 0;
  const failed: string[] = [];
  const queue = [...(batch ?? [])];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try { const n = await backfillStudentHistory(db, s.id, dry); rows += n; } catch (e) {
        failed.push(s.id);
        console.error('[tml backfill]', s.id, e instanceof Error ? e.message : e);
      }
    }
  }));
  const processed = batch?.length ?? 0;
  const next = offset + processed < (count ?? 0) && processed > 0 ? offset + processed : null;
  console.info('[tml backfill]', { operator: op.email, schoolId, offset, processed, rows, failed: failed.length, dry });
  return NextResponse.json({ total: count ?? 0, offset, processed, rows, failed, next, dry });
}
