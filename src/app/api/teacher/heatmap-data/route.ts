import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/heatmap-data
 * Body: { schoolId, classFilter?, subjectFilter? }
 * Returns students, assignments, and submissions for the class/subject — bypasses RLS.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { schoolId, classFilter, subjectFilter } = await request.json();
    if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

    const supabase = createAdminClient();

    // Fetch all students for school
    let studQuery = supabase
      .from('users')
      .select('id, name, email, student_class, branch, custom_student_id')
      .eq('school_id', schoolId)
      .eq('role', 'student');

    const { data: allStudents, error: studErr } = await studQuery;
    if (studErr) throw studErr;

    // Filter by class (flexible matching)
    const students = (allStudents || []).filter(s => {
      if (!classFilter) return true;
      const cls = (s.student_class || s.branch || '').toLowerCase().trim();
      const filter = classFilter.toLowerCase().trim();
      return cls.includes(filter) || filter.includes(cls);
    });

    // Fetch all assignments for school
    const { data: assignments, error: assignErr } = await supabase
      .from('assignments')
      .select('id, title, description, subject, class, type, questions')
      .eq('school_id', schoolId);
    if (assignErr) throw assignErr;

    // Fetch all submissions for school
    const { data: submissions, error: subErr } = await supabase
      .from('submissions')
      .select('id, student_id, assignment_id, score, max_score, teacher_approved')
      .eq('school_id', schoolId);
    if (subErr) throw subErr;

    return NextResponse.json({
      students: students || [],
      assignments: assignments || [],
      submissions: (submissions || []).filter(s => s.teacher_approved !== false),
    });

  } catch (err: any) {
    console.error('[teacher/heatmap-data]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
