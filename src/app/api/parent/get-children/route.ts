import { NextResponse, NextRequest } from 'next/server';
import { admin, adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    // 1. Verify the parent's Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // 2. Fetch the parent's profile to get linkedStudents and schoolId
    let parentData: any = null;
    const guDoc = await adminDb.collection('global_users').doc(uid).get();
    if (guDoc.exists) {
      parentData = guDoc.data();
    } else {
      const uDoc = await adminDb.collection('users').doc(uid).get();
      if (uDoc.exists) {
        parentData = uDoc.data();
      }
    }

    if (!parentData) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
    }

    const schoolId = parentData.schoolId;
    const linked: string[] = parentData.linkedStudents || [];

    if (linked.length === 0 || !schoolId) {
      return NextResponse.json({ children: [] });
    }

    // 3. Query all student docs in linked array
    const studentDocs: any[] = [];
    const seenUids = new Set<string>();

    const usersSnap = await adminDb.collection('users')
      .where('schoolId', '==', schoolId)
      .where('customStudentId', 'in', linked)
      .get();
    usersSnap.forEach(d => {
      if (!seenUids.has(d.id)) {
        seenUids.add(d.id);
        studentDocs.push({ id: d.id, ...d.data() });
      }
    });

    const globalUsersSnap = await adminDb.collection('global_users')
      .where('schoolId', '==', schoolId)
      .where('customStudentId', 'in', linked)
      .get();
    globalUsersSnap.forEach(d => {
      if (!seenUids.has(d.id)) {
        seenUids.add(d.id);
        studentDocs.push({ id: d.id, ...d.data() });
      }
    });

    // 4. Fetch assignments, submissions, notifications, wellness logs for each student
    const children = await Promise.all(studentDocs.map(async (student) => {
      const studentClass = student.studentClass || '';

      // Get all assignments for this student's class
      const assignSnap = await adminDb.collection('schools')
        .doc(schoolId)
        .collection('assignments')
        .where('class', '==', studentClass)
        .get();

      const assignments: any[] = [];
      const subjectScoreMap: Record<string, { sum: number; count: number }> = {};
      const recentScores: { date: string; score: number }[] = [];
      let totalScore = 0;
      let totalMax = 0;
      let submittedCount = 0;

      await Promise.all(assignSnap.docs.map(async (aDoc) => {
        const aData = aDoc.data();
        const task: any = {
          id: aDoc.id,
          ...aData,
          createdAt: aData.createdAt?.toDate?.() || aData.createdAt,
          dueDate: aData.dueDate,
          submitted: false
        };

        try {
          const subDoc = await adminDb.collection('schools')
            .doc(schoolId)
            .collection('assignments')
            .doc(aDoc.id)
            .collection('submissions')
            .doc(student.id)
            .get();

          if (subDoc.exists) {
            const sub = subDoc.data()!;
            task.submitted = true;
            task.score = sub.score ?? sub.aiScore;
            task.maxScore = sub.maxScore || sub.total || 10;
            task.teacherNote = sub.teacherNote || sub.personalNote;
            task.aiGraded = sub.aiGraded;
            task.submittedAt = sub.submittedAt?.toDate?.() || sub.submittedAt;
            submittedCount++;

            if (task.score !== undefined && task.maxScore) {
              const subj = aData.subject || 'General';
              if (!subjectScoreMap[subj]) subjectScoreMap[subj] = { sum: 0, count: 0 };
              subjectScoreMap[subj].sum += (task.score / task.maxScore) * 100;
              subjectScoreMap[subj].count++;

              totalScore += task.score;
              totalMax += task.maxScore;

              const dateStr = aData.dueDate || new Date().toISOString().split('T')[0];
              recentScores.push({ date: dateStr, score: Math.round((task.score / task.maxScore) * 100) });
            }
          }
        } catch (e) {
          // ignore
        }
        assignments.push(task);
      }));

      // Sort assignments by due date descending
      assignments.sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime());
      
      // Sort recent scores by date ascending
      recentScores.sort((a, b) => a.date.localeCompare(b.date));

      const subjectScores = Object.entries(subjectScoreMap).map(([subject, val]) => ({
        subject,
        A: Math.round(val.sum / val.count),
        fullMark: 100,
      }));

      // Get notifications for this student
      const notifications: any[] = [];
      try {
        const notifSnap = await adminDb.collection('schools')
          .doc(schoolId)
          .collection('notifications')
          .where('studentId', '==', student.id)
          .get();

        notifSnap.forEach(d => {
          const data = d.data();
          notifications.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt
          });
        });
        notifications.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
      } catch (e) {
        // ignore
      }

      // Fetch wellness logs for this student
      const wellnessLogs: any[] = [];
      try {
        const logsSnap = await adminDb.collection('wellness_logs')
          .where('userId', '==', student.id)
          .get();

        logsSnap.forEach(d => {
          const data = d.data();
          wellnessLogs.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt
          });
        });

        // Sort by date descending
        wellnessLogs.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
      } catch (e) {
        // ignore
      }

      // Build dynamic milestones
      const milestones: any[] = [];
      
      // Baseline attendance milestone
      milestones.push({
        id: 'attendance',
        date: 'This Term',
        title: 'Excellent Attendance',
        description: `${student.name} has maintained a consistent attendance record this term.`,
        type: 'achievement',
        icon: 'Award',
        color: 'text-purple-500',
        bgColor: 'bg-purple-100',
        borderColor: 'border-purple-200'
      });

      // Add submissions as milestones
      assignments.forEach((task) => {
        if (task.submitted) {
          const submissionDate = task.submittedAt ? new Date(task.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';
          
          milestones.push({
            id: `sub-${task.id}`,
            date: submissionDate,
            title: `Completed ${task.title}`,
            description: `Successfully submitted the task for ${task.subject}. ${task.teacherNote ? `Feedback: "${task.teacherNote}"` : ''}`,
            type: 'task',
            icon: 'CheckCircle2',
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-100',
            borderColor: 'border-emerald-200'
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
              borderColor: 'border-amber-200'
            });
          }
        }
      });

      return {
        id: student.id,
        name: student.name || 'Student',
        studentClass,
        customStudentId: student.customStudentId || student.id.slice(0, 6).toUpperCase(),
        assignments,
        subjectScores,
        submittedCount,
        totalCount: assignSnap.size,
        avgPercent: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null,
        notifications,
        recentScores: recentScores.slice(-7),
        wellnessLogs,
        milestones
      };
    }));

    return NextResponse.json({ success: true, children });
  } catch (err: any) {
    console.error('[get-children] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
