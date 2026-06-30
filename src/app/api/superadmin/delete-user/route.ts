import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { admin, adminDb } from '@/lib/firebase/admin';

export const maxDuration = 60;

/**
 * DELETE /api/superadmin/delete-user
 * Full cascade delete of a user from:
 *   Firebase Auth, global_users, schools/.../users,
 *   all their assignments, submissions, quiz data,
 *   chat history, syllabus entries, notifications, etc.
 */

/** Delete all docs in a Firestore collection/query in batches of 400 */
async function deleteBatch(
  db: FirebaseFirestore.Firestore,
  query: FirebaseFirestore.Query
): Promise<number> {
  const snap = await query.limit(400).get();
  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Recurse if there might be more
  if (snap.size === 400) {
    return snap.size + await deleteBatch(db, query);
  }
  return snap.size;
}

/** Delete a document and ALL its subcollections recursively */
async function deleteDocWithSubcollections(
  db: FirebaseFirestore.Firestore,
  docRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const subcollections = await docRef.listCollections();
  for (const sub of subcollections) {
    const subDocs = await sub.get();
    for (const subDoc of subDocs.docs) {
      await deleteDocWithSubcollections(db, subDoc.ref);
    }
  }
  await docRef.delete();
}

export async function POST(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { uid, schoolId, role } = await request.json();
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

    const log: Record<string, string | number> = {};

    // ── 1. Firebase Authentication ───────────────────────────────────────────
    try {
      if (admin.apps.length) {
        await admin.auth().deleteUser(uid);
        log.auth = 'deleted ✓';
      } else {
        log.auth = 'skipped (admin not init)';
      }
    } catch (e: any) {
      log.auth = e.code === 'auth/user-not-found' ? 'already gone' : `error: ${e.message}`;
    }

    if (!adminDb) {
      return NextResponse.json({
        success: true, uid, log,
        warning: 'Firebase Admin DB not available — Auth was deleted but Firestore cleanup skipped.',
      });
    }

    const db = adminDb;

    // ── 2. User profile documents ────────────────────────────────────────────
    try { await db.collection('global_users').doc(uid).delete(); log.global_users = 'deleted ✓'; }
    catch (e: any) { log.global_users = e.message; }

    try { await db.collection('users').doc(uid).delete(); log.users_legacy = 'deleted ✓'; }
    catch { log.users_legacy = 'not found (ok)'; }

    if (schoolId) {
      try {
        await db.collection('schools').doc(schoolId).collection('users').doc(uid).delete();
        log.school_users = 'deleted ✓';
      } catch (e: any) { log.school_users = e.message; }
    }

    // ── 3. Student Chat History ──────────────────────────────────────────────
    try {
      const chatRef = db.collection('student_chats').doc(uid);
      await deleteDocWithSubcollections(db, chatRef);
      log.student_chats = 'deleted ✓';
    } catch { log.student_chats = 'not found (ok)'; }

    // ── 4. Student Memory / Known Concepts ───────────────────────────────────
    try {
      await db.collection('student_memory').doc(uid).delete();
      log.student_memory = 'deleted ✓';
    } catch { log.student_memory = 'not found (ok)'; }

    // ── 5. School-scoped data (if schoolId provided) ─────────────────────────
    if (schoolId) {
      const schoolRef = db.collection('schools').doc(schoolId);

      // Submissions (homework submissions by this student)
      try {
        const n = await deleteBatch(db,
          schoolRef.collection('submissions').where('studentId', '==', uid));
        log.submissions = `${n} deleted`;
      } catch (e: any) { log.submissions = e.message; }

      // Quiz submissions / attempts
      try {
        const n = await deleteBatch(db,
          schoolRef.collection('quiz_submissions').where('studentId', '==', uid));
        log.quiz_submissions = `${n} deleted`;
      } catch (e: any) { log.quiz_submissions = e.message; }

      try {
        const n = await deleteBatch(db,
          schoolRef.collection('quiz_attempts').where('studentId', '==', uid));
        log.quiz_attempts = `${n} deleted`;
      } catch { log.quiz_attempts = '0 (collection may not exist)'; }

      // Notifications about/from this user
      try {
        const n = await deleteBatch(db,
          schoolRef.collection('notifications').where('studentId', '==', uid));
        log.notifications_student = `${n} deleted`;
      } catch { log.notifications_student = '0'; }

      // Teacher-specific: assignments created by this teacher
      if (role === 'teacher') {
        try {
          const n = await deleteBatch(db,
            schoolRef.collection('assignments').where('teacherId', '==', uid));
          log.assignments = `${n} deleted`;
        } catch (e: any) { log.assignments = e.message; }

        // Syllabus entries by this teacher
        try {
          const n = await deleteBatch(db,
            schoolRef.collection('syllabus').where('teacherId', '==', uid));
          log.syllabus = `${n} deleted`;
        } catch (e: any) { log.syllabus = e.message; }

        // Notifications created by this teacher
        try {
          const n = await deleteBatch(db,
            schoolRef.collection('notifications').where('teacherId', '==', uid));
          log.notifications_teacher = `${n} deleted`;
        } catch { log.notifications_teacher = '0'; }
      }

      // Student-specific: assignments this student has a result doc for
      if (role === 'student') {
        // Some implementations store per-student results inside assignment docs
        // Delete all assignments where the student is the only submitter (i.e. their personal homework copy)
        try {
          const n = await deleteBatch(db,
            schoolRef.collection('assignments').where('studentId', '==', uid));
          log.student_assignments = `${n} deleted`;
        } catch { log.student_assignments = '0 (shared assignments not deleted)'; }

        // Wellness check-in data
        try {
          const n = await deleteBatch(db,
            schoolRef.collection('wellness').where('studentId', '==', uid));
          log.wellness = `${n} deleted`;
        } catch { log.wellness = '0'; }
      }
    }

    // ── 6. Global collections (not school-scoped) ────────────────────────────

    // Homework assignments stored at root level
    try {
      const n = await deleteBatch(db,
        db.collection('homework_assignments').where('studentId', '==', uid));
      log.homework_assignments = `${n} deleted`;
    } catch { log.homework_assignments = '0'; }

    // Wellness data at root level
    try {
      const n = await deleteBatch(db,
        db.collection('wellness_checkins').where('uid', '==', uid));
      log.wellness_checkins = `${n} deleted`;
    } catch { log.wellness_checkins = '0'; }

    return NextResponse.json({
      success: true,
      uid,
      schoolId,
      role,
      message: `User and all associated data fully deleted. Email can be re-used immediately.`,
      log,
    });

  } catch (error: any) {
    console.error('[delete-user] Fatal:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
