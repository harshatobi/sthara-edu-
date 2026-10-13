import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { recordAccess, requireGrant } from '@/lib/ops/access';
import { isInspectable, maskRow, summarise, tableLabel } from '@/lib/ops/inspect';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMN = /^[a-z_][a-z0-9_]{0,62}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

interface Meta { table: string; columns: { name: string; type: string }[]; refs: { column: string; table: string }[]; children: { table: string; column: string }[] }

/**
 * GET /api/ops/schools/:id/inspect — the record inspector. Every call needs the 'breakglass' capability and an
 * open access window on this school, and is noted under that window (the school sees how many records were opened).
 *
 *   ?meta=1                          the inspectable tables: columns, what rows point to, what points at them
 *   ?find=<uuid>                     which tables hold a row with this id
 *   ?find=<text>                     accounts whose name, email or roll number match
 *   ?table=T                         the school's newest 50 rows of T, summarised
 *   ?table=T&column=C&value=<uuid>   rows of T whose C is that id (a record's related rows)
 *   ?table=T&row=<uuid>              one row in full (secret fields hidden), its related-row counts and change history
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'breakglass', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return bad('School not found', 404);
  const db = createAdminClient();
  const g = await requireGrant(db, op.id, id);
  if (!g.ok) return bad(g.error, g.status);
  const sp = req.nextUrl.searchParams;

  if (sp.get('meta')) {
    const { data, error } = await db.rpc('ops_inspect_meta');
    if (error) return bad(error.message, 500);
    return NextResponse.json({ tables: ((data || []) as Meta[]).filter(t => isInspectable(t.table)) });
  }

  const find = (sp.get('find') || '').trim();
  if (find) {
    if (UUID.test(find)) {
      const { data, error } = await db.rpc('ops_inspect_find', { p_school: id, p_id: find });
      if (error) return bad(error.message, 500);
      await recordAccess(db, g.grant.id, 'record.find', find);
      return NextResponse.json({ hits: ((data || []) as string[]).filter(isInspectable).map(t => ({ table: t, id: find, title: tableLabel(t), facts: [] as string[] })) });
    }
    // Keep only characters that can appear in a name, email or roll number: nothing that means anything to PostgREST's or() syntax.
    const q = find.replace(/[^\p{L}\p{N}@._\- ]/gu, '').trim().slice(0, 80);
    if (q.length < 2) return bad('Type at least two characters, or paste a record id.');
    const { data, error } = await db.from('users').select('id, name, email, role, student_class, custom_student_id')
      .eq('school_id', id).or(`name.ilike.%${q}%,email.ilike.%${q}%,custom_student_id.ilike.%${q}%`).order('name').limit(20);
    if (error) return bad(error.message, 500);
    await recordAccess(db, g.grant.id, 'record.search', `users ~ ${q}`);
    return NextResponse.json({ hits: (data || []).map(u => ({
      table: 'users', id: u.id, title: u.name || u.email || u.id,
      facts: [u.role, u.student_class, u.custom_student_id && `roll ${u.custom_student_id}`, u.email].filter(Boolean) as string[],
    })) });
  }

  const table = sp.get('table') || '';
  if (!isInspectable(table)) return bad('Pick a table.');

  const row = sp.get('row');
  if (row) {
    if (!UUID.test(row)) return bad('That is not a record id.');
    const { data, error } = await db.rpc('ops_inspect_row', { p_school: id, p_table: table, p_id: row });
    if (error) return bad(error.message, 500);
    if (!data) return bad('This school has no such record.', 404);
    const { data: history } = await db.from('audit_log').select('id, at, actor_id, actor_role, action, old_values, new_values')
      .eq('table_name', table).eq('row_id', row).order('at', { ascending: false }).limit(50);
    const actorIds = [...new Set((history || []).map(h => h.actor_id).filter(Boolean))] as string[];
    const { data: actors } = actorIds.length ? await db.from('users').select('id, name, email').in('id', actorIds) : { data: [] };
    const who = new Map((actors || []).map(a => [a.id, a.name || a.email]));
    await recordAccess(db, g.grant.id, 'record.read', `${table}/${row}`);
    const d = data as { row: Record<string, unknown>; children: { table: string; column: string; count: number }[] };
    return NextResponse.json({
      table, row: maskRow(d.row),
      children: d.children.filter(c => isInspectable(c.table)),
      history: (history || []).map(h => ({
        id: h.id, at: h.at, action: h.action, actorRole: h.actor_role, actor: h.actor_id ? who.get(h.actor_id) ?? 'Deleted user' : 'System',
        old: maskRow(h.old_values), new: maskRow(h.new_values),
      })),
    });
  }

  const column = sp.get('column'), value = sp.get('value');
  if (column !== null || value !== null) {
    if (!column || !COLUMN.test(column) || !value || !UUID.test(value)) return bad('That filter is not valid.');
  }
  const { data, error } = await db.rpc('ops_inspect_list', { p_school: id, p_table: table, p_column: column, p_value: value, p_limit: 50 });
  if (error) return bad(error.code === '42703' ? 'That filter is not valid.' : error.message, error.code === '42703' ? 400 : 500);
  await recordAccess(db, g.grant.id, 'record.list', column ? `${table} where ${column} = ${value}` : table);
  const rows = (data || []) as Record<string, unknown>[];
  return NextResponse.json({ table, rows: rows.map(r => summarise(maskRow(r))), capped: rows.length === 50 });
}
