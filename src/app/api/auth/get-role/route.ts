import { NextResponse, NextRequest } from 'next/server';
import { admin, adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/auth/get-role
 * Body: { idToken: string }
 * Returns: { role: string } or { error: string }
 *
 * Uses the Admin SDK so Firestore security rules are bypassed.
 * This is safe because we verify the Firebase ID token first.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    // Verify the token — this proves the user is who they say they are
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    let role: string | null = null;

    // 1. Check superadmins collection
    const saDoc = await adminDb.collection('superadmins').doc(uid).get();
    if (saDoc.exists) {
      role = 'superadmin';
    }

    // 2. Check global_users
    if (!role) {
      const guDoc = await adminDb.collection('global_users').doc(uid).get();
      if (guDoc.exists) {
        role = guDoc.data()?.role ?? null;
      }
    }

    // 3. Check users (legacy / fallback)
    if (!role) {
      const uDoc = await adminDb.collection('users').doc(uid).get();
      if (uDoc.exists) {
        role = uDoc.data()?.role ?? null;
      }
    }

    if (!role) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ role });
  } catch (err: any) {
    console.error('[get-role] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
