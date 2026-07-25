import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/create-user
 * Creates a new user (student/teacher/parent/admin) for a school.
 * Uses service role to bypass RLS on both auth and users table.
 */
export async function POST(request: NextRequest) {
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

    // ── 1. Check if auth user already exists ─────────────────────────────────
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingAuth = (listData?.users || []).find(
      u => u.email?.toLowerCase() === cleanEmail
    );

    let userId = '';

    if (existingAuth) {
      // User already exists in auth — update their password & metadata
      userId = existingAuth.id;
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
