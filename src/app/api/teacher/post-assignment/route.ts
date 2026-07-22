import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/post-assignment
 * Body: { schoolId, title, type, dueDate, description, class, subject, teacherId, teacherName, tasks?, totalMarks?, questions? }
 * Inserts a new assignment row into the assignments table.
 */
export async function POST(req: NextRequest) {
  const { user, error: authError } = await verifyApiToken(req.headers.get('authorization'));
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      schoolId,
      title,
      type,
      dueDate,
      description,
      class: assignmentClass,
      subject,
      teacherId,
      tasks,
      totalMarks,
      questions,
      assignedStudentIds,
      questionPaperUrl,
      units,
    } = body;

    if (!schoolId || !title || !teacherId) {
      return NextResponse.json({ error: 'Missing required fields: schoolId, title, teacherId' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('assignments')
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        title,
        type: type || 'homework',
        due_date: dueDate || null,
        description: description || '',
        class: assignmentClass || null,
        subject: subject || null,
        tasks: tasks || [],
        total_marks: totalMarks || null,
        questions: questions || [],
        question_paper_url: questionPaperUrl || null,
        assigned_student_ids: assignedStudentIds || [],
        units: units || [],
        status: 'published',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    console.error('[post-assignment]', err);
    return NextResponse.json({ error: err.message || 'Failed to post assignment' }, { status: 500 });
  }
}
