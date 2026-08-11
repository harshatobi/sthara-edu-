import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/teacher/debug-db
 * Shows EXACTLY what's in the users table — all columns, all rows.
 * REMOVE THIS FILE AFTER DEBUGGING.
 */
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const result: Record<string, any> = {};

  // 1. ALL rows from users table — no filter
  const { data: allUsers, error: usersErr } = await supabase
    .from('users')
    .select('*');
  result.users_all = {
    count: allUsers?.length ?? 0,
    error: usersErr?.message,
    columns: allUsers && allUsers[0] ? Object.keys(allUsers[0]) : [],
    rows: allUsers
  };

  // 2. auth.users — get role from metadata
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
  result.auth_users = {
    count: authData?.users?.length ?? 0,
    error: authErr?.message,
    rows: authData?.users?.map(u => ({
      id: u.id,
      email: u.email,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata,
    }))
  };

  // 3. classes table
  const { data: classesData } = await supabase.from('classes').select('*').limit(20);
  result.classes = { count: classesData?.length ?? 0, rows: classesData };

  // 4. assignments — to see what class values look like
  const { data: assignData } = await supabase.from('assignments').select('class, subject, teacher_id').limit(10);
  result.assignments_sample = assignData;

  return NextResponse.json(result, { status: 200 });
}
