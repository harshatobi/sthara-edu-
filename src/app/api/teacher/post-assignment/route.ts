import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/teacher/post-assignment
 * Body: { schoolId, title, type, dueDate, description, class, subject, teacherId, teacherName, tasks?, totalMarks?, questions? }
 *
 * Uses Admin SDK — bypasses Firestore security rules.
 * Safe: requires a valid Firebase ID token in Authorization header.
 */
export async function POST(req: NextRequest) {
  const token = await verifyApiToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      teacherName,
      tasks,
      totalMarks,
      questions,
    } = body;

    if (!schoolId || !title || !teacherId) {
      return NextResponse.json({ error: 'Missing required fields: schoolId, title, teacherId' }, { status: 400 });
    }

    const assignmentData: Record<string, any> = {
      title,
      type: type || 'homework',
      dueDate: dueDate || null,
      description: description || '',
      class: assignmentClass || null,
      subject: subject || null,
      teacherId,
      teacherName: teacherName || '',
      createdAt: FieldValue.serverTimestamp(),
    };

    if (tasks && Array.isArray(tasks)) assignmentData.tasks = tasks;
    if (totalMarks) assignmentData.totalMarks = totalMarks;
    if (questions && Array.isArray(questions)) assignmentData.questions = questions;

    const ref = await adminDb
      .collection('schools')
      .doc(schoolId)
      .collection('assignments')
      .add(assignmentData);

    return NextResponse.json({ success: true, id: ref.id });
  } catch (err: any) {
    console.error('[post-assignment]', err);
    return NextResponse.json({ error: err.message || 'Failed to post assignment' }, { status: 500 });
  }
}
