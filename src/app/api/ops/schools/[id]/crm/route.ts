import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { ACTIVITY_KINDS, DOC_KINDS, caseRef, isActivityKind, isDocKind, slaState } from '@/lib/ops/desk';
import { CASE_COLS, clocked, loadPicklist, type CaseRow } from '@/lib/ops/deskServer';
import { journalLabel } from '@/lib/ops/journal';
import { loadOperators } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET = 'ops-docs';
const MAX_BYTES = 10 * 1024 * 1024;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/** What a file really is, from its first bytes (the name and the browser's type can say anything). */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * GET /api/ops/schools/:id/crm — the relationship with a school: its contacts, the timeline (logged calls, meetings,
 * emails, visits and notes, with cases, access windows and changes Sthara made woven in), follow-ups, documents
 * and recent cases.
 * GET ?doc=<id> — a link to a document's file that works for two minutes.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'crm.read', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return bad('School not found', 404);
  const db = createAdminClient();

  const docId = req.nextUrl.searchParams.get('doc');
  if (docId) {
    if (!UUID.test(docId)) return bad('Pick a document.');
    const { data: d } = await db.from('ops_documents').select('storage_path, file_name').eq('id', docId).eq('school_id', id).maybeSingle();
    if (!d) return bad('That document no longer exists.', 404);
    const signed = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 120, { download: d.file_name || undefined });
    if (signed.error || !signed.data?.signedUrl) return bad('Could not open the file. Try again.', 500);
    await db.from('audit_log').insert({ actor_id: op.id, actor_role: 'operator', action: 'document.opened', table_name: 'ops_documents', row_id: docId, school_id: id, new_values: {} });
    return NextResponse.json({ url: signed.data.signedUrl });
  }

  const [contacts, activities, tasks, documents, cases, journal, grants, roles, ops] = await Promise.all([
    db.from('ops_contacts').select('id, name, role, title, email, phone, is_primary, decides, note, active, updated_at').eq('school_id', id).order('is_primary', { ascending: false }).order('name'),
    db.from('ops_activities').select('id, kind, direction, subject, body, happened_at, contact_id, case_id, created_by').eq('school_id', id).order('happened_at', { ascending: false }).limit(150),
    db.from('ops_tasks').select('id, title, note, due_on, priority, status, owner_id, case_id, created_at, done_at').eq('school_id', id).order('status').order('due_on', { nullsFirst: false }).limit(200),
    db.from('ops_documents').select('id, kind, title, signed_on, expires_on, file_name, size_bytes, created_at, uploaded_by').eq('school_id', id).order('created_at', { ascending: false }),
    db.from('ops_cases').select(CASE_COLS).eq('school_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('settings_changes').select('id, at, actor_email, key, reason').eq('school_id', id).order('at', { ascending: false }).limit(50),
    db.from('ops_access_grants').select('id, operator_email, started_at, reason, case_ref').eq('school_id', id).order('started_at', { ascending: false }).limit(50),
    loadPicklist(db, 'contact_role', false), loadOperators(db),
  ]);
  // Deals, commissions and spend for this school, for roles that see the pipeline.
  const sales = can(op.role, 'sales.read');
  const [deals, commissions, spend, stageRows] = sales ? await Promise.all([
    db.from('ops_opportunities').select('id, number, name, kind, stage, amount, source, closed_at, created_at').eq('school_id', id).order('created_at', { ascending: false }),
    db.from('ops_commissions').select('payee_name, reason, amount, status').eq('school_id', id),
    db.from('ops_marketing_spend').select('amount, opportunity_id, school_id').or(`school_id.eq.${id}`),
    db.from('ops_opportunity_stages').select('key, label, kind'),
  ]) : [null, null, null, null];
  if (contacts.error) return bad(contacts.error.code === '42P01' || contacts.error.code === 'PGRST205' ? 'The relationship tables are missing: apply the ops_crm migration.' : contacts.error.message, 500);
  const ids = [...new Set([...ops.map(o => o.id), ...(activities.data || []).map(a => a.created_by), ...(documents.data || []).map(d => d.uploaded_by)].filter(Boolean))] as string[];
  const names = ids.length ? (await db.from('users').select('id, name, email').in('id', ids)).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const contactName = new Map((contacts.data || []).map(c => [c.id as string, c.name as string]));
  const caseRows = (cases.data || []) as CaseRow[];
  const caseNumber = new Map(caseRows.map(c => [c.id, c.number]));
  const now = Date.now();

  const timeline = [
    ...(activities.data || []).map(a => ({
      id: `a:${a.id}`, at: a.happened_at as string, kind: a.kind as string, title: a.subject as string, detail: (a.body as string | null) ?? '',
      by: a.created_by ? nameOf.get(a.created_by) ?? 'Former operator' : null,
      meta: [ACTIVITY_KINDS[a.kind as keyof typeof ACTIVITY_KINDS] + (a.direction ? (a.direction === 'in' ? ', from the school' : ', from Sthara') : ''),
        a.contact_id && contactName.get(a.contact_id) ? `with ${contactName.get(a.contact_id)}` : null,
        a.case_id && caseNumber.get(a.case_id) ? caseRef(caseNumber.get(a.case_id)!) : null].filter(Boolean).join(' · '),
    })),
    ...caseRows.map(c => ({ id: `c:${c.id}`, at: c.created_at, kind: 'case', title: `${caseRef(c.number)}: ${c.subject}`, detail: '', by: c.raised_by_name, meta: `Case raised (${c.source === 'school_portal' ? 'by the school, in the app' : 'logged by Sthara'})`, caseId: c.id })),
    ...(grants.error ? [] : grants.data || []).map(g => ({ id: `g:${g.id}`, at: g.started_at as string, kind: 'access', title: 'Access window opened on the school’s records', detail: g.reason as string, by: g.operator_email as string, meta: g.case_ref ? String(g.case_ref) : 'Break-glass' })),
    ...(journal.error ? [] : journal.data || []).map(j => ({ id: `j:${j.id}`, at: j.at as string, kind: 'change', title: `Changed: ${journalLabel('school', j.key as string)}`, detail: (j.reason as string | null) ?? '', by: j.actor_email as string | null, meta: 'Platform Manager' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);

  return NextResponse.json({
    contacts: contacts.data || [],
    roles,
    timeline,
    tasks: (tasks.data || []).map(t => ({ ...t, owner: t.owner_id ? nameOf.get(t.owner_id) ?? 'Former operator' : null, caseRef: t.case_id && caseNumber.get(t.case_id) ? caseRef(caseNumber.get(t.case_id)!) : null })),
    documents: (documents.data || []).map(d => ({ ...d, uploadedBy: d.uploaded_by ? nameOf.get(d.uploaded_by) ?? 'Former operator' : null })),
    cases: caseRows.slice(0, 12).map(c => ({ id: c.id, ref: caseRef(c.number), subject: c.subject, status: c.status, priority: c.priority, createdAt: c.created_at, sla: slaState(clocked(c), now) })),
    owners: ops.filter(o => o.active).map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    deals: sales && deals && !deals.error ? (deals.data || []).map(x => {
      const st = (stageRows?.data || []).find(s => s.key === x.stage);
      return { id: x.id, ref: `OPP-${x.number}`, name: x.name, kind: x.kind, stage: st?.label ?? x.stage, stageKind: st?.kind ?? 'open', amount: Number(x.amount), source: x.source, closedAt: x.closed_at };
    }) : null,
    won: sales && commissions && !commissions.error ? {
      directSpend: Math.round((spend?.data || []).reduce((n, x) => n + Number(x.amount), 0)),
      commissions: (commissions.data || []).filter(c => c.status !== 'cancelled').map(c => ({ payee: c.payee_name, reason: c.reason, amount: Number(c.amount), status: c.status })),
    } : null,
    can: { write: can(op.role, 'crm.write'), desk: can(op.role, 'desk.read'), deskWork: can(op.role, 'desk.work') },
    me: op.id,
  });
}

/**
 * POST /api/ops/schools/:id/crm
 *   multipart   kind, title, signedOn?, expiresOn?, file (PDF, JPEG, PNG or WebP up to 10 MB): store a document
 *   json        { action: 'contact', id?, name, role, title?, email?, phone?, isPrimary?, decides?, note?, active? }
 *               { action: 'activity', kind, direction?, subject, body?, happenedAt?, contactId?, caseId? }
 *               { action: 'task', id?, title, note?, dueOn?, priority?, ownerId?, caseId? }  ·  { action: 'task-status', id, status }
 *               { action: 'doc-remove', id, reason }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'crm.write', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return bad('School not found', 404);
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return bad('School not found', 404);
  const mine = async (table: string, rowId: unknown) => typeof rowId === 'string' && UUID.test(rowId)
    && !!(await db.from(table).select('id').eq('id', rowId).eq('school_id', id).maybeSingle()).data;

  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return bad('Invalid upload.');
    const f = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };
    if (!isDocKind(f('kind'))) return bad('Pick the kind of document.');
    const signedOn = f('signedOn') ? day(f('signedOn')) : null, expiresOn = f('expiresOn') ? day(f('expiresOn')) : null;
    if ((f('signedOn') && !signedOn) || (f('expiresOn') && !expiresOn)) return bad('Check the dates.');
    if (signedOn && expiresOn && expiresOn < signedOn) return bad('It cannot expire before it was signed.');
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return bad('Attach the file.');
    if (file.size > MAX_BYTES) return bad('That file is over 10 MB. Scan at a lower resolution or split it.');
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniff(buf);
    if (!type) return bad('Upload a PDF, JPEG, PNG or WebP.');
    const path = `${id}/${randomUUID()}.${type.ext}`;
    const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: type.mime, upsert: false });
    if (up.error) { console.error('[crm] upload failed:', up.error.message); return bad('Could not store the file. Try again.', 500); }
    const name = text(file.name, 200).replace(/[\\/]/g, '_') || `document.${type.ext}`;
    const { data, error } = await db.from('ops_documents').insert({
      school_id: id, kind: f('kind'), title: text(f('title'), 160) || DOC_KINDS[f('kind') as keyof typeof DOC_KINDS], signed_on: signedOn, expires_on: expiresOn,
      storage_path: path, file_name: name, mime: type.mime, size_bytes: file.size, uploaded_by: op.id,
    }).select('id').single();
    if (error) { await db.storage.from(BUCKET).remove([path]); return bad(error.message, 500); }
    return NextResponse.json({ ok: true, id: data.id });
  }

  const b = await req.json().catch(() => ({}));
  switch (b.action) {
    case 'contact': {
      const name = text(b.name, 120);
      if (name.length < 2) return bad('Enter the contact’s name.');
      const roles = await loadPicklist(db, 'contact_role', false);
      const email = text(b.email, 200).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('That email address does not look right.');
      const row = {
        name, role: roles.some(r => r.key === b.role) ? b.role : 'other', title: text(b.title, 80) || null, email: email || null,
        phone: text(b.phone, 30) || null, decides: b.decides === true, note: text(b.note, 1000) || null, active: b.active !== false,
        is_primary: b.isPrimary === true && b.active !== false, updated_at: new Date().toISOString(),
      };
      if (b.id !== undefined && !(await mine('ops_contacts', b.id))) return bad('That contact no longer exists.', 404);
      // One primary contact per school: making this one primary takes it from the other.
      if (row.is_primary) await db.from('ops_contacts').update({ is_primary: false }).eq('school_id', id).eq('is_primary', true).neq('id', b.id ?? '00000000-0000-0000-0000-000000000000');
      const { data, error } = b.id
        ? await db.from('ops_contacts').update(row).eq('id', b.id).select('id').single()
        : await db.from('ops_contacts').insert({ ...row, school_id: id, created_by: op.id }).select('id').single();
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true, id: data.id });
    }
    case 'activity': {
      if (!isActivityKind(b.kind)) return bad('Pick what happened: a call, meeting, email, WhatsApp chat, visit or note.');
      const subject = text(b.subject, 160);
      if (subject.length < 2) return bad('Say what it was about.');
      const when = typeof b.happenedAt === 'string' && !Number.isNaN(Date.parse(b.happenedAt)) ? new Date(b.happenedAt) : new Date();
      if (when.getTime() > Date.now() + 5 * 60_000) return bad('That time is in the future. To plan something, add a follow-up instead.');
      if (b.contactId && !(await mine('ops_contacts', b.contactId))) return bad('That contact is not at this school.');
      if (b.caseId && !(await mine('ops_cases', b.caseId))) return bad('That case is not this school’s.');
      const { data, error } = await db.from('ops_activities').insert({
        school_id: id, kind: b.kind, direction: b.kind === 'note' || b.kind === 'meeting' || b.kind === 'visit' ? null : b.direction === 'in' ? 'in' : 'out',
        subject, body: typeof b.body === 'string' ? b.body.trim().slice(0, 6000) || null : null, happened_at: when.toISOString(),
        contact_id: b.contactId || null, case_id: b.caseId || null, created_by: op.id,
      }).select('id').single();
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true, id: data.id });
    }
    case 'task': {
      const title = text(b.title, 200);
      if (title.length < 2) return bad('Say what needs doing.');
      const dueOn = b.dueOn ? day(b.dueOn) : null;
      if (b.dueOn && !dueOn) return bad('Check the due date.');
      let ownerId: string | null = op.id;
      if (b.ownerId !== undefined) {
        ownerId = typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : null;
        if (ownerId && !(await db.from('ops_operators').select('user_id').eq('user_id', ownerId).eq('active', true).maybeSingle()).data) return bad('The owner must be an active operator.');
      }
      if (b.caseId && !(await mine('ops_cases', b.caseId))) return bad('That case is not this school’s.');
      const row = { title, note: text(b.note, 2000) || null, due_on: dueOn, priority: ['high', 'normal', 'low'].includes(b.priority) ? b.priority : 'normal', owner_id: ownerId, case_id: b.caseId || null };
      if (b.id !== undefined && !(await mine('ops_tasks', b.id))) return bad('That follow-up no longer exists.', 404);
      const { data, error } = b.id
        ? await db.from('ops_tasks').update(row).eq('id', b.id).select('id').single()
        : await db.from('ops_tasks').insert({ ...row, school_id: id, created_by: op.id }).select('id').single();
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true, id: data.id });
    }
    case 'task-status': {
      if (!['open', 'done', 'cancelled'].includes(b.status)) return bad('Pick a status.');
      if (!(await mine('ops_tasks', b.id))) return bad('That follow-up no longer exists.', 404);
      const { error } = await db.from('ops_tasks').update({ status: b.status, done_at: b.status === 'done' ? new Date().toISOString() : null }).eq('id', b.id);
      return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
    }
    case 'doc-remove': {
      const reason = parseReason(b.reason);
      if (!reason) return bad('Give a reason (at least 4 characters). It goes in the audit log.');
      if (typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Pick a document.');
      const { data: d } = await db.from('ops_documents').select('id, title, storage_path').eq('id', b.id).eq('school_id', id).maybeSingle();
      if (!d) return bad('That document no longer exists.', 404);
      const { error } = await db.from('ops_documents').delete().eq('id', d.id);
      if (error) return bad(error.message, 500);
      await db.storage.from(BUCKET).remove([d.storage_path]);
      await db.from('audit_log').insert({ actor_id: op.id, actor_role: 'operator', action: 'document.removed', table_name: 'ops_documents', row_id: d.id, school_id: id, new_values: { title: d.title, reason } });
      return NextResponse.json({ ok: true });
    }
    default:
      return bad('Unknown action');
  }
}
