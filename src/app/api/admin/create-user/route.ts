import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/create-user
 * Creates a new user (student/teacher/parent/admin) for a school.
 * Requires: Valid JWT token in Authorization header
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const {
      email,
      password,
      name,
      role,
      schoolId,
      studentClass,
      branch,
      semester,
      year,
      customStudentId,
      assignments,
      linkedStudents,
    } = await request.json();

    if (!email || !password || !name || !role || !schoolId) {
      return NextResponse.json(
        { error: 'email, password, name, role, and schoolId are required' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabase = createAdminClient(); // Service role — bypasses RLS

    // ── 1. Check if user already exists by looking up the users table first.
    //    This avoids the expensive listUsers() full-scan (O(n)) and stays in the
    //    application DB layer which is fast and correctly indexed on email.
    let userId = '';
    const { data: existingDbUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingDbUser?.id) {
      // User already in DB — update their auth password & metadata
      userId = existingDbUser.id;
      await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { name: name.trim(), role, schoolId },
      });
    } else {
      // Create new auth user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: name.trim(), role, schoolId },
      });

      if (authErr || !authData?.user) {
        return NextResponse.json(
          { error: authErr?.message || 'Failed to create auth account' },
          { status: 400 }
        );
      }
      userId = authData.user.id;
    }


    // ── 2. Upsert user into users table (service role bypasses RLS) ───────────
    const { error: dbErr } = await supabase.from('users').upsert({
      id: userId,
      school_id: schoolId,
      name: name.trim(),
      email: cleanEmail,
      role,
      student_class: role === 'student' ? (studentClass || null) : null,
      branch: role === 'student' ? (branch || null) : null,
      semester: role === 'student' ? (semester || null) : null,
      year: role === 'student' ? (year || null) : null,
      custom_student_id: customStudentId || null,
      assignments: assignments || [],
      metadata: { linkedStudents: linkedStudents || [] },
    });

    if (dbErr) {
      console.error('[create-user] DB upsert error:', dbErr);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      message: `${role} account created for ${cleanEmail}`,
    });

  } catch (err: any) {
    console.error('[create-user] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
