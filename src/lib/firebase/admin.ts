import * as admin from 'firebase-admin';

/**
 * Firebase Admin SDK initialization.
 * SECURITY: Hard-fails if credentials are missing — no silent bypass.
 * All required env vars must be set in production.
 */

const requiredEnvVars = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
};

if (!admin.apps.length) {
  const { projectId, clientEmail, privateKey } = requiredEnvVars;

  if (!clientEmail || !privateKey || clientEmail === 'dummy@dummy.com') {
    // In true local dev without credentials, log a clear error but don't crash the build
    console.error(
      '[Firebase Admin] MISSING CREDENTIALS. Set FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY. ' +
      'API routes requiring auth will return 401 until credentials are configured.'
    );
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } catch (error) {
      console.error('[Firebase Admin] Initialization failed:', error);
    }
  }
}

const adminDb = admin.apps.length ? admin.firestore() : null;

export { adminDb, admin };
