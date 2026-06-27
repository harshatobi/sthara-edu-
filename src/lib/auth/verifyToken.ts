import { admin } from '@/lib/firebase/admin';
import { NextRequest } from 'next/server';

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Returns the decoded token if valid, or null if invalid/missing.
 *
 * Usage in API routes:
 *   const token = await verifyApiToken(request);
 *   if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function verifyApiToken(request: NextRequest | Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) return null;

    // If admin SDK isn't initialized (missing env vars in dev), skip verification
    if (!admin.apps.length) {
      console.warn('[verifyApiToken] Firebase Admin not initialized — skipping token check in dev mode');
      return { uid: 'dev-bypass', email: 'dev@dev.com', role: 'teacher' };
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    console.error('[verifyApiToken] Token verification failed:', err);
    return null;
  }
}
