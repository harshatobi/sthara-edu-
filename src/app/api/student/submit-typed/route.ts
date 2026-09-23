import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { computeStudentTml, normalizeComponentType } from '@/lib/tml/engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/student/submit-typed — { assignmentId, answers: Record<index, value> }
 *
 * Typed homework submission. Grading happens here, against the answer key in
 * the assignment row, because the database no longer lets a browser write
 * scores (grade integrity, migration 20260923120000). MCQ-only work is graded
 * instantly and counts as teacher-confirmed; anything with written answers is
 * stored ungraded for teacher review.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'Only students submit homework.' }, { status: 403 });

  const rl = checkRateLimit(`submit-typed:${user.id}`, 20, 5 * 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many submissions. Try again shortly.' }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const assignmentId = typeof body?.assignmentId === 'string' ? body.assignmentId : '';
  const answers: Record<string, unknown> = body?.answers && typeof body.answers === 'object' ? body.answers : {};
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 });

  const supabase = createAdminClient();
  const [{ data: me }, { data: a }] = await Promise.all([
    supabase.from('users').select('school_id').eq('id', user.id).maybeSingle(),
    supabase.from('assignments').select('id, school_id, subject, type, status, questions, total_marks').eq('id', assignmentId).maybeSingle(),
  ]);
  if (!a || a.status === 'draft') return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  if (!me?.school_id || me.school_id !== a.school_id) return NextResponse.json({ error: 'This assignment is not in your school.' }, { status: 403 });

  const { data: existing } = await supabase.from('submissions').select('id').eq('assignment_id', assignmentId).eq('student_id', user.id).maybeSingle();
  if (existing) return NextResponse.json({ error: 'You have already submitted this assignment.' }, { status: 409 });

  const questions: any[] = Array.isArray(a.questions) ? a.questions : [];
  const mcq = questions.map((q, i) => ({ q, i })).filter(({ q }) => q?.type === 'mcq');
  const allMcq = questions.length > 0 && mcq.length === questions.length;
  const correct = (i: number) => {
    const key = questions[i]?.answer;
    return key !== undefined && key !== null && String(answers[i]) === String(key);
  };
  const mcqScore = mcq.reduce((n, { i }) => n + (correct(i) ? 1 : 0), 0);
  const text = Object.values(answers).filter(v => typeof v === 'string').join('\n\n').slice(0, 20000) || null;

  const { data: sub, error } = await supabase.from('submissions').insert({
    assignment_id: assignmentId,
    student_id: user.id,
    school_id: me.school_id,
    answers,
    submission_text: text,
    score: allMcq ? mcqScore : null,
    max_score: allMcq ? mcq.length : (a.total_marks ?? questions.length),
    grade: allMcq ? `${mcqScore}/${mcq.length}` : null,
    ai_graded: false,
    teacher_approved: allMcq ? true : null,
    type: 'typed',
  }).select('*').single();
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: dup ? 'You have already submitted this assignment.' : 'Could not save your submission.' }, { status: dup ? 409 : 500 });
  }

  // Instantly-marked work is evidence now; anything with written answers
  // becomes evidence when the teacher confirms their marks (review-submission).
  if (allMcq) {
    const { error: itemsErr } = await supabase.from('submission_items').insert(mcq.map(({ i }) => ({
      submission_id: sub.id, assignment_id: assignmentId, student_id: user.id, school_id: me.school_id,
      question_index: i, component_type: normalizeComponentType(a.type) === 'quiz' ? 'quiz' : 'homework', score: correct(i) ? 1 : 0, max_score: 1, teacher_confirmed: true,
    })));
    if (itemsErr) console.error('[submit-typed] items insert failed:', itemsErr.message);
  }

  // New graded evidence moves TML right away; failure here never loses the submission.
  if (allMcq) {
    try { await computeStudentTml(supabase, user.id, a.subject || undefined); }
    catch (e: any) { console.error('[submit-typed] TML recompute failed:', e?.message); }
  }

  return NextResponse.json(sub);
}
