import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Deletion can take time for large schools

/**
 * DELETE /api/admin/delete-school
 * Body: { schoolId, idToken }
 * Permanently deletes a school and ALL associated data:
 *   - schools/{id}/assignments/{aid}/submissions/*
 *   - schools/{id}/assignments/*
 *   - schools/{id}/users/*
 *   - schools/{id}/notifications/*
 *   - schools/{id}/materials/*
 *   - schools/{id}/situations/*
 *   - global_users where schoolId == id
 *   - users where schoolId == id
 *   - student_chats for each student
 *   - student_memory for each student
 *   - schools/{id} document itself
 */
export async function DELETE(req: NextRequest) {
  try {
    // Verify this is a superadmin request (Bearer token required)
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ') || authHeader.length < 30) {
      return NextResponse.json({ error: 'Unauthorized — superadmin token required' }, { status: 401 });
    }

    const { schoolId } = await req.json();
    if (!schoolId || typeof schoolId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid schoolId' }, { status: 400 });
    }

    const schoolRef = adminDb.collection('schools').doc(schoolId);
    const schoolDoc = await schoolRef.get();
    if (!schoolDoc.exists) {
      return NextResponse.json({ error: `School "${schoolId}" not found` }, { status: 404 });
    }

    let deletedDocs = 0;

    // ── Helper: delete all docs in a collection reference ─────────────────────
    async function deleteCollection(collRef: FirebaseFirestore.CollectionReference) {
      const snap = await collRef.get();
      if (snap.empty) return;
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedDocs += snap.size;
    }

    // ── 1. Delete assignments + their submissions ─────────────────────────────
    const assignSnap = await schoolRef.collection('assignments').get();
    for (const aDoc of assignSnap.docs) {
      await deleteCollection(aDoc.ref.collection('submissions'));
      await aDoc.ref.delete();
      deletedDocs++;
    }

    // ── 2. Delete other school subcollections ─────────────────────────────────
    const subCollections = ['users', 'notifications', 'materials', 'situations'];
    for (const sub of subCollections) {
      await deleteCollection(schoolRef.collection(sub));
    }

    // ── 3. Collect all student UIDs (from global_users + users by schoolId) ───
    const [globalSnap, usersSnap] = await Promise.all([
      adminDb.collection('global_users').where('schoolId', '==', schoolId).get(),
      adminDb.collection('users').where('schoolId', '==', schoolId).get(),
    ]);

    const allStudentIds = new Set<string>();
    const seenUids = new Set<string>();

    // ── 4. Delete global_users for this school ────────────────────────────────
    if (!globalSnap.empty) {
      const batch = adminDb.batch();
      globalSnap.docs.forEach(d => {
        allStudentIds.add(d.id);
        seenUids.add(d.id);
        batch.delete(d.ref);
      });
      await batch.commit();
      deletedDocs += globalSnap.size;
    }

    // ── 5. Delete /users for this school ──────────────────────────────────────
    if (!usersSnap.empty) {
      const batch = adminDb.batch();
      usersSnap.docs.forEach(d => {
        allStudentIds.add(d.id);
        batch.delete(d.ref);
      });
      await batch.commit();
      deletedDocs += usersSnap.size;
    }

    // ── 6. Delete student_chats and student_memory per student ────────────────
    for (const uid of allStudentIds) {
      // student_chats/{uid}/messages
      const chatRef = adminDb.collection('student_chats').doc(uid);
      await deleteCollection(chatRef.collection('messages'));
      await chatRef.delete().catch(() => {});

      // student_memory/{uid}
      await adminDb.collection('student_memory').doc(uid).delete().catch(() => {});
      deletedDocs += 2;
    }

    // ── 7. Delete the school document itself ──────────────────────────────────
    await schoolRef.delete();
    deletedDocs++;

    console.log(`[delete-school] Deleted school "${schoolId}" — ${deletedDocs} total documents removed`);

    return NextResponse.json({
      success: true,
      schoolId,
      deletedDocs,
      message: `School "${schoolId}" and all ${deletedDocs} associated documents permanently deleted.`,
    });
  } catch (err: any) {
    console.error('[delete-school] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete school' }, { status: 500 });
  }
}
