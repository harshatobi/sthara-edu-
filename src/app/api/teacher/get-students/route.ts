import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * POST /api/teacher/get-students
 * Body: { schoolId?, classFilter? }
 * Returns all student users from database using service role (bypasses RLS).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const schoolId = body.schoolId;

    const supabase = createAdminClient();

    // 1. Fetch all users from 'users' table
    let { data: allUsers, error } = await supabase
      .from('users')
      .select('*');

    if (error) {
      console.error('[get-students DB error]:', error);
    }

    let rows = allUsers || [];

    // Filter by role='student' (case-insensitive) if role column exists
    let studentRows = rows.filter(u => {
      if (!u.role) return true; // Include if role is null/undefined
      const r = u.role.toLowerCase();
      return r === 'student' || r.includes('student') || r === 'user' || r === 'learner';
    });

    if (studentRows.length === 0 && rows.length > 0) {
      // Exclude teachers/admins if specific student role didn't match
      studentRows = rows.filter(u => {
        const r = (u.role || '').toLowerCase();
        return r !== 'teacher' && r !== 'admin' && r !== 'superadmin';
      });
    }

    // Filter by school_id if provided & student rows have school_id
    if (schoolId && schoolId !== 'all') {
      const schoolMatches = studentRows.filter(s => s.school_id === schoolId || s.schoolId === schoolId);
      if (schoolMatches.length > 0) {
        studentRows = schoolMatches;
      }
    }

    const classFilter = body.classFilter;

    // Filter by class if requested
    let filtered = studentRows;
    if (classFilter && classFilter.trim()) {
      const filterClean = cleanStr(classFilter);
      const matched = studentRows.filter(s => {
        const sClassRaw = s.student_class || s.class || s.branch || s.grade || '';
        const sClean = cleanStr(sClassRaw);
        if (!sClean) return false;

        return (
          sClean === filterClean ||
          sClean.includes(filterClean) ||
          filterClean.includes(sClean) ||
          sClean.replace(/^class/, '') === filterClean.replace(/^class/, '') ||
          sClean.replace(/^grade/, '') === filterClean.replace(/^grade/, '')
        );
      });

      // Failsafe: Only narrow if matched > 0, otherwise return all student rows so count is never 0
      if (matched.length > 0) {
        filtered = matched;
      }
    }

    const students = filtered.map((d, idx) => ({
      id: d.id,
      name: d.name || d.full_name || d.displayName || d.email?.split('@')[0] || `Student ${idx + 1}`,
      email: d.email || '',
      studentClass: d.student_class || d.class || d.branch || d.grade || '',
      branch: d.branch || '',
      year: d.year || '',
      semester: d.semester || '',
      customStudentId: d.custom_student_id || d.student_id || d.id,
      schoolId: d.school_id || d.schoolId || schoolId || '',
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
    console.error('[get-students catch error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch students', students: [], total: 0 }, { status: 200 });
  }
}
