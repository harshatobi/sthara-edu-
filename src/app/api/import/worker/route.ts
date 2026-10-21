import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runWorker } from '@/lib/import/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/import/worker — moves waiting bulk imports one step. Called once a minute by pg_cron + pg_net while a
 * job waits (see the bulk_import migration), with the shared secret in x-worker-secret (IMPORT_WORKER_SECRET).
 * Requests from the app kick the worker in-process instead, so imports run even before the secret is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.IMPORT_WORKER_SECRET || '';
  const got = req.headers.get('x-worker-secret') || '';
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const touched = await runWorker(createAdminClient());
  return NextResponse.json({ ok: true, touched });
}
