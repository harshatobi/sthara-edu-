import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { studentOnRoster } from '@/lib/grading/server';
import { stripKey, variantFor } from '@/lib/studio/variants';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * GET /api/student/variant?assignment=<id>
 * The student's own version of an assignment (Studio per-student versions and A/B/C sets), without the answer key,
 * plus the gentle line about why it focuses where it does and how to show it (large print, read aloud).
 * `{ variant: null }` when they get the whole-class questions.
 */
export async function GET(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'For students only.' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('assignment');
  if (!isUuid(id)) return NextResponse.json({ error: 'Unknown assignment.' }, { status: 404 });

  const db = createAdminClient();
  const { data: a } = await db.from('assignments').select('id, school_id, class, status, assigned_student_ids').eq('id', id).maybeSingle();
  if (!a || a.status === 'draft' || !(await studentOnRoster(db, a, user.id))) return NextResponse.json({ error: 'Unknown assignment.' }, { status: 404 });

  const v = await variantFor(db, id, user.id);
  if (!v) return NextResponse.json({ variant: null });
  return NextResponse.json({ variant: { questions: stripKey(v.questions), reason: v.reason, access: v.access, label: v.label } });
}
