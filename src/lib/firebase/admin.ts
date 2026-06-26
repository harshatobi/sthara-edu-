import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// This requires a service account key or environment variables setup in production.
// For the demo/development, we will mock the functionality if credentials aren't present,
// or use the available env vars. Next.js server components can access this.

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || 'dummy@dummy.com',
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.warn('Firebase admin initialization failed (likely missing credentials). Using fallback logic where needed.', error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export { db as adminDb, admin };
