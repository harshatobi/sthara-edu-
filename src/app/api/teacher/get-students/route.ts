import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const schoolId: string | undefined = body.schoolId;
    const classFilter: string | undefined = body.classFilter;

    const supabase = createAdminClient();

    // ── Step 1: Fetch ALL rows from `users` table (service role bypasses RLS) ──
    const { data: allUsers, error: dbError } = await supabase
      .from('users')
      .select('*');

    if (dbError) {
      console.error('[get-students] DB error fetching users:', dbError.message);
    }

    let rows: any[] = allUsers || [];

    // ── Step 2: Also fetch auth.users metadata for role info ──
    let authRoleMap: Record<string, string> = {};
    try {
      const { data: authData } = await supabase.auth.admin.listUsers();
      (authData?.users || []).forEach(u => {
        const role =
          u.user_metadata?.role ||
          u.user_metadata?.user_type ||
          u.user_metadata?.type ||
          u.app_metadata?.role ||
          u.app_metadata?.user_type ||
          '';
        if (role) authRoleMap[u.id] = role.toLowerCase();
      });
    } catch (e) {
      console.warn('[get-students] auth.admin.listUsers warn:', e);
    }

    // ── Step 3: Determine role for each user ──
    // Role could be in: role, user_type, type, userType columns, or auth metadata
    const getRole = (u: any): string => {
      return (
        authRoleMap[u.id] ||
        (u.role || u.user_type || u.type || u.userType || u.user_role || '').toLowerCase()
      );
    };

    // ── Step 4: Filter to students only ──
    // "student" in role field OR name contains "student" as last resort
    let studentRows = rows.filter(u => {
      const role = getRole(u);
      if (!role) return true; // no role column → include everyone, we'll refine below
      return (
        role === 'student' ||
        role.includes('student') ||
        role === 'learner' ||
        role === 'pupil'
      );
    });

    // If nothing survived the role filter, exclude known non-students
    if (studentRows.length === 0 && rows.length > 0) {
      studentRows = rows.filter(u => {
        const role = getRole(u);
        return (
          role !== 'teacher' &&
          role !== 'admin' &&
          role !== 'superadmin' &&
          role !== 'parent' &&
          role !== 'principal'
        );
      });
    }

    // Last resort: return ALL users (so it's never empty)
    if (studentRows.length === 0) {
      studentRows = rows;
    }

    // ── Step 5: School filter — only narrow if school_id exists on SOME students ──
    if (schoolId && schoolId !== 'all' && schoolId !== 'undefined' && schoolId !== 'null') {
      const schoolFiltered = studentRows.filter(s => {
        const sId = s.school_id || s.schoolId || s.school || '';
        return sId === schoolId;
      });
      // Only use school filter if it found something
      if (schoolFiltered.length > 0) {
        studentRows = schoolFiltered;
      }
      // Otherwise keep all students (school_id might be NULL on older records)
    }

    // ── Step 6: Class filter — only narrow if we actually find class matches ──
    if (classFilter && classFilter.trim() && classFilter !== 'undefined') {
      const filterClean = cleanStr(classFilter);
      const classMatched = studentRows.filter(s => {
        // Try every possible column name for class
        const rawClass =
          s.student_class ||
          s.class ||
          s.branch ||
          s.grade ||
          s.class_name ||
          s.className ||
          s.section ||
          s.std ||
          s.standard ||
          '';
        const sClean = cleanStr(rawClass);
        if (!sClean) return false;

        return (
          sClean === filterClean ||
          sClean.includes(filterClean) ||
          filterClean.includes(sClean) ||
          sClean.replace(/^class/, '') === filterClean.replace(/^class/, '') ||
          sClean.replace(/^grade/, '') === filterClean.replace(/^grade/, '') ||
          sClean.replace(/^std/, '') === filterClean.replace(/^std/, '')
        );
      });

      // ONLY apply class filter if it found students — otherwise keep all
      if (classMatched.length > 0) {
        studentRows = classMatched;
      }
    }

    // ── Step 7: Map to normalised student objects ──
    const students = studentRows.map((u, idx) => ({
      id: u.id,
      name:
        u.name ||
        u.full_name ||
        u.fullName ||
        u.display_name ||
        u.displayName ||
        (u.email ? u.email.split('@')[0] : null) ||
        `Student ${idx + 1}`,
      email: u.email || '',
      studentClass:
        u.student_class ||
        u.class ||
        u.branch ||
        u.grade ||
        u.class_name ||
        u.section ||
        '',
      branch: u.branch || '',
      customStudentId: u.custom_student_id || u.student_id || u.customStudentId || u.id,
      schoolId: u.school_id || u.schoolId || schoolId || '',
      role: getRole(u) || 'student',
      avatarUrl: u.avatar_url || u.avatarUrl || null,
    }));

    return NextResponse.json({ students, total: students.length });
  } catch (err: any) {
    console.error('[get-students] Unhandled error:', err);
    return NextResponse.json(
      { error: err.message, students: [], total: 0 },
      { status: 200 }
    );
  }
}
