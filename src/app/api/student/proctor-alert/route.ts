import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/student/proctor-alert
 * Called by the student client when a tab switch is detected during a proctored quiz.
 * Stores the alert and optionally sends a real-time notification to the teacher.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolId, studentId, studentName, taskId, taskTitle, switchCount, timestamp } = body;

    if (!schoolId || !studentId || !taskId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Log to proctor_alerts table (best-effort — table may not exist yet)
    try {
      await supabase.from('proctor_alerts').insert({
        school_id: schoolId,
        student_id: studentId,
        student_name: studentName || 'Unknown',
        assignment_id: taskId,
        assignment_title: taskTitle || 'Unknown',
        switch_count: switchCount,
        flagged_at: timestamp || new Date().toISOString(),
      });
    } catch (_) {
      // Table may not exist — silent fail, continue to notification
    }

    // 2. Write a notification for the teacher
    // Find the assignment to get the teacher_id
    const { data: assignment } = await supabase
      .from('assignments')
      .select('teacher_id')
      .eq('id', taskId)
      .maybeSingle();

    if (assignment?.teacher_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: assignment.teacher_id,
          school_id: schoolId,
          type: 'proctor_alert',
          title: `🚨 Tab Switch Alert — ${studentName || 'Student'}`,
          body: `${studentName || 'A student'} switched tabs ${switchCount} time(s) during "${taskTitle}". ${switchCount >= 3 ? 'Quiz has been auto-submitted.' : `${3 - switchCount} warning(s) remaining.`}`,
          metadata: { studentId, taskId, switchCount },
          created_at: new Date().toISOString(),
          read: false,
        });
      } catch (_) {
        // notifications table may not exist — ignore
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[proctor-alert]', err);
    return NextResponse.json({ error: err.message || 'Failed to log alert' }, { status: 500 });
  }
}
