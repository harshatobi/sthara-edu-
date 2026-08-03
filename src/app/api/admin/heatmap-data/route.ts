import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/heatmap-data
 * Returns all students, assignments, and submissions for a school
 * so the admin heatmap can compute class-level performance summaries.
 * Bypasses RLS via service role.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { schoolId } = await request.json();
    if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

    const supabase = createAdminClient();

    // Verify requester is admin/superadmin of this school
    const { data: reqUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!reqUser || reqUser.school_id !== schoolId && reqUser.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!['admin', 'superadmin'].includes(reqUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all students
    const { data: students, error: studErr } = await supabase
      .from('users')
      .select('id, name, email, student_class, branch, custom_student_id')
      .eq('school_id', schoolId)
      .eq('role', 'student');

    if (studErr) throw studErr;

    // Fetch all assignments
    const { data: assignments, error: assignErr } = await supabase
      .from('assignments')
      .select('id, title, description, subject, class, type')
      .eq('school_id', schoolId);

    if (assignErr) throw assignErr;

    // Fetch all submissions (approved only)
    const { data: submissions, error: subErr } = await supabase
      .from('submissions')
      .select('id, student_id, assignment_id, score, max_score, final_grade, ai_result, teacher_approved')
      .eq('school_id', schoolId);

    if (subErr) throw subErr;

    return NextResponse.json({
      students: students || [],
      assignments: assignments || [],
      submissions: (submissions || []).filter(s => s.teacher_approved !== false),
    });

  } catch (err: any) {
    console.error('[admin/heatmap-data]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
