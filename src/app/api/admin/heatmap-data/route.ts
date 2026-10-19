import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { accessOf } from '@/lib/admin/serverAuth';
import { all } from '@/lib/admin/loadRows';
import { buildHeatmap } from '@/lib/admin/heatmap';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/heatmap-data
 * Returns the admin heatmap for a school: each class's average per subject over every
 * approved submission (see buildHeatmap). Bypasses RLS via service role.
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

    // Must be admin or superadmin
    if (!reqUser || !['admin', 'superadmin'].includes(reqUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Superadmins can see any school; regular admins must belong to the school
    if (reqUser.role !== 'superadmin' && reqUser.school_id !== schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (reqUser.role === 'admin') {
      const access = await accessOf(supabase, user.id, reqUser.school_id);
      if (!access.can('academics.read')) return NextResponse.json({ error: "Your role doesn't include this." }, { status: 403 });
    }

    // Every row, paged past the 1,000-row cap (a large school has tens of thousands of submissions).
    // Only the two scores are taken out of ai_result, and rejected work is left out in the database.
    const [students, assignments, submissions] = await Promise.all([
      all((a, b) => supabase.from('users').select('id, student_class, branch')
        .eq('school_id', schoolId).eq('role', 'student').order('id').range(a, b)),
      all((a, b) => supabase.from('assignments').select('id, subject')
        .eq('school_id', schoolId).order('id').range(a, b)),
      all((a, b) => supabase.from('submissions')
        .select('student_id, assignment_id, score, max_score, final_grade, ai_score:ai_result->totalScore, ai_max:ai_result->maxTotalScore')
        .eq('school_id', schoolId).or('teacher_approved.is.null,teacher_approved.eq.true').order('id').range(a, b)),
    ]);

    return NextResponse.json(buildHeatmap(students.data, assignments.data, submissions.data));

  } catch (err: any) {
    console.error('[admin/heatmap-data]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
