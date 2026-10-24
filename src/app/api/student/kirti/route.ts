import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { studentRecord } from '@/lib/cocurricular/server';

export const dynamic = 'force-dynamic';

/** GET: the student's own house, clubs and teams, and approved Kirti (brief 06). */
export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'For students only.' }, { status: 403 });
  const db = createAdminClient();
  const { data: st } = await db.from('students').select('id, school_id').eq('user_id', user.id).maybeSingle();
  if (!st) return NextResponse.json({ record: null });
  return NextResponse.json({ record: await studentRecord(db, st.school_id, st.id, true) });
}
