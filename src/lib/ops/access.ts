import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IMPORT_ROLES, type OperatorRole } from './roles';

/**
 * Break-glass access.
 *
 * Operators work from counts and findings. To open a school's own records (marks, attendance,
 * fees, messages, a raw row) an operator first opens a window here: one school, a written reason,
 * at most 30 minutes, read-only. The window and everything opened under it are recorded, cannot be
 * edited, and are shown to the school's administrators.
 *
 * The one writing window is 'import': it lets a director run, commit and undo bulk imports for the
 * school (and nothing else). An import started inside it may finish after the window closes.
 *
 * Tools that show named records call `requireGrant` and `recordAccess`; nothing else unlocks them.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export const GRANT_MINUTES = 30;
export const GRANT_REASON_MIN = 10;
export const GRANT_SCOPES = ['records', 'view_as', 'import'] as const;
export { IMPORT_ROLES };
export type GrantScope = typeof GRANT_SCOPES[number];

export interface Grant {
  id: string; operatorId: string | null; operatorEmail: string; operatorRole: string; schoolId: string; scope: GrantScope;
  reason: string; caseRef: string | null; startedAt: string; expiresAt: string; endedAt: string | null;
}

const COLS = 'id, operator_id, operator_email, operator_role, school_id, scope, reason, case_ref, started_at, expires_at, ended_at';
type Row = Record<string, string | null>;
const toGrant = (r: Row): Grant => ({
  id: r.id!, operatorId: r.operator_id, operatorEmail: r.operator_email!, operatorRole: r.operator_role!, schoolId: r.school_id!,
  scope: r.scope as GrantScope, reason: r.reason!, caseRef: r.case_ref, startedAt: r.started_at!, expiresAt: r.expires_at!, endedAt: r.ended_at,
});

/** Open now: not ended and not past its time. */
export const isOpen = (g: Pick<Grant, 'expiresAt' | 'endedAt'>, now = Date.now()) => !g.endedAt && Date.parse(g.expiresAt) > now;

/** The operator's open window on this school, if any. */
export async function activeGrant(db: Db, operatorId: string, schoolId: string): Promise<Grant | null> {
  const { data } = await db.from('ops_access_grants').select(COLS)
    .eq('operator_id', operatorId).eq('school_id', schoolId).is('ended_at', null).gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1);
  return data?.[0] ? toGrant(data[0] as Row) : null;
}

export async function openGrant(
  db: Db, op: { id: string; email: string; role: OperatorRole }, schoolId: string,
  b: { reason?: unknown; caseRef?: unknown; scope?: unknown },
): Promise<Result<{ grant: Grant }>> {
  const reason = typeof b.reason === 'string' ? b.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < GRANT_REASON_MIN || reason.length > 500) return fail(`Say why you need the school's records (at least ${GRANT_REASON_MIN} characters). The school will see this.`);
  const scope: GrantScope = b.scope === 'view_as' || b.scope === 'import' ? b.scope : 'records';
  if (scope === 'import' && !IMPORT_ROLES.includes(op.role)) return fail('Only a director can open an import window.', 403);
  const caseRef = typeof b.caseRef === 'string' ? b.caseRef.trim().slice(0, 80) || null : null;
  const existing = await activeGrant(db, op.id, schoolId);
  if (existing) return fail('You already have a window open on this school. End it before opening another.', 409);
  const now = Date.now();
  const { data, error } = await db.from('ops_access_grants').insert({
    operator_id: op.id, operator_email: op.email, operator_role: op.role, school_id: schoolId, scope, reason, case_ref: caseRef,
    started_at: new Date(now).toISOString(), expires_at: new Date(now + GRANT_MINUTES * 60_000).toISOString(),
  }).select(COLS).single();
  if (error) return fail(error.message, 500);
  await db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action: 'access.opened', table_name: 'ops_access_grants', row_id: data.id, school_id: schoolId,
    new_values: { scope, reason, caseRef, minutes: GRANT_MINUTES },
  });
  return { ok: true, grant: toGrant(data as Row) };
}

/** Ends a window early. An operator ends their own; a director can end anyone's. */
export async function endGrant(db: Db, op: { id: string; role: OperatorRole }, schoolId: string, grantId: string): Promise<Result> {
  const { data: g } = await db.from('ops_access_grants').select(COLS).eq('id', grantId).eq('school_id', schoolId).maybeSingle();
  if (!g) return fail('That window no longer exists.', 404);
  if (g.operator_id !== op.id && op.role !== 'director') return fail('Only the operator who opened it, or a director, can end this window.', 403);
  if (!isOpen(toGrant(g as Row))) return { ok: true };
  const { error } = await db.from('ops_access_grants').update({ ended_at: new Date().toISOString() }).eq('id', grantId).is('ended_at', null);
  if (error) return fail(error.message, 500);
  await db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action: 'access.ended', table_name: 'ops_access_grants', row_id: grantId, school_id: schoolId, new_values: {},
  });
  return { ok: true };
}

/** For a tool that shows named records: the open window, or the refusal to send back. */
export async function requireGrant(db: Db, operatorId: string, schoolId: string, scope: GrantScope = 'records'): Promise<Result<{ grant: Grant }>> {
  const grant = await activeGrant(db, operatorId, schoolId);
  if (!grant) return fail('This shows the school\'s own records. Open an access window on the school first.', 423);
  if (scope === 'view_as' && grant.scope !== 'view_as') return fail('Your access window does not cover viewing as the school.', 423);
  if (scope === 'import' && grant.scope !== 'import') return fail('Importing for the school needs an import window. Open one first.', 423);
  // An import window covers imports and nothing else: no named records under it.
  if (scope !== 'import' && grant.scope === 'import') return fail('Your access window covers imports only. Open a records window to see the school\'s records.', 423);
  return { ok: true, grant };
}

/** Notes what was opened under a window ("record.read", "students/3f2a…"). */
export async function recordAccess(db: Db, grantId: string, action: string, target: string | null = null) {
  const { error } = await db.from('ops_access_events').insert({ grant_id: grantId, action: action.slice(0, 80), target: target?.slice(0, 300) ?? null });
  if (error) console.warn('[ops access]', error.message);
}

/** A school's access history, newest first, with how many things were opened under each window. */
export async function grantsForSchool(db: Db, schoolId: string, limit = 100): Promise<(Grant & { opened: number })[]> {
  const { data, error } = await db.from('ops_access_grants').select(COLS).eq('school_id', schoolId).order('started_at', { ascending: false }).limit(limit);
  if (error || !data?.length) return [];
  const { data: events } = await db.from('ops_access_events').select('grant_id').in('grant_id', data.map(g => g.id));
  const n = new Map<string, number>();
  for (const e of events || []) n.set(e.grant_id, (n.get(e.grant_id) ?? 0) + 1);
  return data.map(g => ({ ...toGrant(g as Row), opened: n.get(g.id) ?? 0 }));
}
