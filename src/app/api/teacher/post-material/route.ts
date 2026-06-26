import { NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  try {
    const { schoolId, teacherId, teacherName, topic, outputFormat, content } = await req.json();

    if (!schoolId || !teacherId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    // Create material doc
    const materialRef = await adminDb.collection('schools').doc(schoolId).collection('materials').add({
      title: `AI Generated ${outputFormat}: ${topic.substring(0, 30)}...`,
      content: content,
      format: outputFormat,
      teacherId: teacherId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create notification doc
    await adminDb.collection('schools').doc(schoolId).collection('notifications').add({
      type: 'assignment',
      title: `New Material: ${outputFormat}`,
      message: `Your teacher ${teacherName || 'has'} posted new study material for you to review.`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: [],
      link: `/student/materials/${materialRef.id}`,
      targetAudience: 'all'
    });

    return NextResponse.json({ success: true, materialId: materialRef.id });
  } catch (error: any) {
    console.error('Error posting material to students:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
