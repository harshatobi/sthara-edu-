import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { detectProctoring } from '@/lib/feed/rules';
import { raise } from '@/lib/feed/raise';

export const dynamic = 'force-dynamic';

/**
 * POST /api/student/proctor-alert
 * Called by the student client when a tab switch is detected during a proctored quiz.
 * Stores the alert and optionally sends a real-time notification to the teacher.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { studentId, studentName, taskId, taskTitle, switchCount, timestamp } = body;

    if (!studentId || !taskId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (user.id !== studentId) {
      return NextResponse.json({ error: 'Forbidden: can only report your own proctoring alerts' }, { status: 403 });
    }

    const supabase = createAdminClient();
    // School and class come from the database, never the request body.
    const { data: me } = await supabase.from('users').select('school_id, name, student_class, role').eq('id', user.id).maybeSingle();
    if (!me?.school_id || me.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const schoolId = me.school_id;

    // 1. Log to proctor_alerts table (best-effort — table may not exist yet)
    try {
      await supabase.from('proctor_alerts').insert({
        school_id: schoolId,
        student_id: studentId,
        student_name: me.name || studentName || 'Unknown',
        assignment_id: taskId,
        assignment_title: taskTitle || 'Unknown',
        switch_count: switchCount,
        flagged_at: timestamp || new Date().toISOString(),
      });
    } catch {
      // Table may not exist — silent fail, continue to notification
    }

    // 2. Write a notification for the teacher
    // Find the assignment to get the teacher_id
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, teacher_id, title, type, subject, class, due_date, status, proctored, school_id')
      .eq('id', taskId)
      .maybeSingle();
    if (!assignment || assignment.school_id !== schoolId) return NextResponse.json({ error: 'Unknown task' }, { status: 404 });

    // 3. The situational feed item for the teacher (one per student per task; count updates).
    try {
      await raise(supabase, schoolId, detectProctoring(
        [{ id: taskId, student_id: user.id, student_name: me.name, assignment_id: taskId, assignment_title: taskTitle || assignment.title, switch_count: Number(switchCount) || 1, flagged_at: new Date().toISOString() }],
        [assignment], [{ id: user.id, name: me.name, student_class: me.student_class }],
      ));
    } catch (e: any) {
      console.warn('[proctor-alert] feed raise failed:', e?.message);
    }

    if (assignment?.teacher_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: assignment.teacher_id,
          school_id: schoolId,
          type: 'proctor_alert',
          title: `Tab switch alert: ${studentName || 'Student'}`,
          body: `${studentName || 'A student'} switched tabs ${switchCount} time(s) during "${taskTitle}". ${switchCount >= 3 ? 'Quiz has been auto-submitted.' : `${3 - switchCount} warning(s) remaining.`}`,
          metadata: { studentId, taskId, switchCount },
          created_at: new Date().toISOString(),
          read: false,
        });
      } catch {
        // notifications table may not exist — ignore
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[proctor-alert]', err);
    return NextResponse.json({ error: err.message || 'Failed to log alert' }, { status: 500 });
  }
}
