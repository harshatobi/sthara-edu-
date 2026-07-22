import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Verify parent's JWT
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 2. Fetch parent profile
    const { data: parentData, error: parentErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (parentErr || !parentData) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
    }

    const schoolId = parentData.school_id;
    const linked: string[] = parentData.metadata?.linkedStudents || [];

    if (linked.length === 0 || !schoolId) {
      return NextResponse.json({ children: [] });
    }

    // 3. Query linked students by custom_student_id
    const { data: studentRows, error: studErr } = await supabase
      .from('users')
      .select('*')
      .eq('school_id', schoolId)
      .in('custom_student_id', linked);

    if (studErr) throw studErr;

    const studentDocs = studentRows || [];

    // 4. For each student, fetch assignments + submissions + notifications + wellness
    const children = await Promise.all(studentDocs.map(async (student) => {
      const studentClass = student.student_class || '';

      // Get all assignments for this student's class
      const { data: assignRows } = await supabase
        .from('assignments')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class', studentClass);

      const assignments: any[] = [];
      const subjectScoreMap: Record<string, { sum: number; count: number }> = {};
      const recentScores: { date: string; score: number }[] = [];
      let totalScore = 0;
      let totalMax = 0;
      let submittedCount = 0;

      await Promise.all((assignRows || []).map(async (a) => {
        const task: any = {
          id: a.id,
          title: a.title,
          type: a.type,
          subject: a.subject,
          class: a.class,
          dueDate: a.due_date,
          createdAt: a.created_at,
          submitted: false,
        };

        const { data: sub } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', a.id)
          .eq('student_id', student.id)
          .single();

        if (sub) {
          task.submitted = true;
          task.score = sub.score;
          task.maxScore = sub.max_score || 10;
          task.aiGraded = sub.ai_graded;
          task.submittedAt = sub.submitted_at;
          submittedCount++;

          if (task.score !== null && task.maxScore) {
            const subj = a.subject || 'General';
            if (!subjectScoreMap[subj]) subjectScoreMap[subj] = { sum: 0, count: 0 };
            subjectScoreMap[subj].sum += (task.score / task.maxScore) * 100;
            subjectScoreMap[subj].count++;
            totalScore += task.score;
            totalMax += task.maxScore;
            const dateStr = a.due_date || new Date().toISOString().split('T')[0];
            recentScores.push({ date: dateStr, score: Math.round((task.score / task.maxScore) * 100) });
          }
        }
        assignments.push(task);
      }));

      assignments.sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime());
      recentScores.sort((a, b) => a.date.localeCompare(b.date));

      const subjectScores = Object.entries(subjectScoreMap).map(([subject, val]) => ({
        subject,
        A: Math.round(val.sum / val.count),
        fullMark: 100,
      }));

      // Notifications
      const { data: notifRows } = await supabase
        .from('notifications')
        .select('*')
        .eq('school_id', schoolId)
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });

      const notifications = (notifRows || []).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: n.created_at,
      }));

      // Wellness logs
      const { data: wellRows } = await supabase
        .from('wellness_logs')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false });

      const wellnessLogs = (wellRows || []).map((w) => ({
        id: w.id,
        mood: w.mood,
        energy: w.energy,
        note: w.note,
        createdAt: w.created_at,
      }));

      // Build milestones
      const milestones: any[] = [
        {
          id: 'attendance',
          date: 'This Term',
          title: 'Excellent Attendance',
          description: `${student.name} has maintained a consistent attendance record this term.`,
          type: 'achievement',
          icon: 'Award',
          color: 'text-purple-500',
          bgColor: 'bg-purple-100',
          borderColor: 'border-purple-200',
        },
      ];

      assignments.forEach((task) => {
        if (task.submitted) {
          const submissionDate = task.submittedAt
            ? new Date(task.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recently';
          milestones.push({
            id: `sub-${task.id}`,
            date: submissionDate,
            title: `Completed ${task.title}`,
            description: `Successfully submitted the task for ${task.subject || 'class'}.`,
            type: 'task',
            icon: 'CheckCircle2',
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-100',
            borderColor: 'border-emerald-200',
          });
          const pct = task.maxScore ? Math.round((task.score / task.maxScore) * 100) : null;
          if (pct !== null && pct >= 80) {
            milestones.push({
              id: `master-${task.id}`,
              date: submissionDate,
              title: `Mastered ${task.title}`,
              description: `Achieved an excellent score of ${task.score}/${task.maxScore} (${pct}%) in ${task.subject}.`,
              type: 'achievement',
              icon: 'Star',
              color: 'text-amber-500',
              bgColor: 'bg-amber-100',
              borderColor: 'border-amber-200',
            });
          }
        }
      });

      return {
        id: student.id,
        name: student.name || 'Student',
        studentClass,
        customStudentId: student.custom_student_id || student.id.slice(0, 6).toUpperCase(),
        assignments,
        subjectScores,
        submittedCount,
        totalCount: assignRows?.length || 0,
        avgPercent: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null,
        notifications,
        recentScores: recentScores.slice(-7),
        wellnessLogs,
        milestones,
      };
    }));

    return NextResponse.json({ success: true, children });
  } catch (err: any) {
    console.error('[get-children] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
