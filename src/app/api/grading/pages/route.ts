import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { capturePath } from '@/lib/grading/handwritten';
import { BUCKET, MAX_PAGE_BYTES, MAX_PAGES, ensureBucket, pageLinks, studentOnRoster, GradingError } from '@/lib/grading/server';
import { callerOf, staffCanGrade } from '@/lib/grading/access';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/grading/pages  (multipart: file, assignmentId, studentId, n)
 * One photographed page into the private "captures" bucket. The student
 * uploads their own; a teacher of the class uploads for any student on the
 * roster. The browser has already compressed it to a JPEG. Returns { path }.
 */
export async function POST(req: NextRequest) {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return NextResponse.json({ error, code: blocked }, { status: 403 });
  if (!user || error) return bad('Unauthorized', 401);
  if (!checkRateLimit(`capture-page:${user.id}`, ...limitOf('capturePage')).allowed) return bad('Too many photos in a short time. Wait a minute.', 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const assignmentId = form?.get('assignmentId');
  const studentId = form?.get('studentId');
  const n = Number(form?.get('n'));
  if (!(file instanceof File) || !isUuid(assignmentId) || !isUuid(studentId) || !Number.isInteger(n) || n < 1 || n > MAX_PAGES) return bad('Missing page or details.');
  if (file.type !== 'image/jpeg' || file.size > MAX_PAGE_BYTES) return bad('Each page must be a photo under 3 MB.');

  const db = createAdminClient();
  const [me, { data: a }] = await Promise.all([callerOf(db, user.id), db.from('assignments').select('id, school_id, class, subject, teacher_id, status, assigned_student_ids').eq('id', assignmentId).maybeSingle()]);
  if (!me || !a || a.status === 'draft') return bad('Assignment not found.', 404);
  const allowed = me.role === 'student' ? me.id === studentId : staffCanGrade(me, a);
  if (!allowed) return bad('You can’t add work for this student.', 403);
  if (!(await studentOnRoster(db, a, studentId))) return bad('That student isn’t on this assignment.', 403);
  try {
    await ensureBucket(db);
    const path = capturePath(a.school_id, a.id, studentId, n);
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new GradingError('The photo didn’t upload. Try again.', 502);
    return NextResponse.json({ path });
  } catch (e: any) {
    return bad(e instanceof GradingError ? e.message : 'The photo didn’t upload. Try again.', e?.status || 500);
  }
}

/**
 * GET /api/grading/pages?submission=<id> — short-lived links to a submission's
 * pages, for its student, a verified parent, or staff who can grade it.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return bad('Unauthorized', 401);
  const id = req.nextUrl.searchParams.get('submission');
  if (!isUuid(id)) return bad('Unknown submission.', 404);
  const db = createAdminClient();
  const { data: sub } = await db.from('submissions').select('id, student_id, assignment_id, image_urls').eq('id', id).maybeSingle();
  if (!sub) return bad('Unknown submission.', 404);
  const [me, { data: a }] = await Promise.all([callerOf(db, user.id), db.from('assignments').select('id, school_id, class, subject, teacher_id').eq('id', sub.assignment_id).maybeSingle()]);
  let ok = !!me && !!a && (me.id === sub.student_id || (me.role !== 'student' && me.role !== 'parent' && staffCanGrade(me, a)));
  if (!ok && me?.role === 'parent') {
    const { data: g } = await db.from('guardians').select('id').eq('parent_id', me.id).eq('student_id', sub.student_id).eq('verified', true).maybeSingle();
    ok = !!g;
  }
  if (!ok) return bad('Unknown submission.', 404);
  return NextResponse.json({ pages: await pageLinks(db, Array.isArray(sub.image_urls) ? sub.image_urls : []) });
}
