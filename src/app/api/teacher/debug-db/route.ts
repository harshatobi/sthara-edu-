import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/teacher/debug-db
 * Diagnostic endpoint — shows EXACTLY what tables exist and their raw data.
 * REMOVE THIS FILE AFTER DEBUGGING.
 */
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const results: Record<string, any> = {};

  // 1. Try 'users' table
  const { data: usersData, error: usersError } = await supabase
    .from('users')
    .select('*')
    .limit(5);
  results.users_table = { rows: usersData, error: usersError?.message, count: usersData?.length ?? 0 };

  // 2. Try 'profiles' table (common alternative)
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);
  results.profiles_table = { rows: profilesData, error: profilesError?.message, count: profilesData?.length ?? 0 };

  // 3. Try 'students' table (some schools use separate table)
  const { data: studentsData, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .limit(5);
  results.students_table = { rows: studentsData, error: studentsError?.message, count: studentsData?.length ?? 0 };

  // 4. Check what columns exist in 'users' by getting first row
  if (usersData && usersData.length > 0) {
    results.users_columns = Object.keys(usersData[0]);
    results.first_user_raw = usersData[0];
  }

  // 5. Check what columns exist in 'profiles' by getting first row
  if (profilesData && profilesData.length > 0) {
    results.profiles_columns = Object.keys(profilesData[0]);
    results.first_profile_raw = profilesData[0];
  }

  // 6. Try auth.users via admin API to see ALL registered accounts
  const { data: authUsersData, error: authError } = await supabase.auth.admin.listUsers();
  results.auth_users = {
    count: authUsersData?.users?.length ?? 0,
    error: authError?.message,
    sample: authUsersData?.users?.slice(0, 3).map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata,
    }))
  };

  // 7. Check assignments table for student references
  const { data: assignData, error: assignError } = await supabase
    .from('assignments')
    .select('class, subject, teacher_id')
    .limit(5);
  results.assignments_sample = { rows: assignData, error: assignError?.message };

  return NextResponse.json(results, { status: 200 });
}
