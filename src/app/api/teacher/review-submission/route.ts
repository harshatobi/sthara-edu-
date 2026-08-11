import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { computeStudentTml } from '@/lib/tml/engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/review-submission
 * Body: { submissionId, schoolId, teacherApproved, grade, teacherNote, overrideScore?, overrideMax? }
 * Updates teacher_approved, grade, and teacher_note on a submission using the service role.
 * Triggers TML re-computation to log snapshot rows in tml_scores table.
 * Requires: Valid JWT for a teacher/admin of the school.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { submissionId, schoolId, teacherApproved, grade, teacherNote, overrideScore, overrideMax } = await request.json();

    if (!submissionId || !schoolId) {
      return NextResponse.json({ error: 'submissionId and schoolId are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify requesting user is teacher/admin in this school
    const { data: reqUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!reqUser || reqUser.school_id !== schoolId || !['teacher', 'admin', 'superadmin'].includes(reqUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch existing submission record to get student_id and assignment details
    const { data: existingSub } = await supabase
      .from('submissions')
      .select('student_id, assignment_id, assignments(subject)')
      .eq('id', submissionId)
      .maybeSingle();

    // Build the update payload — always update approval/grade fields
    const updatePayload: Record<string, any> = {
      teacher_approved: teacherApproved,
      grade: grade || null,
      teacher_note: teacherNote || null,
      final_grade: grade || null,
    };

    if (overrideScore !== undefined && overrideScore !== null && overrideScore !== '') {
      updatePayload.score = parseFloat(String(overrideScore));
    }
    if (overrideMax !== undefined && overrideMax !== null && overrideMax !== '') {
      updatePayload.max_score = parseFloat(String(overrideMax));
    }

    const { error: updateErr } = await supabase
      .from('submissions')
      .update(updatePayload)
      .eq('id', submissionId)
      .eq('school_id', schoolId);

    if (updateErr) throw updateErr;

    // Update teacher_confirmed on submission_items matching submission_id
    if (teacherApproved !== undefined && teacherApproved !== null) {
      await supabase
        .from('submission_items')
        .update({ teacher_confirmed: teacherApproved })
        .eq('submission_id', submissionId);
    }

    // Trigger TML re-computation to log updated snapshot in tml_scores
    let tmlResult: any = null;
    if (existingSub?.student_id) {
      const subject = (existingSub.assignments as any)?.subject;
      try {
        tmlResult = await computeStudentTml(supabase, existingSub.student_id, subject);
      } catch (tmlErr) {
        console.error('[review-submission] TML recomputation error:', tmlErr);
      }
    }

    return NextResponse.json({
      success: true,
      submissionId,
      teacherApproved,
      tmlUpdated: !!tmlResult,
      computedTopics: tmlResult?.computedTopicsCount || 0,
    });

  } catch (err: any) {
    console.error('[review-submission]', err);
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}

