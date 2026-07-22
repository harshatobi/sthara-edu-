import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/get-students
 * Body: { schoolId, classFilter?: string }
 * Returns all students for a school (or filtered by class/branch).
 */
export async function POST(req: NextRequest) {
  try {
    const { schoolId, classFilter } = await req.json();
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    const supabase = createAdminClient();

    let query = supabase
      .from('users')
      .select('*')
      .eq('school_id', schoolId)
      .eq('role', 'student');

    if (classFilter) {
      // filter by student_class OR branch
      query = query.or(`student_class.eq.${classFilter},branch.eq.${classFilter}`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const students = (rows || []).map((d) => ({
      id: d.id,
      name: d.name || 'Unknown',
      email: d.email || '',
      studentClass: d.student_class || d.branch || '',
      branch: d.branch || '',
      year: d.year || '',
      semester: d.semester || '',
      customStudentId: d.custom_student_id || '',
      schoolId: d.school_id || schoolId,
      role: d.role || 'student',
      weakTopics: d.metadata?.weakTopics || [],
      strongTopics: d.metadata?.strongTopics || [],
      historicalWeaknesses: d.historical_weaknesses || [],
      energyLevel: d.metadata?.energyLevel || null,
      wellnessLastCheck: d.metadata?.wellnessLastCheck || null,
      averageScore: d.metadata?.averageScore || null,
      masteryScore: d.metadata?.masteryScore || null,
    }));

    return NextResponse.json({ students, total: students.length });
  } catch (err: any) {
    console.error('[get-students]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch students' }, { status: 500 });
  }
}
