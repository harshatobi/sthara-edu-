import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { featureLabel } from '@/lib/ai/pricing';
import { SINCE, during, isSince } from '@/lib/debug/route';
import { getPlatformSettings } from '@/lib/settings/server';
import { pageAll } from '@/lib/ops/page';
import { normaliseMessage } from '@/lib/errors/fingerprint';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/traffic?since=15m|1h|6h|24h|7d&school=&user=<id or email>&route=<contains>&minMs=&page=
 * The request explorer: signed-in API requests that match (route, role, school, duration, release), newest first,
 * 200 a page with the total, each with the AI calls and logged errors that happened inside it; per-route volume and
 * latency for the period; and the database reads browsers make directly (not through /api) that failed or came back
 * cut at the 1,000-row ceiling, as reported by lib/supabase/watch.ts.
 * Users appear as ids and roles, never names.
 */
const PAGE = 200;
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'debug.read');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  const since = isSince(sp.get('since')) ? sp.get('since') as keyof typeof SINCE : '1h';
  const from = new Date(Date.now() - SINCE[since] * 60_000).toISOString();
  const school = UUID.test(sp.get('school') || '') ? sp.get('school')! : null;
  const route = (sp.get('route') || '').replace(/[^a-zA-Z0-9/_:.\-]/g, '').slice(0, 100);
  const minMs = Math.max(0, Math.min(600_000, Number(sp.get('minMs')) || 0));
  const page = Math.max(0, Math.min(10_000, Math.floor(Number(sp.get('page')) || 0)));
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

  let q = db.from('request_log').select('id, at, method, route, user_id, user_role, school_id, duration_ms, release', { count: 'exact' }).gte('at', from);
  if (school) q = q.eq('school_id', school);
  if (userId) q = q.eq('user_id', userId);
  if (route) q = q.ilike('route', `%${route}%`);
  if (minMs) q = q.gte('duration_ms', minMs);
  // A fresh query per page: a query builder collects .order()/.range() calls, it does not replace them.
  const dbq = () => {
    const x = db.from('app_errors').select('fingerprint, message, at, repeats, school_id, user_id, user_role, route').like('message', '[database]%').gte('at', from);
    return school ? x.eq('school_id', school) : x;
  };
  const [rows, stats, schools, platform, dbErrors] = await Promise.all([
    q.order('at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1),
    db.rpc('ops_request_stats', { p_since: from, p_school: school }),
    db.from('schools').select('id, name'),
    getPlatformSettings(db),
    pageAll<{ fingerprint: string; message: string; at: string; repeats: number; school_id: string | null; user_id: string | null; user_role: string | null; route: string | null }>(
      (f, t) => dbq().order('id', { ascending: false }).range(f, t), 10_000),
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
      pageAll((f, t) => db.from('ai_usage').select('user_id, at, feature, ok, latency_ms, error').in('user_id', users.slice(0, 150)).gte('at', lo).lte('at', hi).order('id').range(f, t), 5000),
      pageAll((f, t) => db.from('app_errors').select('user_id, at, fingerprint, message, route').in('user_id', users.slice(0, 150)).gte('at', lo).lte('at', hi).order('id').range(f, t), 3000),
    ]);
    ai = a.data; errors = e.data;
  }

  return NextResponse.json({
    since, from, recording: platform['debug.request_log'], page, pageSize: PAGE, total: rows.count ?? null,
    database: databaseProblems(dbErrors.data),
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

/** Browser database problems grouped: one line per problem, with how often, how many people, which pages and roles. */
function databaseProblems(rows: { fingerprint: string; message: string; at: string; repeats: number; school_id: string | null; user_id: string | null; user_role: string | null; route: string | null }[]) {
  // One line per problem: the error log's fingerprint also splits by page, so these group by the message alone.
  const by = new Map<string, { fingerprint: string; message: string; n: number; last: string; users: Set<string>; schools: Set<string>; pages: Set<string>; roles: Set<string> }>();
  for (const r of rows) {
    const key = normaliseMessage(r.message);
    const g = by.get(key) ?? { fingerprint: r.fingerprint, message: r.message, n: 0, last: r.at, users: new Set(), schools: new Set(), pages: new Set(), roles: new Set() };
    g.n += r.repeats || 1;
    if (r.at > g.last) g.last = r.at;
    if (r.user_id) g.users.add(r.user_id);
    if (r.school_id) g.schools.add(r.school_id);
    if (r.route) g.pages.add(r.route);
    if (r.user_role) g.roles.add(r.user_role);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.last.localeCompare(a.last)).map(g => ({
    fingerprint: g.fingerprint, message: g.message.slice(0, 300), n: g.n, last: g.last, users: g.users.size,
    schools: [...g.schools], pages: [...g.pages].slice(0, 8), roles: [...g.roles],
  }));
}
