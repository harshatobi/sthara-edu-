import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { runJob } from '@/lib/debug/jobs';

export const dynamic = 'force-dynamic';

/**
 * Hands out the Studio retention checks that are due, for a scheduler to call each school morning.
 *   GET/POST  Authorization: Bearer <CRON_SECRET>
 * Scheduling (pending setup): once a day fits Vercel Cron on any plan, or Supabase pg_cron + pg_net can call this URL.
 * Until one is set up, a teacher's due checks are handed out when they open the Studio.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const run = await runJob(createAdminClient(), 'studio-retention', 'schedule');
  return NextResponse.json({ ok: run.ok, ...run.detail });
}
export const GET = handle;
export const POST = handle;
