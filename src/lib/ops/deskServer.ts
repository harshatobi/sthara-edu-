import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SLA, afterOperatorMessage, afterSchoolMessage, caseRef, isPriority, slaDue,
  type CaseSource, type CaseStatus, type Priority, type ReplyThen, type SlaPolicy,
} from './desk';
import { can, isOperatorRole } from './roles';

/** The service desk's reads and writes, used by /api/ops/desk (operators) and /api/admin/support (schools). */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export const CASE_COLS = 'id, number, school_id, subject, category, priority, status, source, raised_by, raised_by_name, contact_id, owner_id, first_response_due, resolve_due, first_responded_at, resolved_at, closed_at, reopened, last_school_at, last_operator_at, created_at, updated_at';

export interface CaseRow {
  id: string; number: number; school_id: string; subject: string; category: string; priority: Priority; status: CaseStatus; source: CaseSource;
  raised_by: string | null; raised_by_name: string | null; contact_id: string | null; owner_id: string | null;
  first_response_due: string; resolve_due: string; first_responded_at: string | null; resolved_at: string | null; closed_at: string | null;
  reopened: number; last_school_at: string | null; last_operator_at: string | null; created_at: string; updated_at: string;
}

/** The row as the pure rules read it. */
export const clocked = (c: CaseRow) => ({
  status: c.status, createdAt: c.created_at, firstResponseDue: c.first_response_due, resolveDue: c.resolve_due,
  firstRespondedAt: c.first_responded_at, resolvedAt: c.resolved_at, ownerId: c.owner_id,
});

export async function loadSla(db: Db): Promise<SlaPolicy[]> {
  const { data, error } = await db.from('ops_sla_policies').select('priority, first_response_minutes, resolve_minutes');
  if (error || !data?.length) return DEFAULT_SLA;
  return data.filter(p => isPriority(p.priority)).map(p => ({ priority: p.priority as Priority, firstResponseMinutes: p.first_response_minutes, resolveMinutes: p.resolve_minutes }));
}

export interface Pick { kind: string; key: string; label: string; sort: number; active: boolean }
export async function loadPicklist(db: Db, kind: 'case_category' | 'contact_role', activeOnly = true): Promise<Pick[]> {
  let q = db.from('ops_picklists').select('kind, key, label, sort, active').eq('kind', kind);
  if (activeOnly) q = q.eq('active', true);
  const { data } = await q.order('sort').order('label');
  return (data || []) as Pick[];
}

/** The school's owner, if they are an active operator who works the desk: new cases go to them. */
async function defaultOwner(db: Db, schoolId: string): Promise<string | null> {
  const { data: acc } = await db.from('ops_accounts').select('owner_id').eq('school_id', schoolId).maybeSingle();
  if (!acc?.owner_id) return null;
  const { data: op } = await db.from('ops_operators').select('role, active').eq('user_id', acc.owner_id).maybeSingle();
  return op?.active && isOperatorRole(op.role) && can(op.role, 'desk.work') ? acc.owner_id : null;
}

export interface NewCase {
  schoolId: string; subject: string; body: string; category: string; priority: Priority; source: CaseSource;
  by: { kind: 'school' | 'operator'; id: string; name: string };
  /** For a case an operator logs on a school's behalf: who at the school asked. */
  raisedByName?: string | null; contactId?: string | null; ownerId?: string | null;
}

