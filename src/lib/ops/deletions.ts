import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Operator } from './auth';

/**
 * Operator deletions. The database functions (migration ops_deletions) delete the profiles and
 * write the journal entry in one transaction, and refuse anything with fee records (which are
 * kept) or a school's only school admin. Removing the logins from Supabase Auth happens after,
 * outside that transaction, so any login that couldn't be removed is reported, never hidden.
 */
export interface DeletionResult { accounts: number; loginsRemoved: number; loginFailures: string[] }
export type DeletionOutcome = { ok: true; result: DeletionResult } | { ok: false; status: number; error: string };

/** Database refusals the operator should read as they are (fee records, last admin, not found). */
function refusal(error: { code?: string; message: string }): DeletionOutcome {
  if (error.code === 'P0001') return { ok: false, status: 409, error: error.message };
  if (error.code === 'P0002') return { ok: false, status: 404, error: error.message };
  return { ok: false, status: 500, error: error.message };
}

async function removeLogins(db: SupabaseClient, ids: string[]): Promise<Pick<DeletionResult, 'loginsRemoved' | 'loginFailures'>> {
  const failures: string[] = [];
  let removed = 0;
  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    // A profile without a login (never signed up) is fine.
    if (!error || /not.?found/i.test(error.message)) removed += 1;
    else failures.push(`${id}: ${error.message}`);
  }
  return { loginsRemoved: removed, loginFailures: failures };
}

export async function deleteSchool(db: SupabaseClient, op: Operator, schoolId: string, reason: string): Promise<DeletionOutcome> {
  const { data, error } = await db.rpc('ops_delete_school', { p_school: schoolId, p_reason: reason, p_actor: op.id, p_actor_email: op.email });
  if (error) return refusal(error);
  const ids = (data as string[] | null) ?? [];
  return { ok: true, result: { accounts: ids.length, ...(await removeLogins(db, ids)) } };
}

export async function deleteAccount(db: SupabaseClient, op: Operator, schoolId: string, userId: string, reason: string): Promise<DeletionOutcome> {
  const { error } = await db.rpc('ops_delete_account', { p_school: schoolId, p_user: userId, p_reason: reason, p_actor: op.id, p_actor_email: op.email });
  if (error) return refusal(error);
  return { ok: true, result: { accounts: 1, ...(await removeLogins(db, [userId])) } };
}
