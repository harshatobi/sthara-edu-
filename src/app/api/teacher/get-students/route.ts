import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Strip leading "class" / "grade" / "std" for core comparison
const core = (s: string) =>
  cleanStr(s).replace(/^class/, '').replace(/^grade/, '').replace(/^std/, '');

/**
 * POST /api/teacher/get-students
 * Fetches all student users and optionally filters by class.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const classFilter: string | undefined = body.classFilter;

    const supabase = createAdminClient();

    // ── 1. Fetch all rows from users table using select('*') ────────────────
    // Using select('*') ensures we never fail on non-existent columns (like avatar_url)
    const { data: allUsers, error: dbError } = await supabase
      .from('users')
      .select('*');

    if (dbError) {
      console.error('[get-students] DB error:', dbError.message);
      return NextResponse.json({ error: dbError.message, students: [], total: 0 }, { status: 200 });
    }

    // Filter for users whose role is student (or pupil/learner/non-teacher/non-admin/non-parent)
    let studentRows = (allUsers || []).filter(u => {
      const r = (u.role || u.user_type || u.type || '').toString().toLowerCase().trim();
      if (r === 'teacher' || r === 'admin' || r === 'superadmin' || r === 'parent') {
        return false;
      }
      return true; // include role='student' or null/empty role
    });

    // ── 2. Filter by selected class ──────────────────────────────────────────
    const cf = (classFilter || '').trim();
    if (cf && cf !== 'undefined' && cf !== 'null' && cf !== 'all') {
      const cfClean = cleanStr(cf);
      const cfCore  = core(cf);

      const matched = studentRows.filter(s => {
        const rawClass = (s.student_class || s.class || s.branch || '').trim();
        if (!rawClass) return false;

        const sc = cleanStr(rawClass);
        const scCore = core(rawClass);

        return (
          sc === cfClean ||            // exact clean match
          scCore === cfCore ||        // core match (e.g. 10a === 10a)
          cfClean.includes(scCore) || // "class10a".includes("10a")
          sc.includes(cfCore)         // "class10a".includes("10a")
        );
      });

      // If matches found for the class, use them
      if (matched.length > 0) {
        studentRows = matched;
      }
    }

    // ── 3. Map to normalised shape ───────────────────────────────────────────
    const students = studentRows.map((u, i) => ({
      id:              u.id,
      name:            u.name || u.full_name || u.email?.split('@')[0] || `Student ${i + 1}`,
      email:           u.email || '',
      studentClass:    u.student_class || u.branch || '',
      customStudentId: u.custom_student_id || u.id,
      schoolId:        u.school_id || '',
      role:            'student',
      avatarUrl:       u.avatar_url || u.avatarUrl || null,
    }));

    return NextResponse.json({ students, total: students.length });

  } catch (err: any) {
    console.error('[get-students] Unhandled error:', err);
    return NextResponse.json({ error: err.message, students: [], total: 0 }, { status: 200 });
  }
}
