import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { PRIORITIES, isPriority } from '@/lib/ops/desk';
import { loadPicklist, loadSla } from '@/lib/ops/deskServer';
import { can } from '@/lib/ops/roles';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const KINDS = ['case_category', 'contact_role'] as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** GET /api/ops/desk/settings — deadlines per priority, the two configurable lists, and the canned replies. */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'desk.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const [sla, categories, roles, canned] = await Promise.all([
    loadSla(db), loadPicklist(db, 'case_category', false), loadPicklist(db, 'contact_role', false),
    db.from('ops_canned_replies').select('id, title, body, updated_at').order('title'),
  ]);
  return NextResponse.json({
    sla: PRIORITIES.map(p => sla.find(s => s.priority === p)!).filter(Boolean),
    categories, roles, canned: canned.data || [],
    can: { admin: can(op.role, 'desk.admin'), work: can(op.role, 'desk.work') },
  });
}

/**
 * POST /api/ops/desk/settings
 *   { action: 'sla', priority, firstResponseMinutes, resolveMinutes, reason }   new deadlines (cases already open keep theirs)
 *   { action: 'pick', kind, key?, label, sort?, active?, reason }               add or change a list entry
 *   { action: 'canned', id?, title, body }  ·  { action: 'canned-remove', id }  (anyone who works the desk)
 */
export async function POST(req: NextRequest) {
  const b = await req.clone().json().catch(() => ({}));
  const cannedAction = b.action === 'canned' || b.action === 'canned-remove';
  const op = await operatorFor(req, cannedAction ? 'desk.work' : 'desk.admin');
  if (op instanceof Response) return op;
  const db = createAdminClient();

  if (b.action === 'canned') {
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 80) : '', body = typeof b.body === 'string' ? b.body.trim().slice(0, 4000) : '';
    if (title.length < 2 || body.length < 2) return bad('Give the reply a title and its text.');
    const row = { title, body, updated_at: new Date().toISOString() };
    const { error } = typeof b.id === 'string' && UUID.test(b.id)
      ? await db.from('ops_canned_replies').update(row).eq('id', b.id)
      : await db.from('ops_canned_replies').insert({ ...row, created_by: op.id });
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (b.action === 'canned-remove') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Pick a reply.');
    await db.from('ops_canned_replies').delete().eq('id', b.id);
    return NextResponse.json({ ok: true });
  }

  const reason = parseReason(b.reason);
  if (!reason) return bad('Give a reason (at least 4 characters). It goes in the audit log.');
  const audit = (action: string, row: string, values: Record<string, unknown>) => db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action, table_name: action.startsWith('sla') ? 'ops_sla_policies' : 'ops_picklists', row_id: row, school_id: null, new_values: { ...values, reason },
  });

  if (b.action === 'sla') {
    const first = Math.round(Number(b.firstResponseMinutes)), resolve = Math.round(Number(b.resolveMinutes));
    if (!isPriority(b.priority)) return bad('Pick a priority.');
    if (!(first >= 5 && first <= 43200) || !(resolve >= 30 && resolve <= 129600)) return bad('First response: 5 minutes to 30 days. Resolution: 30 minutes to 90 days.');
    if (resolve < first) return bad('Resolution cannot be due before the first response.');
    const { error } = await db.from('ops_sla_policies').upsert({ priority: b.priority, first_response_minutes: first, resolve_minutes: resolve });
    if (error) return bad(error.message, 500);
    await audit('sla.changed', b.priority, { firstResponseMinutes: first, resolveMinutes: resolve });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'pick') {
    if (!(KINDS as readonly string[]).includes(b.kind)) return bad('Pick a list.');
    const label = typeof b.label === 'string' ? b.label.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (label.length < 2) return bad('Give the entry a name.');
    const key = typeof b.key === 'string' && /^[a-z0-9_]{2,40}$/.test(b.key) ? b.key
      : label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (key.length < 2) return bad('Use letters or digits in the name.');
    // 'other' is where an unknown value falls back to: it stays.
    if (key === 'other' && b.active === false) return bad('"Other" stays: it is the fallback.');
    const { error } = await db.from('ops_picklists').upsert({
      kind: b.kind, key, label, sort: Number.isInteger(b.sort) ? Math.max(0, Math.min(999, b.sort)) : 100, active: b.active !== false,
    });
    if (error) return bad(error.message, 500);
    await audit('picklist.changed', `${b.kind}/${key}`, { label, active: b.active !== false });
    return NextResponse.json({ ok: true, key });
  }
  return bad('Unknown action');
}
