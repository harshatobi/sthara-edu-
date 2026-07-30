import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/review-submission
 * Body: { submissionId, schoolId, teacherApproved, grade, teacherNote, overrideScore?, overrideMax? }
 * Updates teacher_approved, grade, and teacher_note on a submission using the service role.
 * Requires: Valid JWT for a teacher/admin of the school.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { submissionId, schoolId, teacherApproved, grade, teacherNote } = await request.json();

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

    const { error: updateErr } = await supabase
      .from('submissions')
      .update({
        teacher_approved: teacherApproved,
        grade: grade || null,
        teacher_note: teacherNote || null,
        final_grade: grade || null,
      })
      .eq('id', submissionId)
      .eq('school_id', schoolId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[review-submission]', err);
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}
