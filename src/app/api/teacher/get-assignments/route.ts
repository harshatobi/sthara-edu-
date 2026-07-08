import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/get-assignments
 * Body: { schoolId, teacherId }
 * Returns ONLY this teacher's assignments + submission counts.
 * Uses Admin SDK — bypasses Firestore security rules.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const appOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || '',
      'http://localhost:3000',
      'https://stharaschoolos.vercel.app',
      'https://sthara.in',
      'https://www.sthara.in',
    ].filter(Boolean);
    const isInternal = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    const hasToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
    if (!isInternal && !hasToken && origin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { schoolId, teacherId } = await req.json();
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    // 1. Fetch ONLY this teacher's assignments (filter by teacherId)
    let query: FirebaseFirestore.Query = adminDb
      .collection('schools').doc(schoolId)
      .collection('assignments');

    if (teacherId) {
      query = query.where('teacherId', '==', teacherId);
    }

    const assignSnap = await query.get();

    // 2. For each assignment, get submissions in parallel
    const assignments = await Promise.all(
      assignSnap.docs.map(async (aDoc) => {
        const subsSnap = await adminDb
          .collection('schools').doc(schoolId)
          .collection('assignments').doc(aDoc.id)
          .collection('submissions')
          .get();

        const submittedData: Record<string, any> = {};
        subsSnap.docs.forEach(s => { submittedData[s.id] = s.data(); });

        const data = aDoc.data();
        return {
          id: aDoc.id,
          ...data,
          // Convert Firestore Timestamps to ms for safe JSON serialization
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
          submittedData,
          submittedCount: subsSnap.size,
        };
      })
    );

    // Sort newest first
    assignments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ assignments });
  } catch (err: any) {
    console.error('[get-assignments]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch assignments' }, { status: 500 });
  }
}
