import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export interface ParentCaller { id: string; name: string | null; schoolId: string }

/** A signed-in parent account (role and school from the database, never the request). */
export async function requireParent(req: NextRequest): Promise<{ parent: ParentCaller; db: SupabaseClient } | { res: NextResponse }> {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createAdminClient();
  const { data: row } = await db.from('users').select('id, name, role, school_id').eq('id', user.id).maybeSingle();
  if (!row || row.role !== 'parent' || !row.school_id) {
    return { res: NextResponse.json({ error: 'Only parent accounts can do this.' }, { status: 403 }) };
  }
  return { db, parent: { id: row.id, name: row.name, schoolId: row.school_id } };
}

/** Is this parent a verified guardian of this student? */
export async function guardianOf(db: SupabaseClient, parentId: string, studentId: string): Promise<boolean> {
  const { data } = await db.from('guardians').select('id').eq('parent_id', parentId).eq('student_id', studentId).eq('verified', true).maybeSingle();
  return !!data;
}
