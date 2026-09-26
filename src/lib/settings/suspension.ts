import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Suspension at the sign-in layer. A suspended school's accounts are banned in
 * Supabase Auth, so they can neither sign in nor refresh a session: without
 * this, a user already signed in could keep reading through the database API
 * until they signed out. Each ban is tagged in app_metadata (which users can't
 * edit) so reactivation lifts only the bans suspension added.
 *
 * Idempotent: running it again finishes a partly applied suspension.
 */
const BAN = '876000h'; // about 100 years: until reactivated
const TAG = 'suspended_school';
const CONCURRENCY = 8;

export interface SyncResult { changed: number; skipped: number; failed: { id: string; error: string }[] }

async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function syncSchoolAccess(db: SupabaseClient, schoolId: string, suspended: boolean, exceptUserId?: string): Promise<SyncResult> {
  const { data: people, error } = await db.from('users').select('id, role').eq('school_id', schoolId);
  if (error) throw error;
  // Operators are never locked out, and neither is the operator making the change.
  const targets = (people || []).filter(p => p.role !== 'superadmin' && p.id !== exceptUserId);
  const out: SyncResult = { changed: 0, skipped: 0, failed: [] };

  await pool(targets, async p => {
    try {
      const { data, error: getErr } = await db.auth.admin.getUserById(p.id);
      if (getErr || !data.user) { out.skipped++; return; } // profile row without a login
      const tagged = data.user.app_metadata?.[TAG] === schoolId;
      const banned = !!data.user.banned_until && new Date(data.user.banned_until).getTime() > Date.now();
      if (suspended) {
        if (tagged && banned) { out.skipped++; return; }
        const { error: e } = await db.auth.admin.updateUserById(p.id, { ban_duration: BAN, app_metadata: { [TAG]: schoolId } });
        if (e) throw e;
        out.changed++;
      } else {
        if (!tagged) { out.skipped++; return; } // never lift a ban suspension didn't add
        const { error: e } = await db.auth.admin.updateUserById(p.id, { ban_duration: 'none', app_metadata: { [TAG]: null } });
        if (e) throw e;
        out.changed++;
      }
    } catch (e) {
      out.failed.push({ id: p.id, error: e instanceof Error ? e.message : 'failed' });
    }
  });
  return out;
}
