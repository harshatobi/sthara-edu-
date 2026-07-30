import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/delete-user
 * Body: { userId, schoolId }
 * Deletes a user from auth AND the users table using service role (bypasses RLS).
 * Requires the requester to be an admin of that school.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { userId, schoolId } = await request.json();
    if (!userId || !schoolId) {
      return NextResponse.json({ error: 'userId and schoolId are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify requesting user is admin of this school
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!requestingUser || requestingUser.school_id !== schoolId || !['admin', 'superadmin'].includes(requestingUser.role)) {
      return NextResponse.json({ error: 'Forbidden: must be school admin' }, { status: 403 });
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Verify target user belongs to same school
    const { data: targetUser } = await supabase
      .from('users')
      .select('id, school_id, name, role')
      .eq('id', userId)
      .eq('school_id', schoolId)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found in this school' }, { status: 404 });
    }

    // Delete from users table first
    const { error: dbErr } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (dbErr) throw dbErr;

    // Delete from Supabase Auth (using admin API)
    const { error: authDeleteErr } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteErr) {
      console.warn('[delete-user] Auth delete warning (user removed from DB):', authDeleteErr.message);
      // Don't throw — DB record is removed, auth will be orphaned but that's OK
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${targetUser.name || 'user'} (${targetUser.role})`,
    });

  } catch (err: any) {
    console.error('[delete-user] Error:', err);
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
