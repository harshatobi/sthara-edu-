import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users?schoolId=xxx
 * Fetches all users for a school using service role (bypasses RLS).
 * Requires admin role.
 */
export async function GET(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });

    const supabase = createAdminClient(); // service role — bypasses RLS

    // Verify requesting user is an admin/superadmin of this school
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (
      !requestingUser ||
      requestingUser.school_id !== schoolId ||
      !['admin', 'superadmin'].includes(requestingUser.role)
    ) {
      return NextResponse.json({ error: 'Forbidden: must be school admin' }, { status: 403 });
    }

    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, name, email, role, student_class, branch, custom_student_id, assignments, metadata, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (usersErr) throw usersErr;

    return NextResponse.json({ users: users || [] });
  } catch (err: any) {
    console.error('[admin/users] Error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
