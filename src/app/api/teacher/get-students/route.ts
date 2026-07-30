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
    const { schoolId, classFilter } = await req.json();
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
      .from('users')
      .select('*')
      .eq('school_id', schoolId)
      .eq('role', 'student');

    if (error) throw error;

    // Apply class filter in JS — case-insensitive, bidirectional substring
    // This handles mismatches like "B.Com II Year" vs "b.com ii year"
    const filtered = classFilter
      ? (rows || []).filter(s => {
          const cls = (s.student_class || s.branch || '').toLowerCase().trim();
          const filter = classFilter.toLowerCase().trim();
          return cls.includes(filter) || filter.includes(cls);
        })
      : (rows || []);

    const students = filtered.map((d) => ({
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
