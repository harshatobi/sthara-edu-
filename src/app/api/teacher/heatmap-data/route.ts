import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/heatmap-data
 * Body: { schoolId, teacherId?, classFilter?, subjectFilter? }
 * Returns students, assignments (with units[]), and submissions for the class/subject.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { schoolId, classFilter, subjectFilter } = await request.json();
    if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

    const supabase = createAdminClient();

    // Fetch students for school (include memory_profile for pre-computed scores)
    const { data: allStudents, error: studErr } = await supabase
      .from('users')
      .select('id, name, email, student_class, branch, custom_student_id, memory_profile')
      .eq('school_id', schoolId)
      .eq('role', 'student');
    if (studErr) throw studErr;

    const students = (allStudents || []).filter((s: any) => {
      if (!classFilter) return true;
      const cls = (s.student_class || s.branch || '').toLowerCase().trim();
      const filter = classFilter.toLowerCase().trim();
      return cls.includes(filter) || filter.includes(cls);
    });

    // Fetch THIS teacher's assignments ONLY — filtered by teacher_id (the authenticated user)
    let assignQuery = supabase
      .from('assignments')
      .select('id, title, description, subject, class, type, questions, units')
      .eq('school_id', schoolId)
      .eq('teacher_id', user.id);  // KEY FIX: only this teacher's assignments

    if (subjectFilter) {
      assignQuery = assignQuery.ilike('subject', `%${subjectFilter}%`);
    }

    const { data: assignments, error: assignErr } = await assignQuery;
    if (assignErr) throw assignErr;

    // Fetch submissions only for this teacher's assignments
    const assignmentIds = (assignments || []).map((a: any) => a.id);
    let submissions: any[] = [];
    if (assignmentIds.length > 0) {
      const { data: subs, error: subErr } = await supabase
        .from('submissions')
        .select('id, student_id, assignment_id, score, max_score, teacher_approved')
        .in('assignment_id', assignmentIds);
      if (subErr) throw subErr;
      // Only show teacher-approved (or not rejected) submissions
      submissions = (subs || []).filter((s: any) => s.teacher_approved !== false);
    }

    return NextResponse.json({
      students: students || [],
      assignments: assignments || [],
      submissions,
    });

  } catch (err: any) {
    console.error('[teacher/heatmap-data]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