export async function createCase(db: Db, n: NewCase): Promise<Result<{ id: string; number: number }>> {
  const subject = n.subject.replace(/\s+/g, ' ').trim().slice(0, 160), body = n.body.trim().slice(0, 8000);
  if (subject.length < 4) return fail('Give the case a subject of at least four characters.');
  if (!body) return fail('Describe what is happening.');
  const categories = await loadPicklist(db, 'case_category');
  const category = categories.some(c => c.key === n.category) ? n.category : 'other';
  const now = Date.now();
  const due = slaDue(await loadSla(db), n.priority, now);
  const at = new Date(now).toISOString();
  const { data, error } = await db.from('ops_cases').insert({
    school_id: n.schoolId, subject, category, priority: n.priority, source: n.source,
    raised_by: n.by.kind === 'school' ? n.by.id : null, raised_by_name: n.by.kind === 'school' ? n.by.name : n.raisedByName ?? null,
    contact_id: n.contactId ?? null, owner_id: n.ownerId === undefined ? await defaultOwner(db, n.schoolId) : n.ownerId,
    first_response_due: due.firstResponseDue, resolve_due: due.resolveDue, created_at: at, updated_at: at,
    last_school_at: n.by.kind === 'school' ? at : null,
  }).select('id, number').single();
  if (error) return fail(error.message, 500);
  // The opening description is the first message. One logged by an operator is the school's words as taken down.
  const { error: mErr } = await db.from('ops_case_messages').insert({
    case_id: data.id, author_kind: n.by.kind === 'school' ? 'school' : 'operator', author_id: n.by.id, author_name: n.by.name,
    body: n.by.kind === 'operator' ? `Logged for the school${n.raisedByName ? ` (${n.raisedByName})` : ''}:\n${body}` : body,
    internal: n.by.kind === 'operator',
  });
  if (mErr) console.warn('[desk] first message:', mErr.message);
  return { ok: true, id: data.id, number: data.number };
}

/** Tells whoever raised the case, in the app. */
async function tellSchool(db: Db, c: CaseRow, title: string, body: string) {
  if (!c.raised_by) return;
  const { error } = await db.from('notifications').insert({
    school_id: c.school_id, user_id: c.raised_by, type: 'support', title, body: body.slice(0, 300), metadata: { caseId: c.id, caseNumber: c.number },
  });
  if (error) console.warn('[desk] notify:', error.message);
}

export async function operatorMessage(db: Db, c: CaseRow, op: { id: string; name: string }, text: string, internal: boolean, then: ReplyThen): Promise<Result<{ status: CaseStatus }>> {
  const body = text.trim().slice(0, 8000);
  if (!body) return fail('Write the message first.');
  if (c.status === 'closed' && !internal) return fail('This case is closed. Reopen it to reply.', 409);
  const at = new Date().toISOString();
  const { error } = await db.from('ops_case_messages').insert({ case_id: c.id, author_kind: 'operator', author_id: op.id, author_name: op.name, body, internal });
  if (error) return fail(error.message, 500);
  const p = afterOperatorMessage({ status: c.status, firstRespondedAt: c.first_responded_at }, internal, then, at);
  const patch: Record<string, unknown> = { updated_at: at, last_operator_at: internal ? c.last_operator_at : at };
  if (p.status) patch.status = p.status;
  if (p.firstRespondedAt) patch.first_responded_at = p.firstRespondedAt;
  if (p.resolvedAt !== undefined) patch.resolved_at = p.resolvedAt;
  // Whoever answers an unowned case owns it.
  if (!c.owner_id && !internal) patch.owner_id = op.id;
  const { error: uErr } = await db.from('ops_cases').update(patch).eq('id', c.id);
  if (uErr) return fail(uErr.message, 500);
  if (!internal) {
    await tellSchool(db, c, p.status === 'resolved' ? `${caseRef(c.number)} resolved` : `Sthara replied on ${caseRef(c.number)}`, body);
  }
  return { ok: true, status: p.status ?? c.status };
}

export async function schoolMessage(db: Db, c: CaseRow, by: { id: string; name: string }, text: string): Promise<Result<{ status: CaseStatus }>> {
  const body = text.trim().slice(0, 8000);
  if (!body) return fail('Write the message first.');
  const next = afterSchoolMessage({ status: c.status, reopened: c.reopened });
  if (!next.ok) return fail(next.error, 409);
  const at = new Date().toISOString();
  const { error } = await db.from('ops_case_messages').insert({ case_id: c.id, author_kind: 'school', author_id: by.id, author_name: by.name, body, internal: false });
  if (error) return fail(error.message, 500);
  const patch: Record<string, unknown> = { status: next.status, reopened: next.reopened, updated_at: at, last_school_at: at };
  if (next.resolvedAt === null) patch.resolved_at = null;
  const { error: uErr } = await db.from('ops_cases').update(patch).eq('id', c.id);
  if (uErr) return fail(uErr.message, 500);
  return { ok: true, status: next.status };
}

