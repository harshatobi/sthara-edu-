import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Strip leading "class" / "grade" / "std" for core comparison
const core = (s: string) =>
  cleanStr(s).replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');

/**
 * POST /api/teacher/get-students
 *
 * The CLASS DROPDOWN on the UI already shows only the teacher's classes
 * (populated from profile.assignments). So this API just needs to:
 *   1. Fetch all role='student' users
 *   2. If classFilter is provided, narrow to students in that class
 *
 * Note: school_id is NOT used for filtering — many students have school_id=NULL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const classFilter: string | undefined = body.classFilter;

    const supabase = createAdminClient();

    // ── 1. Fetch all students (service role bypasses RLS) ────────────────────
    const { data: allStudents, error: dbError } = await supabase
      .from('users')
      .select('id, school_id, name, email, role, student_class, branch, custom_student_id, avatar_url')
      .eq('role', 'student');

    if (dbError) {
      console.error('[get-students] DB error:', dbError.message);
      return NextResponse.json({ error: dbError.message, students: [], total: 0 }, { status: 200 });
    }

    let studentRows: any[] = allStudents || [];

    // ── 2. Filter by selected class ──────────────────────────────────────────
    // classFilter comes from the teacher's class dropdown (already scoped to their classes)
    const cf = (classFilter || '').trim();
    if (cf && cf !== 'undefined' && cf !== 'null' && cf !== 'all') {
      const cfClean = cleanStr(cf);
      const cfCore  = core(cf);

      const matched = studentRows.filter(s => {
        const rawClass = (s.student_class || s.branch || '').trim();
        if (!rawClass) return false;

        const sc = cleanStr(rawClass);
        const sc_core = core(rawClass);

        return (
          sc === cfClean ||        // exact clean match: "class10a" === "class10a"
          sc_core === cfCore ||    // core match: "10a" === "10a"
          cfClean.includes(sc_core) || // "class10a".includes("10a")
          sc.includes(cfCore)          // "class10a".includes("10a")
        );
      });

      // Only narrow if we found matches — never return empty when students exist
      if (matched.length > 0) {
        studentRows = matched;
      }
      // If 0 matched (class name mismatch): return all students so UI is never blank
    }

    // ── 3. Map to normalised shape ───────────────────────────────────────────
    const students = studentRows.map((u, i) => ({
      id:              u.id,
      name:            u.name || u.email?.split('@')[0] || `Student ${i + 1}`,
      email:           u.email || '',
      studentClass:    u.student_class || u.branch || '',
      customStudentId: u.custom_student_id || u.id,
      schoolId:        u.school_id || '',
      role:            'student',
      avatarUrl:       u.avatar_url || null,
    }));

    return NextResponse.json({ students, total: students.length });

  } catch (err: any) {
    console.error('[get-students] Unhandled error:', err);
    return NextResponse.json({ error: err.message, students: [], total: 0 }, { status: 200 });
  }
}
