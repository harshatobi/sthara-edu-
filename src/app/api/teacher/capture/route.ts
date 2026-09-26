import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { CAPTURE_PREFIX, pathBelongs } from '@/lib/grading/handwritten';
import { MAX_PAGES, gradePages, storeCapture, studentOnRoster, GradingError } from '@/lib/grading/server';
import { staffCanGrade } from '@/lib/grading/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function gate(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth;
  if (!checkRateLimit(`capture-grade:${auth.staff.id}`, ...limitOf('captureGrade')).allowed) return { res: bad('That’s a lot of grading in a short time. Give it a few minutes.', 429) };
  const blocked = await aiGate(auth.staff.id);
  if (blocked) return { res: blocked };
  return auth;
}

const caller = (staff: { id: string; role: string; schoolId: string; name: string; scope: any }) =>
  ({ id: staff.id, role: staff.role, schoolId: staff.schoolId, name: staff.name, scope: staff.scope });

/**
 * POST /api/teacher/capture { assignmentId, studentId, pages: [path] }
 * A teacher photographed a student's notebook: the AI reads it and suggests
 * marks per question. Saved as the student's submission, waiting for review.
 */
export async function POST(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const b = await req.json().catch(() => null);
  const pages: string[] = Array.isArray(b?.pages) ? b.pages.filter((p: unknown) => typeof p === 'string') : [];
  if (!isUuid(b?.assignmentId) || !isUuid(b?.studentId)) return bad('Pick an assignment and a student.');
  if (!pages.length || pages.length > MAX_PAGES) return bad(`Photograph between 1 and ${MAX_PAGES} pages.`);
  const { data: a } = await db.from('assignments').select('*').eq('id', b.assignmentId).maybeSingle();
  if (!a || a.status === 'draft') return bad('Assignment not found.', 404);
  if (!staffCanGrade(caller(staff), a)) return bad('You can only grade work for classes you teach.', 403);
  const student = await studentOnRoster(db, a, b.studentId);
  if (!student) return bad('That student isn’t on this assignment.', 403);
  if (!pages.every(p => pathBelongs(p, a.school_id, a.id, student.id))) return bad('Those pages don’t belong to this student’s work.', 403);
  try {
    const grade = await gradePages(db, a, pages, { source: 'teacher_capture', capturedBy: staff.id });
    const submissionId = await storeCapture(db, a, student.id, pages, grade, { replaceApproved: false });
    return NextResponse.json({ submissionId, grade });
  } catch (e: any) {
    if (e instanceof GradingError) return bad(e.message, e.status);
    console.error('[teacher/capture]', e?.message);
    return bad('The AI couldn’t grade these pages just now. The photos are saved: try again.', 502);
  }
}

/** PATCH { submissionId } — read the saved pages again (after a model hiccup, or new questions). */
export async function PATCH(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.submissionId)) return bad('Unknown submission.', 404);
  const { data: sub } = await db.from('submissions').select('id, student_id, assignment_id, image_urls, teacher_approved, ai_result').eq('id', b.submissionId).eq('school_id', staff.schoolId).maybeSingle();
  if (!sub) return bad('Unknown submission.', 404);
  const { data: a } = await db.from('assignments').select('*').eq('id', sub.assignment_id).maybeSingle();
  if (!a || !staffCanGrade(caller(staff), a)) return bad('Unknown submission.', 404);
  if (sub.teacher_approved === true) return bad('This work is already graded. Change the marks in review instead.', 409);
  const pages = (Array.isArray(sub.image_urls) ? sub.image_urls : []).filter((u: string) => u.startsWith(CAPTURE_PREFIX)).map((u: string) => u.slice(CAPTURE_PREFIX.length));
  if (!pages.length) return bad('This submission has no stored pages to read.', 422);
  try {
    const source = (sub.ai_result as any)?.source === 'student' ? 'student' : 'teacher_capture';
    const grade = await gradePages(db, a, pages, { source, capturedBy: source === 'student' ? null : staff.id });
    await storeCapture(db, a, sub.student_id, pages, grade);
    return NextResponse.json({ submissionId: sub.id, grade });
  } catch (e: any) {
    if (e instanceof GradingError) return bad(e.message, e.status);
    console.error('[teacher/capture regrade]', e?.message);
    return bad('The AI couldn’t grade these pages just now. Try again.', 502);
  }
}
