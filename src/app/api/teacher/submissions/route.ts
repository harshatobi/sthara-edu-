import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { staffCanGrade } from '@/lib/grading/access';
import { BUCKET } from '@/lib/grading/server';
import { CAPTURE_PREFIX } from '@/lib/grading/handwritten';
import { computeStudentTml } from '@/lib/tml/engine';
import { notifyGuardians } from '@/lib/parent/notify';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const reasonOf = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '');

async function load(req: NextRequest, id: unknown) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth;
  const { staff, db } = auth;
  if (!isUuid(id)) return { res: bad('Unknown submission.', 404) };
  const { data: sub } = await db.from('submissions').select('*').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  if (!sub) return { res: bad('Unknown submission.', 404) };
  const { data: a } = await db.from('assignments').select('*').eq('id', sub.assignment_id).maybeSingle();
  if (!a || !staffCanGrade({ id: staff.id, role: staff.role, schoolId: staff.schoolId, name: staff.name, scope: staff.scope }, a)) return { res: bad('Unknown submission.', 404) };
  return { staff, db, sub, a };
}

/** Appends a reversal to the submission's history (kept in ai_result, so the trail survives reopen / re-read). */
const withHistory = (aiResult: any, entry: Record<string, unknown>) => {
  const base = aiResult && typeof aiResult === 'object' ? aiResult : {};
  return { ...base, history: [...(Array.isArray(base.history) ? base.history : []), entry].slice(-20) };
};

/**
 * PATCH /api/teacher/submissions { submissionId, action: 'reopen', reason }
 * Reverses a confirmed grade: back to "to review", marks withdrawn from TML (the
 * confirmed evidence rows are removed and TML recomputed), the confirmed marks and
 * the reason kept in the history. The database audit trigger records the change.
 */
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const ctx = await load(req, b?.submissionId);
  if ('res' in ctx) return ctx.res;
  const { staff, db, sub, a } = ctx;
  if (b?.action !== 'reopen') return bad('Unknown action.');
  const reason = reasonOf(b?.reason);
  if (reason.length < 3) return bad('Say why the grade is being reopened.');
  if (sub.teacher_approved !== true) return bad('This work isn’t confirmed yet: it is already open for review.', 409);

  const { data: items } = await db.from('submission_items').select('question_index, score').eq('submission_id', sub.id).eq('teacher_confirmed', true);
  const entry = {
    action: 'reopened', by: staff.id, byName: staff.name, at: new Date().toISOString(), reason,
    previous: { score: sub.score, max: sub.max_score, note: sub.teacher_note, marks: (items || []).sort((x, y) => x.question_index - y.question_index).map(x => Number(x.score)) },
  };
  const aiResult = withHistory(sub.ai_result, entry);
  if (aiResult.review) delete aiResult.review;
  const { error } = await db.from('submissions').update({
    teacher_approved: null, score: null, grade: null, final_grade: null, ai_result: aiResult,
  }).eq('id', sub.id);
  if (error) { console.error('[submissions reopen]', error.message); return bad('Could not reopen the grade.', 500); }
  await db.from('submission_items').delete().eq('submission_id', sub.id);
  try { await computeStudentTml(db, sub.student_id, a.subject || undefined); } catch (e: any) { console.error('[submissions reopen] TML:', e?.message); }

  await db.from('notifications').insert({
    school_id: sub.school_id, student_id: sub.student_id, user_id: sub.student_id, type: 'grade_reopened',
    title: `Being re-checked: ${a.title}`, body: `${staff.name} is reviewing your mark again. It doesn't count until they confirm it.`, metadata: { submissionId: sub.id },
  });
  await notifyGuardians(db, {
    schoolId: sub.school_id, studentId: sub.student_id, pref: 'grades', type: 'grade_reopened',
    title: `A grade is being re-checked: ${a.title}`, body: `${staff.name} reopened the mark for review. The earlier mark no longer counts until it is confirmed again.`,
    metadata: { submissionId: sub.id },
  });
  return NextResponse.json({ ok: true, state: 'pending' });
}

/**
 * DELETE /api/teacher/submissions { submissionId, reason }
 * Removes work that is still waiting for review: a wrong capture (wrong student,
 * blurred pages) is discarded; work the student sent is returned so they can
 * hand it in again. Confirmed work must be reopened first. Photos are deleted.
 */
export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const ctx = await load(req, b?.submissionId);
  if ('res' in ctx) return ctx.res;
  const { staff, db, sub, a } = ctx;
  const reason = reasonOf(b?.reason);
  if (reason.length < 3) return bad('Say why this work is being removed.');
  if (sub.teacher_approved === true) return bad('This work is graded. Reopen it for review first.', 409);

  const fromStudent = (sub.ai_result as any)?.source !== 'teacher_capture';
  const paths = (Array.isArray(sub.image_urls) ? sub.image_urls : []).filter((u: string) => u.startsWith(CAPTURE_PREFIX)).map((u: string) => u.slice(CAPTURE_PREFIX.length));
  await db.from('submission_items').delete().eq('submission_id', sub.id);
  const { error } = await db.from('submissions').delete().eq('id', sub.id);
  if (error) { console.error('[submissions discard]', error.message); return bad('Could not remove the work.', 500); }
  if (paths.length) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths);
    if (rmErr) console.warn('[submissions discard] photos not removed:', rmErr.message);
  }
  if (fromStudent) {
    await db.from('notifications').insert({
      school_id: sub.school_id, student_id: sub.student_id, user_id: sub.student_id, type: 'work_returned',
      title: `Returned to you: ${a.title}`, body: `${staff.name}: ${reason}. Hand it in again.`, metadata: { assignmentId: a.id },
    });
  }
  return NextResponse.json({ ok: true, removed: true, returnedToStudent: fromStudent });
}
