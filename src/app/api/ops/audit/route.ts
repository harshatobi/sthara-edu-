import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { byIds, pageAll } from '@/lib/ops/page';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const PAGE = 200;
const EXPORT_MAX = 20_000;

/**
 * GET /api/ops/audit?source=console|data&school=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&page=&export=1
 *   console: every change made in this console (settings_changes), with who and why.
 *   data:    the database audit trail (audit_log): grades, roles, consent, guardians, fees, settings.
 * Newest first, 200 a page with the total matching. `q` searches setting, reason and who (console) or table,
 * action, record id and role (data). export=1 returns every matching row (up to 20,000) for the CSV.
 * Dates are IST days, inclusive.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'audit.read');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  const source = sp.get('source') === 'data' ? 'data' : 'console';
  const school = sp.get('school') || '';
  const from = DAY.test(sp.get('from') || '') ? `${sp.get('from')}T00:00:00+05:30` : null;
  const to = DAY.test(sp.get('to') || '') ? `${sp.get('to')}T23:59:59.999+05:30` : null;
  // Characters that would break out of the or() filter are dropped; what is left is matched anywhere, any case.
  const needle = (sp.get('q') || '').replace(/[,()"*%\\:]/g, ' ').trim().slice(0, 80);
  const page = Math.max(0, Math.min(100_000, Math.floor(Number(sp.get('page')) || 0)));
  const all = sp.get('export') === '1';
  const db = createAdminClient();

  if (source === 'console') {
    const build = () => {
      let q = db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason', { count: 'exact' });
      if (school === 'platform') q = q.eq('scope', 'platform');
      else if (UUID.test(school)) q = q.eq('school_id', school);
      if (from) q = q.gte('at', from);
      if (to) q = q.lte('at', to);
      if (needle) q = q.or(['key', 'reason', 'actor_email'].map(c => `${c}.ilike.*${needle}*`).join(','));
      return q.order('at', { ascending: false }).order('id', { ascending: false });
    };
    const r = await rowsOf(build, page, all);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ source, rows: r.rows, page, pageSize: PAGE, total: r.total });
  }

  const build = () => {
    let q = db.from('audit_log').select('id, at, actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values', { count: 'exact' });
    if (UUID.test(school)) q = q.eq('school_id', school);
    if (from) q = q.gte('at', from);
    if (to) q = q.lte('at', to);
    if (needle) q = q.or(['table_name', 'action', 'row_id', 'actor_role'].map(c => `${c}.ilike.*${needle}*`).join(','));
    return q.order('at', { ascending: false }).order('id', { ascending: false });
  };
  const r = await rowsOf(build, page, all);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
  const ids = [...new Set(r.rows.map(x => x.actor_id).filter(Boolean))] as string[];
  const { data: actors } = await byIds<{ id: string; name: string | null; email: string | null }>(ids, (chunk, f, t) => db.from('users').select('id, name, email').in('id', chunk).order('id').range(f, t));
  const who = new Map(actors.map(a => [a.id, a.name || a.email]));
  return NextResponse.json({
    source, page, pageSize: PAGE, total: r.total,
    rows: r.rows.map(x => ({ ...x, actor: x.actor_id ? who.get(x.actor_id) ?? 'Deleted user' : 'System' })),
  });
}

/** One page of a query with the total matching, or (for the CSV) every matching row. */
async function rowsOf(build: () => any, page: number, all: boolean): Promise<{ rows: any[]; total: number | null; error: string | null }> {
  if (all) {
    const r = await pageAll<any>((f, t) => build().range(f, t), EXPORT_MAX);
    return { rows: r.data, total: r.data.length, error: r.error?.message ?? null };
  }
  const { data, count, error } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
  return { rows: data || [], total: count ?? null, error: error?.message ?? null };
}
