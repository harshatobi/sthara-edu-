import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/auth/verify-school
 * Body: { schoolCode: string }
 * Returns: { valid: true, type: 'school'|'college' } or { valid: false, error: string }
 *
 * Uses Admin SDK → bypasses Firestore security rules entirely.
 * Safe because this is unauthenticated but read-only and non-sensitive.
 */
export async function POST(req: NextRequest) {
  try {
    const { schoolCode } = await req.json();

    if (!schoolCode || typeof schoolCode !== 'string' || schoolCode.length < 3) {
      return NextResponse.json({ valid: false, error: 'Invalid school code.' }, { status: 400 });
    }

    const code = schoolCode.trim().toUpperCase();

    // 1. Direct doc lookup (document ID matches the code)
    const directRef = adminDb.collection('schools').doc(code);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      const data = directSnap.data();
      return NextResponse.json({
        valid: true,
        type: data?.type === 'college' ? 'college' : 'school',
      });
    }

    // 2. Query by 'code' field (document ID might differ from code)
    const querySnap = await adminDb.collection('schools').where('code', '==', code).limit(1).get();
    if (!querySnap.empty) {
      const data = querySnap.docs[0].data();
      return NextResponse.json({
        valid: true,
        type: data?.type === 'college' ? 'college' : 'school',
      });
    }

    return NextResponse.json({ valid: false, error: 'Institution code not found. Please check and try again.' });
  } catch (err: any) {
    console.error('[verify-school] Error:', err.message);
    return NextResponse.json({ valid: false, error: 'Server error. Please try again.' }, { status: 500 });
  }
}
