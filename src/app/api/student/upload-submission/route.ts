import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { CAPTURE_PREFIX, capturePath } from '@/lib/grading/handwritten';
import { BUCKET, MAX_PAGE_BYTES, ensureBucket, studentOnRoster } from '@/lib/grading/server';
import { MAX_QUESTIONS } from '@/lib/teacher/questions';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/student/upload-submission  (multipart: file, assignmentId, pageIndex)
 * A student's photo answer to one question of a typed assignment. Stored in the
 * private "captures" bucket like photographed work (minors' work is never on a
 * public URL); staff see it through short-lived links from /api/grading/pages.
 * The browser has already compressed it to a JPEG.
 * Returns { url: "captures:<path>" }, the value kept in submissions.answers.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return NextResponse.json({ error: authErr, code: blocked }, { status: 403 });
  if (!user || authErr) return bad('Unauthorized', 401);
  if (user.role !== 'student') return bad('Only students upload answers here.', 403);
  if (!checkRateLimit(`capture-page:${user.id}`, ...limitOf('capturePage')).allowed) return bad('Too many photos in a short time. Wait a minute.', 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const assignmentId = form?.get('assignmentId');
  const q = Number(form?.get('pageIndex'));
  if (!(file instanceof File) || !isUuid(assignmentId) || !Number.isInteger(q) || q < 0 || q >= MAX_QUESTIONS) return bad('Missing photo or details.');
  if (file.type !== 'image/jpeg' || file.size > MAX_PAGE_BYTES) return bad('Each photo must be a JPEG under 3 MB.');

  const db = createAdminClient();
  const { data: a } = await db.from('assignments').select('id, school_id, class, status, assigned_student_ids').eq('id', assignmentId).maybeSingle();
  if (!a || a.status === 'draft') return bad('Assignment not found.', 404);
  if (!(await studentOnRoster(db, a, user.id))) return bad('This assignment was not set for you.', 403);

  try {
    await ensureBucket(db);
    const path = capturePath(a.school_id, a.id, user.id, q + 1);
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return NextResponse.json({ url: `${CAPTURE_PREFIX}${path}` });
  } catch (e: any) {
    console.error('[upload-submission]', e?.message);
    return bad('The photo didn’t upload. Try again.', 502);
  }
}
