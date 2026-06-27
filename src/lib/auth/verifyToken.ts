import { admin } from '@/lib/firebase/admin';
import { NextRequest } from 'next/server';

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Returns the decoded token if valid, or null if invalid/missing.
 *
 * SECURITY: This NEVER silently bypasses verification in production.
 * If the Admin SDK is not initialized, the request is rejected (401).
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

    // Hard fail if Admin SDK is not initialized — NEVER silently bypass
    if (!admin.apps.length) {
      console.error('[verifyApiToken] Firebase Admin SDK is not initialized. Check FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY environment variables.');
      return null; // Reject — do not allow through
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    console.error('[verifyApiToken] Token verification failed:', err);
    return null;
  }
}
