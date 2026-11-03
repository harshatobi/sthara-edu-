import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { flushPayOutbox } from '@/lib/pay/server';

export const dynamic = 'force-dynamic';

/** Sends counter receipts still waiting for Pay. For a scheduler. Authorization: Bearer <CRON_SECRET> */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await flushPayOutbox(createAdminClient()));
}
export const GET = handle;
export const POST = handle;