/** A line in the thread that nobody wrote: a status, owner or priority change. Operators see who; the school sees what. */
export async function systemNote(db: Db, caseId: string, body: string, internal = false) {
  const { error } = await db.from('ops_case_messages').insert({ case_id: caseId, author_kind: internal ? 'operator' : 'system', author_name: internal ? 'System' : null, body: body.slice(0, 8000), internal });
  if (error) console.warn('[desk] note:', error.message);
}

export interface CasePatch { status?: unknown; priority?: unknown; category?: unknown; ownerId?: unknown }

export async function updateCase(db: Db, c: CaseRow, op: { id: string; name: string }, b: CasePatch): Promise<Result<{ changed: string[] }>> {
  const at = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const notes: string[] = [], internal: string[] = [];
  if (b.status !== undefined && b.status !== c.status) {
    const s = b.status as CaseStatus;
    if (!['open', 'waiting_school', 'resolved', 'closed'].includes(s)) return fail('Pick a status.');
    patch.status = s;
    if (s === 'resolved') { patch.resolved_at = at; notes.push('Marked resolved by Sthara.'); }
    else if (s === 'closed') { patch.closed_at = at; patch.resolved_at = c.resolved_at ?? at; notes.push('Closed by Sthara.'); }
    else {
      patch.resolved_at = null; patch.closed_at = null;
      if (c.status === 'resolved' || c.status === 'closed') { patch.reopened = c.reopened + 1; notes.push('Reopened by Sthara.'); }
    }
  }
  if (b.priority !== undefined && b.priority !== c.priority) {
    if (!isPriority(b.priority)) return fail('Pick a priority.');
    // The deadlines move with the priority, still counted from when the case was raised.
    const due = slaDue(await loadSla(db), b.priority, Date.parse(c.created_at));
    Object.assign(patch, { priority: b.priority, first_response_due: due.firstResponseDue, resolve_due: due.resolveDue });
    internal.push(`${op.name} changed the priority from ${c.priority} to ${b.priority}.`);
  }
  if (b.category !== undefined && b.category !== c.category) {
    const cats = await loadPicklist(db, 'case_category');
    if (!cats.some(x => x.key === b.category)) return fail('Pick a category.');
    patch.category = b.category;
  }
  if (b.ownerId !== undefined && (b.ownerId || null) !== c.owner_id) {
    const ownerId = typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : null;
    let ownerName = 'nobody';
    if (ownerId) {
      const [{ data: o }, { data: u }] = await Promise.all([
        db.from('ops_operators').select('role, active').eq('user_id', ownerId).maybeSingle(),
        db.from('users').select('name, email').eq('id', ownerId).maybeSingle(),
      ]);
      if (!o?.active || !isOperatorRole(o.role) || !can(o.role, 'desk.work')) return fail('The owner must be an active operator who works the desk.');
      ownerName = u?.name || u?.email || 'an operator';
    }
    patch.owner_id = ownerId;
    internal.push(`${op.name} assigned this to ${ownerName}.`);
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { ok: true, changed };
  const { error } = await db.from('ops_cases').update({ ...patch, updated_at: at }).eq('id', c.id);
  if (error) return fail(error.message, 500);
  for (const n of notes) await systemNote(db, c.id, n);
  for (const n of internal) await systemNote(db, c.id, n, true);
  if (patch.status === 'resolved') await tellSchool(db, c, `${caseRef(c.number)} resolved`, `Sthara marked "${c.subject}" resolved. Reply on the case if it is not.`);
  return { ok: true, changed };
}
