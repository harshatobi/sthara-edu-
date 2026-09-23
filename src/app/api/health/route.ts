import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Uptime/availability probe for external monitoring (Vercel, UptimeRobot,
 * a status page, etc). Checks the app server itself plus a lightweight
 * Supabase round-trip, so a paused/unreachable database shows up here
 * instead of only surfacing as scattered "Failed to fetch" errors downstream.
 */
export async function GET() {
  const startedAt = Date.now();
  let database: 'ok' | 'unreachable' = 'unreachable';
  let dbError: string | undefined;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('schools').select('id', { count: 'exact', head: true }).limit(1);
    if (error) throw error;
    database = 'ok';
  } catch (err: any) {
    dbError = err?.message || 'Unknown database error';
  }

  const healthy = database === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      ...(dbError ? { databaseError: dbError } : {}),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
