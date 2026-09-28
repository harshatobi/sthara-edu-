import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf, type RateLimitKey } from '@/lib/settings/limits';
import { accessOf } from '@/lib/admin/serverAuth';
import type { Access } from '@/lib/admin/rbac';
import { normClass, teachingScope, type ScopeEntry } from '@/lib/teacher/scope';

export interface FeedCaller {
  id: string;
  name: string;
  role: 'teacher' | 'admin';
  schoolId: string;
  /** Teachers: the classes they teach. */
  scope: ScopeEntry[];
  /** Their class-teacher class, normalised ('' if none). */
  classTeacherOf: string;
  /** Office staff: their office roles (teachers get none). */
  access: Access | null;
}

/** Teacher or office staff calling a feed route; role, school and scope come from the database. */
export async function requireFeedCaller(req: NextRequest, limit: RateLimitKey = 'feed'): Promise<{ me: FeedCaller; db: SupabaseClient } | { res: NextResponse }> {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!checkRateLimit(`${limit}:${user.id}`, ...limitOf(limit)).allowed) {
    return { res: NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 }) };
  }
  const db = createAdminClient();
  const me = await callerById(db, user.id);
  if (!me) return { res: NextResponse.json({ error: 'Only teachers and school staff can do this.' }, { status: 403 }) };
  return { db, me };
}

/**
 * A teacher or office account by id (WhatsApp has no session token, only the linked
 * number's user). Null for anyone else. Role, school, scope and grants come from the database.
 */
export async function callerById(db: SupabaseClient, userId: string): Promise<FeedCaller | null> {
  const { data: row } = await db.from('users').select('id, name, role, school_id, assignments, teacher_class, teacher_subject').eq('id', userId).maybeSingle();
  if (!row || (row.role !== 'teacher' && row.role !== 'admin') || !row.school_id) return null;
  const access = row.role === 'admin' ? await accessOf(db, row.id, row.school_id) : null;
  return {
    id: row.id, name: row.name || 'Staff', role: row.role, schoolId: row.school_id,
    scope: row.role === 'teacher' ? teachingScope(row) : [], classTeacherOf: row.role === 'teacher' ? normClass(row.teacher_class) : '', access,
  };
}

/** School leadership (school admin, principal, vice principal): may ask the School OS about the whole school. */
export const isLeadership = (me: FeedCaller) => !!me.access?.can('os.ask');
/** Who may use Sthara on WhatsApp as staff: every teacher, and school leadership. */
export const mayUseStaffWhatsApp = (me: FeedCaller) => me.role === 'teacher' || isLeadership(me);

export const teaches = (me: FeedCaller, className: string | null | undefined) =>
  !!normClass(className) && me.scope.some(e => normClass(e.cls) === normClass(className));

export const canManageIncidents = (me: FeedCaller) => !!me.access?.can('incidents.manage');
export const canReadSchoolFeed = (me: FeedCaller) => !!me.access?.any('feed.read', 'incidents.manage', 'safeguarding.read');

/** Mirrors the situations_read RLS policy for server routes. */
export function canSeeSituation(me: FeedCaller, row: { school_id: string; audience: string; teacher_id: string | null; class_name: string | null }): boolean {
  if (row.school_id !== me.schoolId) return false;
  // A student's safety disclosure: counsellor and principal only (not other incident managers).
  if (row.audience === 'safeguarding') return !!me.access?.can('safeguarding.read');
  if (canManageIncidents(me)) return true;
  if (row.audience !== 'staff') return false;
  if (me.role === 'admin') return canReadSchoolFeed(me);
  return row.teacher_id === me.id || (!row.teacher_id && teaches(me, row.class_name));
}
