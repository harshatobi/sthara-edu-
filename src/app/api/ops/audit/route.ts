import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/ops/audit?source=console|data&school=&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   console: every change made in this console (settings_changes), with who and why.
 *   data:    the database audit trail (audit_log): grades, roles, consent, guardians, fees, settings.
 * Newest first, at most 1,000 rows. Dates are IST days, inclusive.
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const sp = req.nextUrl.searchParams;
  const source = sp.get('source') === 'data' ? 'data' : 'console';
  const school = sp.get('school') || '';
  const from = DAY.test(sp.get('from') || '') ? `${sp.get('from')}T00:00:00+05:30` : null;
  const to = DAY.test(sp.get('to') || '') ? `${sp.get('to')}T23:59:59.999+05:30` : null;
  const db = createAdminClient();

  if (source === 'console') {
    let q = db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
      .order('at', { ascending: false }).limit(1000);
    if (school === 'platform') q = q.eq('scope', 'platform');
    else if (UUID.test(school)) q = q.eq('school_id', school);
    if (from) q = q.gte('at', from);
    if (to) q = q.lte('at', to);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ source, rows: data || [] });
  }

  let q = db.from('audit_log').select('id, at, actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values')
    .order('at', { ascending: false }).limit(1000);
  if (UUID.test(school)) q = q.eq('school_id', school);
  if (from) q = q.gte('at', from);
  if (to) q = q.lte('at', to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = [...new Set((data || []).map(r => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = ids.length ? await db.from('users').select('id, name, email').in('id', ids) : { data: [] };
  const who = new Map((actors || []).map(a => [a.id, a.name || a.email]));
  return NextResponse.json({
    source,
    rows: (data || []).map(r => ({ ...r, actor: r.actor_id ? who.get(r.actor_id) ?? 'Deleted user' : 'System' })),
  });
}
