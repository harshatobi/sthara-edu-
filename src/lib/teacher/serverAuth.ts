import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { teachingScope, type ScopeEntry } from './scope';
import { accessOf } from '@/lib/admin/serverAuth';

export interface Staff {
  id: string;
  name: string;
  role: 'teacher' | 'admin';
  schoolId: string;
  scope: ScopeEntry[];
}

/**
 * Resolves the caller of a teacher route from their bearer token. Role,
 * school and teaching scope come from the database — never from the request
 * body — so a client can't post into another school or class.
 *
 * `academic` marks teaching routes (assignments, grading, lessons, AI
 * generators). Office accounts reach those only with academics.read (school
 * admin, principal, vice principal, academic coordinator); a cashier or
 * admissions officer does not become a teacher by being role='admin'.
 */
export async function requireStaff(req: NextRequest, opts: { academic?: boolean } = {}): Promise<{ staff: Staff; db: SupabaseClient } | { res: NextResponse }> {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createAdminClient();
  const { data: row } = await db.from('users')
    .select('id, name, role, school_id, assignments, teacher_class, teacher_subject')
    .eq('id', user.id).maybeSingle();
  if (!row || (row.role !== 'teacher' && row.role !== 'admin') || !row.school_id) {
    return { res: NextResponse.json({ error: 'Only teachers and school admins can do this.' }, { status: 403 }) };
  }
  if (opts.academic && row.role === 'admin' && !(await accessOf(db, row.id, row.school_id)).can('academics.read')) {
    return { res: NextResponse.json({ error: "Your role doesn't allow this (see school-wide TML and academic health). Ask a school admin." }, { status: 403 }) };
  }
  return {
    db,
    staff: { id: row.id, name: row.name || 'Teacher', role: row.role, schoolId: row.school_id, scope: teachingScope(row) },
  };
}
