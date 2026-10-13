import 'server-only';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformSettings } from '@/lib/settings/server';
import { REQ_METHOD, REQ_PATH, REQ_START, routeOf } from './route';

/**
 * The request log behind the Platform Manager's request explorer.
 *
 * The proxy stamps each /api request with its path, method and start time; the auth helpers call noteRequest()
 * once they know who is asking; the row is written after the response has gone, so its duration is the whole
 * request and logging never slows or breaks the request it measures. Unauthenticated requests are not logged.
 */
const seen = new WeakSet<object>();

export async function noteRequest(who: { userId: string; role?: string | null; schoolId?: string | null }) {
  try {
    const h = await headers();
    // One row per request, however many times a route checks the caller.
    if (seen.has(h)) return;
    seen.add(h);
    const path = h.get(REQ_PATH), start = Number(h.get(REQ_START));
    if (!path || !Number.isFinite(start) || start <= 0) return;
    if (!(await getPlatformSettings())['debug.request_log']) return;
    const row = {
      method: (h.get(REQ_METHOD) || 'GET').slice(0, 10), route: routeOf(path),
      user_id: who.userId, user_role: who.role ?? null, school_id: who.schoolId ?? null,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    };
    after(async () => {
      try {
        const { error } = await createAdminClient().from('request_log').insert({ ...row, duration_ms: Math.max(0, Date.now() - start) });
        // No table on a database older than the ops_debug migration: nothing to do.
        if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.warn('[request log]', error.message);
      } catch { /* never let logging surface */ }
    });
  } catch { /* outside a request, or no request store: nothing to log */ }
}
