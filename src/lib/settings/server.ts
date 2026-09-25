import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import {
  PLATFORM_DEFAULTS, accessBlock, resolvePlatform, schoolPolicy,
  type PlatformValues, type SchoolPolicy, type SchoolRow,
} from './registry';

/**
 * Server-side reads and gates for load-bearing settings.
 *
 * Values are cached per server instance for CACHE_MS, so a change made in the
 * console reaches every instance within that time (immediately on the instance
 * that made it, which clears its cache).
 */
export const CACHE_MS = 30_000;

let platformCache: { at: number; values: PlatformValues; stored: boolean } | null = null;
const schoolCache = new Map<string, { at: number; policy: SchoolPolicy | null }>();
const userSchoolCache = new Map<string, { at: number; role: string | null; schoolId: string | null }>();

export function invalidateSettings(schoolId?: string) {
  platformCache = null;
  if (schoolId) schoolCache.delete(schoolId); else schoolCache.clear();
  userSchoolCache.clear();
}

/**
 * Platform settings: stored overrides over code defaults. If the table can't be
 * read (not migrated yet, database blip) the defaults apply, which match how
 * the product behaved before these settings existed.
 */
export async function getPlatformSettings(db?: SupabaseClient): Promise<PlatformValues & { __stored: boolean }> {
  if (platformCache && Date.now() - platformCache.at < CACHE_MS) return { ...platformCache.values, __stored: platformCache.stored };
  let values: PlatformValues = { ...PLATFORM_DEFAULTS };
  let stored = false;
  try {
    const { data, error } = await (db ?? createAdminClient()).from('platform_config').select('key, value');
    if (!error) { values = resolvePlatform(data || []); stored = true; }
  } catch { /* no server credentials: defaults */ }
  platformCache = { at: Date.now(), values, stored };
  return { ...values, __stored: stored };
}

export async function getSchoolPolicy(schoolId: string, db?: SupabaseClient): Promise<SchoolPolicy | null> {
  const hit = schoolCache.get(schoolId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.policy;
  const { data } = await (db ?? createAdminClient()).from('schools').select('id, name, institution_type, trial_expires_at, settings').eq('id', schoolId).maybeSingle();
  const policy = data ? schoolPolicy(data as SchoolRow) : null;
  schoolCache.set(schoolId, { at: Date.now(), policy });
  return policy;
}

async function userSchool(userId: string, db: SupabaseClient) {
  const hit = userSchoolCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const { data } = await db.from('users').select('role, school_id').eq('id', userId).maybeSingle();
  const v = { at: Date.now(), role: (data?.role as string) ?? null, schoolId: (data?.school_id as string) ?? null };
  userSchoolCache.set(userId, v);
  return v;
}

/**
 * Whether a signed-in user's school lets them in (suspension, expired trial).
 * Operators and users with no school pass. Used by verifyApiToken, so every
 * authenticated API route inherits it.
 */
export async function schoolAccessBlock(role: string | null | undefined, schoolId: string | null | undefined, db?: SupabaseClient) {
  if (!schoolId || role === 'superadmin') return null;
  const p = await getSchoolPolicy(schoolId, db);
  return p ? accessBlock(p) : null;
}

/**
 * The AI gate: null when this user may call the model, or the response to send
 * when AI is paused platform-wide or for their school. Call it after
 * authenticating and before creating the model client.
 */
export async function aiGate(userId: string): Promise<NextResponse | null> {
  const db = createAdminClient();
  const platform = await getPlatformSettings(db);
  if (!platform['ai.enabled']) {
    return NextResponse.json({ error: 'AI features are paused for maintenance. Please try again later.', code: 'ai_paused' }, { status: 503 });
  }
  const u = await userSchool(userId, db);
  if (u.schoolId && u.role !== 'superadmin') {
    const p = await getSchoolPolicy(u.schoolId, db);
    if (p && !p.aiEnabled) {
      return NextResponse.json({ error: 'AI features are turned off for your school. Ask your school office.', code: 'ai_off_school' }, { status: 403 });
    }
  }
  return null;
}
