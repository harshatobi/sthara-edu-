import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { STATUS_FOR_SCHOOL, URGENCIES, caseRef, isLive, isPriority } from '@/lib/ops/desk';
import { CASE_COLS, createCase, loadPicklist, schoolMessage, systemNote, type CaseRow } from '@/lib/ops/deskServer';

export const dynamic = 'force-dynamic';

/**
 * Help and support for a school's office: raise a case with Sthara and follow it. Any office account may use it,
 * and everyone in the office sees the school's cases (so a colleague can pick one up). Sthara's internal notes
 * and deadlines are never included.
 *
 *   GET            the school's cases, newest first, with what the form needs
 *   GET ?id=       one case with its conversation
 *   POST { action: 'new', subject, description, category, urgency }
 *        { action: 'reply', id, body }
 *        { action: 'close', id }        the school confirms a resolved case is done
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const id = req.nextUrl.searchParams.get('id');
  const shape = (c: CaseRow) => ({
    id: c.id, ref: caseRef(c.number), subject: c.subject, category: c.category, status: c.status, statusText: STATUS_FOR_SCHOOL[c.status],
    raisedByName: c.raised_by_name, createdAt: c.created_at, updatedAt: c.updated_at, resolvedAt: c.resolved_at,
    // Sthara has written since the school last did.
    newReply: !!c.last_operator_at && (!c.last_school_at || c.last_operator_at > c.last_school_at) && isLive(c.status),
  });
  if (id) {
    if (!isUuid(id)) return bad('Case not found.', 404);
    const { data: c } = await db.from('ops_cases').select(CASE_COLS).eq('id', id).eq('school_id', admin.schoolId).maybeSingle();
    if (!c) return bad('Case not found.', 404);
    const { data: messages } = await db.from('ops_case_messages').select('id, author_kind, author_name, body, created_at')
      .eq('case_id', c.id).eq('internal', false).order('created_at');
    return NextResponse.json({
      case: shape(c as CaseRow),
      // Sthara's people are shown as "Sthara support", not by name.
      messages: (messages || []).map(m => ({ id: m.id, from: m.author_kind, name: m.author_kind === 'school' ? m.author_name : m.author_kind === 'operator' ? 'Sthara support' : null, body: m.body, at: m.created_at })),
    });
  }
  const [{ data: cases, error }, categories] = await Promise.all([
    db.from('ops_cases').select(CASE_COLS).eq('school_id', admin.schoolId).order('created_at', { ascending: false }).limit(200),
    loadPicklist(db, 'case_category'),
  ]);
  if (error) return bad(error.code === '42P01' || error.code === 'PGRST205' ? 'Support is not set up on this server yet.' : error.message, 500);
  return NextResponse.json({
    cases: ((cases || []) as CaseRow[]).map(shape),
    categories: categories.map(c => ({ key: c.key, label: c.label })),
    urgencies: URGENCIES,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.action === 'new') {
    const out = await createCase(db, {
      schoolId: admin.schoolId, subject: str(b.subject, 160), body: typeof b.description === 'string' ? b.description : '', category: str(b.category, 40) || 'other',
      priority: isPriority(b.urgency) ? b.urgency : 'normal', source: 'school_portal', by: { kind: 'school', id: admin.id, name: admin.name },
    });
    return out.ok ? NextResponse.json({ ok: true, id: out.id, ref: caseRef(out.number) }) : bad(out.error, out.status);
  }

  if (!isUuid(b.id)) return bad('Case not found.', 404);
  const { data: c } = await db.from('ops_cases').select(CASE_COLS).eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
  if (!c) return bad('Case not found.', 404);
  if (b.action === 'reply') {
    const out = await schoolMessage(db, c as CaseRow, { id: admin.id, name: admin.name }, typeof b.body === 'string' ? b.body : '');
    return out.ok ? NextResponse.json({ ok: true, status: out.status }) : bad(out.error, out.status);
  }
  if (b.action === 'close') {
    if (c.status !== 'resolved') return bad('Only a resolved case can be confirmed. Reply on it if it is not fixed.', 409);
    const at = new Date().toISOString();
    const { error } = await db.from('ops_cases').update({ status: 'closed', closed_at: at, updated_at: at }).eq('id', c.id);
    if (error) return bad(error.message, 500);
    await systemNote(db, c.id, `${admin.name} confirmed this is resolved.`);
    return NextResponse.json({ ok: true });
  }
  return bad('Unknown action.');
}
