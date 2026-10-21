import { NextResponse, type NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { createAdminClient } from '@/lib/supabase/server';
import { yearEndFor } from '@/lib/students/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/year-end — the published year-end result: a student's own, or each verified child's for a parent.
 * Nothing shows until the school publishes it (after next session's classes are set).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const { data: me } = await db.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (me?.role === 'student') return NextResponse.json({ results: [{ studentId: me.id, result: await yearEndFor(db, me.id) }] });
  if (me?.role === 'parent') {
    const { data: kids } = await db.from('guardians').select('student_id').eq('parent_id', me.id).eq('verified', true).limit(20);
    const results = await Promise.all((kids || []).map(async k => ({ studentId: k.student_id as string, result: await yearEndFor(db, k.student_id) })));
    return NextResponse.json({ results });
  }
  return NextResponse.json({ error: 'Only students and parents see this.' }, { status: 403 });
}
