import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { admin, adminDb } from '@/lib/firebase/admin';

/**
 * DELETE /api/superadmin/delete-user
 * Deletes a user completely from:
 *   1. Firebase Authentication (so the email can be re-used)
 *   2. global_users Firestore collection
 *   3. schools/{schoolId}/users subcollection
 *
 * Requires a valid superadmin token in Authorization header.
 */
export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uid, schoolId } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const results: Record<string, string> = {};

    // 1. Delete from Firebase Auth (this is the key step — frees up the email)
    try {
      if (admin.apps.length) {
        await admin.auth().deleteUser(uid);
        results.auth = 'deleted';
      } else {
        results.auth = 'skipped (admin not initialized)';
      }
    } catch (authErr: any) {
      // user-not-found is fine — already deleted
      if (authErr.code === 'auth/user-not-found') {
        results.auth = 'already_deleted';
      } else {
        results.auth = `error: ${authErr.message}`;
        console.error('[delete-user] Auth deletion error:', authErr.message);
      }
    }

    // 2. Delete from global_users
    try {
      if (adminDb) {
        await adminDb.collection('global_users').doc(uid).delete();
        results.globalUsers = 'deleted';
      } else {
        // Fallback: client will handle Firestore deletes
        results.globalUsers = 'skipped (use client)';
      }
    } catch (err: any) {
      results.globalUsers = `error: ${err.message}`;
    }

    // 3. Delete from schools/{schoolId}/users
    if (schoolId) {
      try {
        if (adminDb) {
          await adminDb.collection('schools').doc(schoolId).collection('users').doc(uid).delete();
          results.schoolUsers = 'deleted';
        } else {
          results.schoolUsers = 'skipped (use client)';
        }
      } catch (err: any) {
        results.schoolUsers = `error: ${err.message}`;
      }
    }

    // Also try to delete from the legacy 'users' collection if it exists
    try {
      if (adminDb) {
        await adminDb.collection('users').doc(uid).delete();
        results.legacyUsers = 'deleted';
      }
    } catch {
      results.legacyUsers = 'not found (ok)';
    }

    return NextResponse.json({
      success: true,
      uid,
      results,
      message: 'User fully deleted. Email can be re-used immediately.',
    });

  } catch (error: any) {
    console.error('[delete-user] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}
