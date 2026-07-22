import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/get-assignments
 * Body: { schoolId, teacherId }
 * Returns teacher's assignments with submission counts and submitted data.
 */
export async function POST(req: NextRequest) {
  try {
    const { schoolId, teacherId } = await req.json();
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    const supabase = createAdminClient();

    // Fetch assignments for this teacher
    let query = supabase
      .from('assignments')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data: assignmentRows, error: assignErr } = await query;
    if (assignErr) throw assignErr;

    if (!assignmentRows || assignmentRows.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    // For each assignment, fetch all submissions
    const assignments = await Promise.all(
      assignmentRows.map(async (a) => {
        const { data: subs, error: subErr } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', a.id);

        if (subErr) console.error('[get-assignments] subs error:', subErr);

        // Build submittedData map keyed by student_id (mirrors old Firestore shape)
        const submittedData: Record<string, any> = {};
        (subs || []).forEach((s) => {
          submittedData[s.student_id] = {
            score: s.score,
            maxScore: s.max_score,
            grade: s.grade,
            finalGrade: s.final_grade,
            aiGraded: s.ai_graded,
            aiResult: s.ai_result,
            teacherApproved: s.teacher_approved,
            imageUrls: s.image_urls,
            submissionText: s.submission_text,
            answers: s.answers,
            submittedAt: s.submitted_at,
            type: s.type,
          };
        });

        return {
          id: a.id,
          title: a.title,
          type: a.type,
          subject: a.subject,
          class: a.class,
          description: a.description,
          instructions: a.instructions,
          dueDate: a.due_date,
          questions: a.questions,
          tasks: a.tasks,
          units: a.units,
          questionPaperUrl: a.question_paper_url,
          assignedStudentIds: a.assigned_student_ids,
          totalMarks: a.total_marks,
          teacherId: a.teacher_id,
          schoolId: a.school_id,
          status: a.status,
          createdAt: new Date(a.created_at).getTime(),
          submittedData,
          submittedCount: subs?.length || 0,
        };
      })
    );

    return NextResponse.json({ assignments });
  } catch (err: any) {
    console.error('[get-assignments]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch assignments' }, { status: 500 });
  }
}
