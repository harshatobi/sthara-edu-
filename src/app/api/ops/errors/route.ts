import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

const RANGES: Record<string, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
const STATUSES = ['open', 'resolved', 'ignored'];

/**
 * GET /api/ops/errors?range=24h&status=open&source=server  — error groups seen in the range, busiest first, each with
 *   its hourly counts over the last 24 hours and how many schools and people it reached in the range.
 * GET /api/ops/errors?fingerprint=…  — one group and its latest 50 occurrences (stack, route, school, person, browser).
 * Operators only (404 for everyone else).
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const sp = req.nextUrl.searchParams;
  const db = createAdminClient();

  const fp = sp.get('fingerprint');
  if (fp) {
    if (!/^[0-9a-f]{16}$/.test(fp)) return NextResponse.json({ error: 'Unknown error group.' }, { status: 400 });
    const [{ data: group }, { data: events }] = await Promise.all([
      db.from('app_error_groups').select('*').eq('fingerprint', fp).maybeSingle(),
      db.from('app_errors').select('id, at, source, kind, message, stack, route, method, path, school_id, user_id, user_role, release, environment, user_agent, digest, repeats, context')
        .eq('fingerprint', fp).order('at', { ascending: false }).limit(50),
    ]);
    if (!group) return NextResponse.json({ error: 'That error group no longer exists.' }, { status: 404 });
    const schoolIds = [...new Set((events || []).map(e => e.school_id).filter(Boolean))] as string[];
    const userIds = [...new Set((events || []).map(e => e.user_id).concat(group.resolved_by).filter(Boolean))] as string[];
    const [{ data: schools }, { data: users }] = await Promise.all([
      schoolIds.length ? db.from('schools').select('id, name').in('id', schoolIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      userIds.length ? db.from('users').select('id, name, email').in('id', userIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
    ]);
    const sName = new Map((schools || []).map(s => [s.id, s.name]));
    const uName = new Map((users || []).map(u => [u.id, u.name || u.email]));
    return NextResponse.json({
      group: { ...group, resolvedByName: group.resolved_by ? uName.get(group.resolved_by) ?? null : null },
      events: (events || []).map(e => ({ ...e, school: e.school_id ? sName.get(e.school_id) ?? 'Deleted school' : null, user: e.user_id ? uName.get(e.user_id) ?? 'Former user' : null })),
    });
  }

  const span = RANGES[sp.get('range') || '24h'] ?? RANGES['24h'];
  const since = new Date(Date.now() - span).toISOString();
  let q = db.from('app_error_groups').select('*').gte('last_seen', since).order('last_seen', { ascending: false }).limit(300);
  const status = sp.get('status') || '';
  if (STATUSES.includes(status)) q = q.eq('status', status);
  const source = sp.get('source') || '';
  if (source === 'server' || source === 'client') q = q.eq('source', source);
  const { data: groups, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fps = (groups || []).map(g => g.fingerprint);
  // Counted in the database (every occurrence, not a sample): in range, schools and people reached, and the last
  // 24 hours by hour whatever the range.
  type Stat = { inRange: number; schools: number; users: number; hours: number[] };
  const { data: stats, error: statsErr } = fps.length
    ? await db.rpc('ops_error_stats', { p_fingerprints: fps, p_since: since })
    : { data: { groups: {}, schools: 0 }, error: null };
  if (statsErr) return NextResponse.json({ error: statsErr.message }, { status: 500 });
  const per = ((stats as { groups?: Record<string, Stat> } | null)?.groups ?? {});
  const rows = (groups || []).map(g => {
    const s = per[g.fingerprint];
    return { ...g, inRange: Number(s?.inRange ?? 0), hours: s?.hours ?? Array(24).fill(0), schools: Number(s?.schools ?? 0), users: Number(s?.users ?? 0) };
  }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.inRange - a.inRange);
  return NextResponse.json({
    groups: rows,
    totals: {
      events: rows.reduce((n, r) => n + r.inRange, 0),
      open: rows.filter(r => r.status === 'open').length,
      newGroups: rows.filter(r => Date.parse(r.first_seen) >= Date.parse(since)).length,
      schools: Number((stats as { schools?: number } | null)?.schools ?? 0),
    },
  });
}

/**
 * POST /api/ops/errors — { action: 'test' }: checks the error log end to end. Logs one error (console.error, the path
 * routes use for failures they handle) and then fails uncaught (the path for crashes), so both appear in the log.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'test') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  console.error('[ops] Test of the error log (a logged error)');
  throw new Error('Test of the error log (an uncaught error)');
}

/** PATCH /api/ops/errors — { fingerprint, status?: 'open' | 'resolved' | 'ignored', note? } */
export async function PATCH(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  if (typeof b.fingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(b.fingerprint)) return NextResponse.json({ error: 'Pick an error.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'Open, resolved or ignored?' }, { status: 400 });
    patch.status = b.status;
    patch.resolved_at = b.status === 'resolved' ? new Date().toISOString() : null;
    patch.resolved_by = b.status === 'open' ? null : op.id;
  }
  if (b.note !== undefined) patch.note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) || null : null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const { data, error } = await createAdminClient().from('app_error_groups').update(patch).eq('fingerprint', b.fingerprint).select('fingerprint');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'That error group no longer exists.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
