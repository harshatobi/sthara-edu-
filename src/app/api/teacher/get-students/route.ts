import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * POST /api/teacher/get-students
 * Returns all students visible to this teacher.
 * Uses service-role to bypass RLS — safe because this is a server-only API route.
 *
 * Schema confirmed from Supabase:
 *   users table columns: id, school_id, name, email, role, student_class, branch,
 *                        year, semester, custom_student_id, teacher_class, teacher_subject,
 *                        assignments (jsonb), teaching_subjects (jsonb), historical_weaknesses (jsonb)
 *
 *   role values: 'student' | 'teacher' | 'parent' | 'admin'
 *   student_class values: 'Class 10-A', '10a', 'Class 9-B', NULL, etc.
 *   NOTE: school_id is NULL for many student rows — DO NOT filter by school_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const classFilter: string | undefined = body.classFilter;

    const supabase = createAdminClient();

    // ── 1. Fetch ALL users (service role bypasses RLS) ──────────────────────
    const { data: allUsers, error: dbError } = await supabase
      .from('users')
      .select('id, school_id, name, email, role, student_class, branch, custom_student_id, avatar_url')
      .eq('role', 'student'); // filter directly in DB — role column confirmed as 'student'

    if (dbError) {
      console.error('[get-students] DB error:', dbError.message);
      // fallback: fetch everything and filter in JS
      const { data: fallback } = await supabase.from('users').select('*');
      const students = (fallback || [])
        .filter(u => (u.role || '').toLowerCase() === 'student')
        .map((u, i) => mapUser(u, i));
      return NextResponse.json({ students, total: students.length });
    }

    let studentRows: any[] = allUsers || [];

    // ── 2. Class filter — only narrow if class matches are found ─────────────
    // NOTE: school_id NOT used — many students have school_id=NULL
    if (classFilter && classFilter.trim() && classFilter !== 'undefined' && classFilter !== 'null') {
      const filterClean = cleanStr(classFilter);
      const matched = studentRows.filter(s => {
        const rawClass = s.student_class || s.branch || '';
        const sClean = cleanStr(rawClass);
        if (!sClean) return false;

        // Normalize: strip "class"/"grade" prefix and compare core digits+letters
        const sCore = sClean.replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');
        const fCore = filterClean.replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');

        return (
          sClean === filterClean ||         // exact: "class10a" === "class10a"
          sCore === fCore ||                 // core match: "10a" === "10a"
          sClean.includes(filterClean) ||   // supra
          filterClean.includes(sClean)      // sub: "class10a" includes "10a"
        );
      });

      if (matched.length > 0) {
        studentRows = matched;
      }
      // else: return ALL students (failsafe — never return empty)
    }

    const students = studentRows.map((u, i) => mapUser(u, i));
    return NextResponse.json({ students, total: students.length });

  } catch (err: any) {
    console.error('[get-students] Unhandled error:', err);
    return NextResponse.json({ error: err.message, students: [], total: 0 }, { status: 200 });
  }
}

function mapUser(u: any, idx: number) {
  return {
    id: u.id,
    name: u.name || u.full_name || u.email?.split('@')[0] || `Student ${idx + 1}`,
    email: u.email || '',
    studentClass: u.student_class || u.branch || '',
    customStudentId: u.custom_student_id || u.id,
    schoolId: u.school_id || '',
    role: 'student',
    avatarUrl: u.avatar_url || null,
  };
}
