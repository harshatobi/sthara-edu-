import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * POST /api/teacher/get-students
 *
 * Body params:
 *   teacherId?     : string   — teacher's user ID (to look up their assigned classes)
 *   teacherClasses?: string[] — explicit list of classes this teacher teaches
 *   classFilter?   : string   — currently selected class (subset of teacherClasses)
 *   schoolId?      : string   — used for context only (NOT for filtering, since school_id is often NULL on students)
 *
 * Logic:
 *   1. Fetch all users with role='student'
 *   2. If teacherClasses provided, only return students whose student_class matches one of them
 *   3. If classFilter provided on top, narrow further to that specific class
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const teacherId: string | undefined     = body.teacherId;
    const teacherClasses: string[] | undefined = body.teacherClasses;
    const classFilter: string | undefined   = body.classFilter;

    const supabase = createAdminClient();

    // ── 1. Resolve teacher's assigned classes ────────────────────────────────
    // Either passed directly from frontend (profile.assignments), or fetched by teacherId
    let allowedClasses: string[] = [];

    if (Array.isArray(teacherClasses) && teacherClasses.length > 0) {
      // Frontend passed the teacher's classes explicitly from profile.assignments
      allowedClasses = teacherClasses.map(c => c.trim()).filter(Boolean);
    } else if (teacherId && teacherId !== 'undefined' && teacherId !== 'null') {
      // Fetch teacher's row to get their assignments jsonb
      const { data: teacherRow } = await supabase
        .from('users')
        .select('assignments, teacher_class')
        .eq('id', teacherId)
        .single();

      if (teacherRow) {
        const assigns: { class: string; subject: string }[] = teacherRow.assignments || [];
        assigns.forEach(a => {
          if (a.class) allowedClasses.push(a.class.trim());
        });
        if (teacherRow.teacher_class) allowedClasses.push(teacherRow.teacher_class.trim());
      }
    }

    // Remove duplicates from allowedClasses
    allowedClasses = [...new Set(allowedClasses)];

    // ── 2. Fetch ALL students (service role bypasses RLS) ────────────────────
    const { data: allStudents, error: dbError } = await supabase
      .from('users')
      .select('id, school_id, name, email, role, student_class, branch, custom_student_id, avatar_url')
      .eq('role', 'student');

    if (dbError) {
      console.error('[get-students] DB error:', dbError.message);
      return NextResponse.json({ error: dbError.message, students: [], total: 0 }, { status: 200 });
    }

    let studentRows: any[] = allStudents || [];

    // ── 3. Filter by teacher's allowed classes ───────────────────────────────
    // Only apply if we know the teacher's classes — prevents showing ALL students
    if (allowedClasses.length > 0) {
      const allowedClean = allowedClasses.map(c => cleanStr(c));

      const filtered = studentRows.filter(s => {
        const rawClass = s.student_class || s.branch || '';
        if (!rawClass) return false; // student has no class → exclude

        const sCore = cleanStr(rawClass)
          .replace(/^class/, '')
          .replace(/^grade/, '')
          .replace(/^std/, '');

        return allowedClean.some(ac => {
          const aCore = ac
            .replace(/^class/, '')
            .replace(/^grade/, '')
            .replace(/^std/, '');

          return (
            cleanStr(rawClass) === ac ||   // exact: "class10a" === "class10a"
            sCore === aCore ||              // core: "10a" === "10a"
            ac.includes(sCore) ||          // teacher class includes student core
            sCore.includes(aCore)          // student class includes teacher core
          );
        });
      });

      // Only narrow if we found matches — failsafe: don't return empty
      if (filtered.length > 0) {
        studentRows = filtered;
      }
    }

    // ── 4. Further narrow by selected class (the dropdown value) ────────────
    if (classFilter && classFilter.trim() && classFilter !== 'undefined' && classFilter !== 'null') {
      const filterClean = cleanStr(classFilter);
      const fCore = filterClean.replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');

      const matched = studentRows.filter(s => {
        const rawClass = s.student_class || s.branch || '';
        if (!rawClass) return false;
        const sClean = cleanStr(rawClass);
        const sCore = sClean.replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');

        return (
          sClean === filterClean ||
          sCore === fCore ||
          filterClean.includes(sCore) ||
          sCore.includes(fCore)
        );
      });

      if (matched.length > 0) {
        studentRows = matched;
      }
    }

    // ── 5. Map to normalised shape ───────────────────────────────────────────
    const students = studentRows.map((u, i) => ({
      id: u.id,
      name: u.name || u.email?.split('@')[0] || `Student ${i + 1}`,
      email: u.email || '',
      studentClass: u.student_class || u.branch || '',
      customStudentId: u.custom_student_id || u.id,
      schoolId: u.school_id || '',
      role: 'student',
      avatarUrl: u.avatar_url || null,
    }));

    return NextResponse.json({ students, total: students.length });

  } catch (err: any) {
    console.error('[get-students] Unhandled error:', err);
    return NextResponse.json({ error: err.message, students: [], total: 0 }, { status: 200 });
  }
}
