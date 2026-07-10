import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { schoolId, classData } = body;

    if (!schoolId || !classData || !classData.name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }

    const newClassDoc = adminDb.collection('schools').doc(schoolId).collection('classes').doc();
    const classId = newClassDoc.id;

    const dataToSave = {
      ...classData,
      id: classId,
      createdAt: new Date().toISOString(),
      enrolledStudentIds: [],
    };

    await newClassDoc.set(dataToSave);

    return NextResponse.json({ success: true, classId });
  } catch (error: any) {
    console.error('Create Class Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
