import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/student-insights?schoolId=xxx
 * Fetches all students + their submission scores using service role (bypasses RLS).
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });

    const supabase = createAdminClient();

    // Verify admin
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!requestingUser || requestingUser.school_id !== schoolId || !['admin', 'superadmin'].includes(requestingUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch students
    const { data: studentRows, error: studErr } = await supabase
      .from('users')
      .select('id, name, email, student_class, branch, custom_student_id')
      .eq('school_id', schoolId)
      .eq('role', 'student');
    if (studErr) throw studErr;

    // Fetch submissions
    const { data: submissions, error: subErr } = await supabase
      .from('submissions')
      .select('student_id, score, max_score, teacher_approved')
      .eq('school_id', schoolId);
    if (subErr) throw subErr;

    // Build per-student stats
    const subsByStudent: Record<string, { score: number; max: number }[]> = {};
    (submissions || []).forEach(s => {
      if (s.teacher_approved === false) return;
      if (s.score === null || !s.max_score) return;
      if (!subsByStudent[s.student_id]) subsByStudent[s.student_id] = [];
      subsByStudent[s.student_id].push({ score: s.score, max: s.max_score });
    });

    const insights = (studentRows || []).map(s => {
      const subs = subsByStudent[s.id] || [];
      const totalScore = subs.reduce((a, b) => a + b.score, 0);
      const totalMax = subs.reduce((a, b) => a + b.max, 0);
      return {
        id: s.id,
        name: s.name || 'Unknown',
        email: s.email || '',
        studentClass: s.student_class || s.branch || 'Unassigned',
        avgScore: subs.length > 0 ? Math.round((totalScore / totalMax) * 100) : null,
        totalSubmissions: subs.length,
        customStudentId: s.custom_student_id,
      };
    });

    insights.sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101));
    return NextResponse.json({ insights, total: insights.length });

  } catch (err: any) {
    console.error('[admin/student-insights]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
