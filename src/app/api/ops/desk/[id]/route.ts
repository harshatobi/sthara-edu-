import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor, type Operator } from '@/lib/ops/auth';
import { caseRef, slaState, type ReplyThen } from '@/lib/ops/desk';
import { CASE_COLS, clocked, loadPicklist, operatorMessage, updateCase, type CaseRow } from '@/lib/ops/deskServer';
import { loadOperators } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { canSeeSchool } from '@/lib/ops/scope';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const gone = () => NextResponse.json({ error: 'That case does not exist.' }, { status: 404 });
const LINK_KINDS = ['error', 'record', 'audit', 'request', 'url'];

/** The case, if it exists and its school is in the operator's sight. */
async function load(db: ReturnType<typeof createAdminClient>, op: Operator, id: string): Promise<CaseRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db.from('ops_cases').select(CASE_COLS).eq('id', id).maybeSingle();
  return data && (await canSeeSchool(db, op, data.school_id)) ? (data as CaseRow) : null;
}

/**
 * GET /api/ops/desk/:id — a case in full: its conversation (with internal notes), clock, links, the access windows
 * opened under its number, and what the controls need.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'desk.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const c = await load(db, op, (await params).id);
  if (!c) return gone();
  const [messages, links, school, contacts, categories, ops, canned, grants, others] = await Promise.all([
    db.from('ops_case_messages').select('id, author_kind, author_name, body, internal, created_at').eq('case_id', c.id).order('created_at'),
    db.from('ops_case_links').select('id, kind, ref, label, created_at').eq('case_id', c.id).order('created_at'),
    db.from('schools').select('id, name, settings').eq('id', c.school_id).maybeSingle(),
    db.from('ops_contacts').select('id, name, role, phone, email').eq('school_id', c.school_id).eq('active', true).order('name'),
    loadPicklist(db, 'case_category', false), loadOperators(db),
    db.from('ops_canned_replies').select('id, title, body').order('title'),
    db.from('ops_access_grants').select('id, operator_email, started_at, expires_at, ended_at, reason').eq('school_id', c.school_id).eq('case_ref', caseRef(c.number)).order('started_at', { ascending: false }),
    db.from('ops_cases').select('id, number, subject, status, created_at').eq('school_id', c.school_id).neq('id', c.id).order('created_at', { ascending: false }).limit(8),
  ]);
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  return NextResponse.json({
    case: {
      id: c.id, number: c.number, ref: caseRef(c.number), subject: c.subject, category: c.category, priority: c.priority, status: c.status, source: c.source,
      schoolId: c.school_id, school: school.data?.name ?? 'Deleted school', schoolCode: (school.data?.settings as { code?: string } | null)?.code ?? null,
      raisedByName: c.raised_by_name, contactId: c.contact_id, ownerId: c.owner_id, owner: c.owner_id ? nameOf.get(c.owner_id) ?? 'Former operator' : null,
      createdAt: c.created_at, firstResponseDue: c.first_response_due, resolveDue: c.resolve_due, firstRespondedAt: c.first_responded_at,
      resolvedAt: c.resolved_at, closedAt: c.closed_at, reopened: c.reopened, sla: slaState(clocked(c), Date.now()),
    },
    messages: messages.data || [],
    links: links.data || [],
    contacts: contacts.data || [],
    categories,
    owners: ops.filter(o => o.active && can(o.role, 'desk.work')).map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    canned: canned.data || [],
    windows: grants.error ? [] : grants.data || [],
    otherCases: (others.data || []).map(o => ({ ...o, ref: caseRef(o.number) })),
    can: { work: can(op.role, 'desk.work'), breakglass: can(op.role, 'breakglass') },
    me: op.id,
  });
}

/** PATCH /api/ops/desk/:id — { status?, priority?, category?, ownerId? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'desk.work');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const c = await load(db, op, (await params).id);
  if (!c) return gone();
  const { data: me } = await db.from('users').select('name').eq('id', op.id).maybeSingle();
  const out = await updateCase(db, c, { id: op.id, name: me?.name || op.email }, await req.json().catch(() => ({})));
  return out.ok ? NextResponse.json({ ok: true, changed: out.changed }) : NextResponse.json({ error: out.error }, { status: out.status });
}

/**
 * POST /api/ops/desk/:id
 *   { action: 'message', body, internal?, then?: 'none' | 'wait' | 'resolve' }   reply to the school, or leave an internal note
 *   { action: 'link', kind, ref, label? }                                         attach an error, record, audit entry, request or URL
 *   { action: 'unlink', linkId }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'desk.work');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const c = await load(db, op, (await params).id);
  if (!c) return gone();
  const b = await req.json().catch(() => ({}));

  if (b.action === 'message') {
    const { data: me } = await db.from('users').select('name').eq('id', op.id).maybeSingle();
    const then: ReplyThen = b.then === 'wait' || b.then === 'resolve' ? b.then : 'none';
    const out = await operatorMessage(db, c, { id: op.id, name: me?.name || op.email }, String(b.body ?? ''), b.internal === true, then);
    return out.ok ? NextResponse.json({ ok: true, status: out.status }) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  if (b.action === 'link') {
    const ref = typeof b.ref === 'string' ? b.ref.trim().slice(0, 400) : '';
    if (!LINK_KINDS.includes(b.kind) || !ref) return NextResponse.json({ error: 'Pick what to attach and give its reference.' }, { status: 400 });
    if (b.kind === 'url' && !/^https:\/\//i.test(ref)) return NextResponse.json({ error: 'A link must start with https://' }, { status: 400 });
    const { error } = await db.from('ops_case_links').insert({ case_id: c.id, kind: b.kind, ref, label: typeof b.label === 'string' ? b.label.trim().slice(0, 200) || null : null, created_by: op.id });
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'That is already attached.' : error.message }, { status: error.code === '23505' ? 409 : 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'unlink') {
    if (typeof b.linkId !== 'string' || !UUID.test(b.linkId)) return NextResponse.json({ error: 'Pick a link.' }, { status: 400 });
    await db.from('ops_case_links').delete().eq('id', b.linkId).eq('case_id', c.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
