import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { featureLabel } from '@/lib/ai/pricing';
import { SINCE, during, isSince } from '@/lib/debug/route';
import { getPlatformSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/traffic?since=15m|1h|6h|24h|7d&school=&user=<id or email>&route=<contains>&minMs=
 * The request explorer: the latest 300 signed-in API requests that match (route, role, school, duration, release),
 * each with the AI calls and logged errors that happened inside it, plus per-route volume and latency for the period.
 * Users appear as ids and roles, never names.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'debug.read');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  const since = isSince(sp.get('since')) ? sp.get('since') as keyof typeof SINCE : '1h';
  const from = new Date(Date.now() - SINCE[since] * 60_000).toISOString();
  const school = UUID.test(sp.get('school') || '') ? sp.get('school')! : null;
  const route = (sp.get('route') || '').replace(/[^a-zA-Z0-9/_:.\-]/g, '').slice(0, 100);
  const minMs = Math.max(0, Math.min(600_000, Number(sp.get('minMs')) || 0));
  const db = createAdminClient();

  let userId: string | null = null;
  const who = (sp.get('user') || '').trim().toLowerCase();
  if (who) {
    if (UUID.test(who)) userId = who;
    else {
      const { data: u } = await db.from('users').select('id').eq('email', who).maybeSingle();
      if (!u) return NextResponse.json({ error: 'No account has that email. Use the full address, or paste the user id.' }, { status: 404 });
      userId = u.id;
    }
  }

  let q = db.from('request_log').select('id, at, method, route, user_id, user_role, school_id, duration_ms, release').gte('at', from);
  if (school) q = q.eq('school_id', school);
  if (userId) q = q.eq('user_id', userId);
  if (route) q = q.ilike('route', `%${route}%`);
  if (minMs) q = q.gte('duration_ms', minMs);
  const [rows, stats, schools, platform] = await Promise.all([
    q.order('at', { ascending: false }).limit(300),
    db.rpc('ops_request_stats', { p_since: from, p_school: school }),
    db.from('schools').select('id, name'),
    getPlatformSettings(db),
  ]);
  if (rows.error) {
    const missing = rows.error.code === '42P01' || rows.error.code === 'PGRST205';
    return NextResponse.json({ error: missing ? 'The request log is not set up: the ops_debug migration is missing from the database.' : rows.error.message }, { status: missing ? 409 : 500 });
  }

  // What happened inside each request: AI calls and logged errors by the same user within its span.
  const list = rows.data || [];
  const users = [...new Set(list.map(r => r.user_id).filter(Boolean))] as string[];
  let ai: { user_id: string | null; at: string; feature: string; ok: boolean; latency_ms: number | null; error: string | null }[] = [];
  let errors: { user_id: string | null; at: string; fingerprint: string; message: string; route: string | null }[] = [];
  if (list.length && users.length) {
    const longest = Math.max(...list.map(r => r.duration_ms));
    const lo = new Date(Date.parse(list[list.length - 1].at) - longest - 2000).toISOString();
    const hi = new Date(Date.parse(list[0].at) + 2000).toISOString();
    const [a, e] = await Promise.all([
      db.from('ai_usage').select('user_id, at, feature, ok, latency_ms, error').in('user_id', users).gte('at', lo).lte('at', hi).limit(5000),
      db.from('app_errors').select('user_id, at, fingerprint, message, route').in('user_id', users).gte('at', lo).lte('at', hi).limit(2000),
    ]);
    ai = a.data || []; errors = e.data || [];
  }

  return NextResponse.json({
    since, from, recording: platform['debug.request_log'], capped: list.length === 300,
    schools: Object.fromEntries((schools.data || []).map(s => [s.id, s.name])),
    rows: list.map(r => {
      const span = { userId: r.user_id, at: r.at, durationMs: r.duration_ms };
      return {
        id: r.id, at: r.at, method: r.method, route: r.route, userId: r.user_id, role: r.user_role, schoolId: r.school_id, ms: r.duration_ms, release: r.release,
        ai: ai.filter(x => during(span, x.user_id, x.at)).map(x => ({ feature: x.feature, label: featureLabel(x.feature), ok: x.ok, ms: x.latency_ms, error: x.error })),
        errors: errors.filter(x => during(span, x.user_id, x.at)).map(x => ({ fingerprint: x.fingerprint, message: x.message.slice(0, 200) })),
      };
    }),
    stats: stats.error ? [] : stats.data,
  });
}
