import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/delete-assignment
 * Body: { assignmentId, schoolId }
 * Deletes an assignment and all its submissions using the service role.
 * Requires: Valid JWT token (teacher or admin of the school).
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { assignmentId, schoolId } = await request.json();
    if (!assignmentId || !schoolId) {
      return NextResponse.json({ error: 'assignmentId and schoolId are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify requesting user belongs to this school and is teacher/admin
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!requestingUser || requestingUser.school_id !== schoolId || !['teacher', 'admin', 'superadmin'].includes(requestingUser.role)) {
      return NextResponse.json({ error: 'Forbidden: must be a teacher or admin of this school' }, { status: 403 });
    }

    // Verify assignment belongs to the school
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, teacher_id, title')
      .eq('id', assignmentId)
      .eq('school_id', schoolId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found in this school' }, { status: 404 });
    }

    // Teachers can only delete their own assignments; admins can delete any
    if (requestingUser.role === 'teacher' && assignment.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: you can only delete your own assignments' }, { status: 403 });
    }

    // Delete submissions first (cascade safety)
    await supabase.from('submissions').delete().eq('assignment_id', assignmentId);

    // Delete the assignment
    const { error: delErr } = await supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId);

    if (delErr) throw delErr;

    return NextResponse.json({
      success: true,
      message: `Assignment "${assignment.title}" and all its submissions deleted.`,
    });

  } catch (err: any) {
    console.error('[delete-assignment]', err);
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
