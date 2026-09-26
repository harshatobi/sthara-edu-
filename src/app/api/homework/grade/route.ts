import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { pathBelongs } from '@/lib/grading/handwritten';
import { MAX_PAGES, gradePages, storeCapture, studentOnRoster, GradingError } from '@/lib/grading/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/homework/grade { assignmentId, pages: [path] }
 * A student hands in photographed work (pages uploaded first via
 * /api/grading/pages). The AI reads it and suggests marks for the teacher;
 * the student sees "submitted" until the teacher confirms.
 */
export async function POST(req: NextRequest) {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return NextResponse.json({ error, code: blocked }, { status: 403 });
  if (!user || error) return bad('Unauthorized', 401);
  const rl = checkRateLimit(`homework-grade:${user.id}`, ...limitOf('homeworkGrade'));
  if (!rl.allowed) return NextResponse.json({ error: 'Too many submissions. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } });

  const b = await req.json().catch(() => null);
  const pages: string[] = Array.isArray(b?.pages) ? b.pages.filter((p: unknown) => typeof p === 'string') : [];
  if (!isUuid(b?.assignmentId)) return bad('assignmentId is required');
  if (!pages.length || pages.length > MAX_PAGES) return bad(`Add between 1 and ${MAX_PAGES} pages.`);

  const db = createAdminClient();
  const [{ data: me }, { data: a }] = await Promise.all([
    db.from('users').select('role, school_id').eq('id', user.id).maybeSingle(),
    db.from('assignments').select('*').eq('id', b.assignmentId).maybeSingle(),
  ]);
  if (me?.role !== 'student') return bad('Only students submit homework.', 403);
  if (!a || a.status === 'draft') return bad('Assignment not found.', 404);
  if (!(await studentOnRoster(db, a, user.id))) return bad('This assignment isn’t set for you.', 403);
  const { data: already } = await db.from('submissions').select('id').eq('assignment_id', a.id).eq('student_id', user.id).maybeSingle();
  if (already) return bad('You have already submitted this assignment.', 409);
  if (!pages.every(p => pathBelongs(p, a.school_id, a.id, user.id))) return bad('Those pages aren’t yours.', 403);

  // Without the AI (paused, or it fails to read the pages) the work is still handed in,
  // with its pages, for the teacher to mark by hand or re-run from review.
  const handIn = async () => {
    const { error: insErr } = await db.from('submissions').insert({
      assignment_id: a.id, student_id: user.id, school_id: a.school_id, type: 'handwritten', answers: {},
      image_urls: pages.map(p => `captures:${p}`), submitted_at: new Date().toISOString(), teacher_approved: null,
    });
    if (insErr) return bad(insErr.code === '23505' ? 'You have already submitted this assignment.' : 'Could not hand in your work. Try again.', insErr.code === '23505' ? 409 : 500);
    return NextResponse.json({ success: true, pendingReview: true, aiGraded: false });
  };
  if (await aiGate(user.id)) return handIn();
  try {
    const grade = await gradePages(db, a, pages, { source: 'student', capturedBy: null });
    const submissionId = await storeCapture(db, a, user.id, pages, grade);
    return NextResponse.json({ success: true, pendingReview: true, aiGraded: true, submissionId });
  } catch (e: any) {
    if (e instanceof GradingError && e.status < 500) return bad(e.message, e.status);
    console.error('[homework/grade] AI read failed, handing in for manual marking:', e?.message);
    return handIn();
  }
}
