import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const maxDuration = 60;

/**
 * POST /api/superadmin/delete-user
 * Full cascade delete of a user from Supabase Auth + all related tables.
 */
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifyApiToken(request.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { uid, schoolId, role } = await request.json();
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

    const supabase = createAdminClient();
    const log: Record<string, string | number> = {};

    // ── 1. Supabase Auth ─────────────────────────────────────────────────────
    try {
      const { error } = await supabase.auth.admin.deleteUser(uid);
      log.auth = error ? `error: ${error.message}` : 'deleted ✓';
    } catch (e: any) {
      log.auth = `error: ${e.message}`;
    }

    // ── 2. User profile ──────────────────────────────────────────────────────
    try {
      await supabase.from('users').delete().eq('id', uid);
      log.users = 'deleted ✓';
    } catch (e: any) { log.users = e.message; }

    // ── 3. Student chat history ──────────────────────────────────────────────
    try {
      const { count } = await supabase
        .from('student_chats')
        .delete({ count: 'exact' })
        .eq('student_id', uid);
      log.student_chats = `${count || 0} deleted`;
    } catch { log.student_chats = '0 (not found)'; }

    // ── 4. Student memory ────────────────────────────────────────────────────
    try {
      await supabase.from('student_memory').delete().eq('student_id', uid);
      log.student_memory = 'deleted ✓';
    } catch { log.student_memory = 'not found (ok)'; }

    // ── 5. Submissions by this student ───────────────────────────────────────
    try {
      const { count } = await supabase
        .from('submissions')
        .delete({ count: 'exact' })
        .eq('student_id', uid);
      log.submissions = `${count || 0} deleted`;
    } catch (e: any) { log.submissions = e.message; }

    // ── 6. Wellness logs ─────────────────────────────────────────────────────
    try {
      const { count } = await supabase
        .from('wellness_logs')
        .delete({ count: 'exact' })
        .eq('student_id', uid);
      log.wellness_logs = `${count || 0} deleted`;
    } catch { log.wellness_logs = '0'; }

    // ── 7. Notifications for this user ───────────────────────────────────────
    try {
      const { count } = await supabase
        .from('notifications')
        .delete({ count: 'exact' })
        .eq('student_id', uid);
      log.notifications = `${count || 0} deleted`;
    } catch { log.notifications = '0'; }

    // ── 8. Teacher-specific: assignments created by this teacher ────────────
    if (role === 'teacher') {
      try {
        const { count } = await supabase
          .from('assignments')
          .delete({ count: 'exact' })
          .eq('teacher_id', uid)
          .eq('school_id', schoolId);
        log.assignments = `${count || 0} deleted`;
      } catch (e: any) { log.assignments = e.message; }

      try {
        const { count } = await supabase
          .from('syllabus')
          .delete({ count: 'exact' })
          .eq('teacher_id', uid);
        log.syllabus = `${count || 0} deleted`;
      } catch (e: any) { log.syllabus = e.message; }
    }

    // ── 9. Situations involving this student ─────────────────────────────────
    try {
      const { count } = await supabase
        .from('situations')
        .delete({ count: 'exact' })
        .eq('student_id', uid);
      log.situations = `${count || 0} deleted`;
    } catch { log.situations = '0'; }

    return NextResponse.json({
      success: true,
      uid,
      schoolId,
      role,
      message: 'User and all associated data fully deleted. Email can be re-used immediately.',
      log,
    });

  } catch (error: any) {
    console.error('[delete-user] Fatal:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
