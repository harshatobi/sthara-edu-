import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { runJob } from '@/lib/debug/jobs';

export const dynamic = 'force-dynamic';

/**
 * The no-show check for every school, for a scheduler to call every 15 minutes on school mornings.
 *   GET/POST  Authorization: Bearer <CRON_SECRET>
 * Scheduling (pending setup): Vercel Cron needs a Pro plan for more than one run a day; alternatively Supabase
 * pg_cron + pg_net can call this URL. Until one is set up, the check runs whenever someone opens the cover board
 * or the attendance board, so alerts still go out once the office is in.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const run = await runJob(createAdminClient(), 'attendance-noshow', 'schedule');
  return NextResponse.json({ ok: run.ok, ...run.detail });
}
export const GET = handle;
export const POST = handle;
