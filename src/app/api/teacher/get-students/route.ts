import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/get-students
 * Body: { schoolId, classFilter?: string }
 * Returns all students for a school (or filtered by class/branch).
 * Uses admin client to bypass RLS.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const schoolId = body.schoolId;

    const supabase = createAdminClient();

    // 1. Query by schoolId + role='student'
    let query = supabase.from('users').select('*');
    if (schoolId && schoolId !== 'all') {
      query = query.eq('school_id', schoolId);
    }
    
    let { data: rows, error } = await query.ilike('role', 'student');

    // 2. Fallback: If 0 rows found, query all student roles without strict school_id
    if (!rows || rows.length === 0) {
      const { data: fallbackRows } = await supabase
        .from('users')
        .select('*')
        .ilike('role', 'student');

      if (fallbackRows && fallbackRows.length > 0) {
        rows = fallbackRows;
      }
    }

    // 3. Second Fallback: Query all users who are not teachers or admins
    if (!rows || rows.length === 0) {
      const { data: nonAdminRows } = await supabase
        .from('users')
        .select('*')
        .neq('role', 'teacher')
        .neq('role', 'admin');

      if (nonAdminRows && nonAdminRows.length > 0) {
        rows = nonAdminRows;
      }
    }

    const classFilter = body.classFilter;

    // Apply class filter in JS — case-insensitive, bidirectional substring
    const filtered = classFilter
      ? (rows || []).filter(s => {
          const cls = (s.student_class || s.branch || '').toLowerCase().trim();
          const filter = classFilter.toLowerCase().trim();
          return cls.includes(filter) || filter.includes(cls);
        })
      : (rows || []);

    const students = filtered.map((d) => ({
      id: d.id,
      name: d.name || 'Unknown Student',
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
