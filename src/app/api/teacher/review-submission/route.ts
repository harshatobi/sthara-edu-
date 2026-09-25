import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { marksOf, sanitizeQuestions } from '@/lib/teacher/questions';
import { normalizeComponentType, computeStudentTml, evidenceTopicName } from '@/lib/tml/engine';
import { notifyGuardians } from '@/lib/parent/notify';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/review-submission
 * { submissionId, questionScores?: (number)[], score?: number, note?: string }
 *
 * The teacher's confirmed grade. Typed work is marked per question
 * (questionScores, one entry per question, each 0..marks); handwritten work
 * gets one overall score (0..max). Either way the submission becomes
 * teacher-approved, its evidence rows (submission_items) are rewritten to
 * match what the teacher confirmed, TML is recomputed, and the student is
 * notified. Re-reviewing an approved submission is an amendment (audited by
 * the database trigger on submissions).
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === 'string' ? body.submissionId : '';
  if (!submissionId) return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });

  const { data: sub } = await db.from('submissions')
    .select('id, student_id, school_id, assignment_id, max_score, teacher_approved')
    .eq('id', submissionId).eq('school_id', staff.schoolId).maybeSingle();
  if (!sub) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  const { data: a } = await db.from('assignments')
    .select('id, title, type, class, subject, teacher_id, questions, total_marks, submission_mode, units')
    .eq('id', sub.assignment_id).maybeSingle();
  if (!a) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  if (staff.role === 'teacher' && a.teacher_id !== staff.id && !inScope(staff.scope, a.class, a.subject)) {
    return NextResponse.json({ error: 'You can only review work for classes you teach.' }, { status: 403 });
  }

  const { questions } = sanitizeQuestions(a.questions);
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 4000) : '';
  const component = normalizeComponentType(a.type) === 'quiz' ? 'quiz' : 'homework';

  let score: number;
  let max: number;
  let items: { question_index: number; score: number; max_score: number }[] = [];

  if (Array.isArray(body?.questionScores)) {
    if (!questions.length || body.questionScores.length !== questions.length) {
      return NextResponse.json({ error: 'Give a mark for every question.' }, { status: 400 });
    }
    for (const [i, q] of questions.entries()) {
      const v = Number(body.questionScores[i]);
      const m = marksOf(q);
      if (!Number.isFinite(v) || v < 0 || v > m) return NextResponse.json({ error: `Question ${i + 1}: mark must be between 0 and ${m}.` }, { status: 400 });
      items.push({ question_index: i, score: v, max_score: m });
    }
    score = items.reduce((n, x) => n + x.score, 0);
    max = items.reduce((n, x) => n + x.max_score, 0);
  } else {
    max = Number(sub.max_score ?? a.total_marks) || (questions.length ? questions.reduce((n, q) => n + marksOf(q), 0) : 10);
    score = Number(body?.score);
    if (!Number.isFinite(score) || score < 0 || score > max) return NextResponse.json({ error: `Score must be between 0 and ${max}.` }, { status: 400 });
    // One overall mark: a single evidence row stands for the whole submission.
    items = [{ question_index: 0, score, max_score: max }];
  }

  const { error: upErr } = await db.from('submissions').update({
    score, max_score: max, grade: `${score}/${max}`, final_grade: `${score}/${max}`,
    teacher_approved: true, teacher_note: note || null,
  }).eq('id', sub.id);
  if (upErr) {
    console.error('[review-submission] update failed:', upErr.message);
    return NextResponse.json({ error: 'Could not save the grade.' }, { status: 500 });
  }

  // Evidence the TML engine reads: replace whatever the auto-grader wrote.
  await db.from('submission_items').delete().eq('submission_id', sub.id);
  const { error: itemsErr } = await db.from('submission_items').insert(items.map(x => ({
    ...x, submission_id: sub.id, assignment_id: a.id, student_id: sub.student_id, school_id: sub.school_id,
    component_type: component, teacher_confirmed: true,
  })));
  if (itemsErr) console.error('[review-submission] items insert failed:', itemsErr.message);

  const amended = sub.teacher_approved === true;
  await db.from('notifications').insert({
    school_id: sub.school_id, student_id: sub.student_id, user_id: sub.student_id, type: 'grade',
    title: amended ? `Grade updated: ${a.title}` : `Graded: ${a.title}`,
    body: `${staff.name} ${amended ? 'updated' : 'confirmed'} your mark: ${score}/${max}.${note ? ` "${note.slice(0, 140)}"` : ''}`,
    metadata: { assignmentId: a.id, submissionId: sub.id },
  }).then(({ error }) => { if (error) console.warn('[review-submission] notification failed:', error.message); });

  let tmlUpdated = false;
  try { tmlUpdated = !!(await computeStudentTml(db, sub.student_id, a.subject || undefined)); }
  catch (e: any) { console.error('[review-submission] TML recompute failed:', e?.message); }

  // Parents: the grade (in-app + WhatsApp if they opted in), and the TML spec's
  // Severe Need rule — a topic newly under 35% is logged to the parent's WhatsApp.
  const { data: kid } = await db.from('users').select('name').eq('id', sub.student_id).maybeSingle();
  const first = kid?.name?.split(' ')[0] || 'Your child';
  const kind = a.type === 'quiz' ? 'quiz' : a.type === 'classwork' ? 'classwork' : 'homework';
  await notifyGuardians(db, {
    schoolId: sub.school_id, studentId: sub.student_id, pref: 'grades', type: 'grade',
    title: `${first}'s ${a.subject || ''} ${kind} ${amended ? 're-graded' : 'graded'}: ${score}/${max}`.replace(/\s+/g, ' '),
    body: `"${a.title}", marked by ${staff.name}.${note ? ` Teacher's note: "${note.slice(0, 200)}"` : ''}`,
    metadata: { assignmentId: a.id, submissionId: sub.id },
    whatsapp: `*${first}*'s ${a.subject || ''} ${kind} "${a.title}" was ${amended ? 're-graded' : 'graded'} by ${staff.name}: *${score}/${max}*.${note ? `\nTeacher's note: "${note.slice(0, 300)}"` : ''}\n\nReply to ask what this means or how to help at home.`,
  });
  if (tmlUpdated) {
    const topic = evidenceTopicName(a);
    const { data: snaps } = await db.from('tml_scores').select('score, confidence_band').eq('student_id', sub.student_id)
      .eq('topic_name', topic).ilike('subject', a.subject || '%').order('computed_at', { ascending: false }).limit(2);
    const [now, before] = snaps || [];
    if (now && Number(now.score) < 35 && now.confidence_band !== 'insufficient' && (!before || Number(before.score) >= 35)) {
      await notifyGuardians(db, {
        schoolId: sub.school_id, studentId: sub.student_id, pref: 'alerts', type: 'tml_alert',
        title: `${first} needs support in ${topic}`,
        body: `Mastery of ${topic} (${a.subject}) is ${Math.round(Number(now.score))}%. The school is setting a remediation plan.`,
        metadata: { topic, subject: a.subject, score: Number(now.score) },
        whatsapp: `*${first}* needs support in *${topic}* (${a.subject}): mastery is ${Math.round(Number(now.score))}%, in the "severe need" band. The school is setting a remediation plan with ${staff.name}.\n\nReply "how can I help at home?" for 15-minute ideas, or "message the teacher".`,
      });
    }
  }

  return NextResponse.json({ success: true, score, max, amended, tmlUpdated });
}
