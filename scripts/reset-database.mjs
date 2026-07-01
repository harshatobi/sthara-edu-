/**
 * Sthara Full Database Reset Script
 * Deletes ALL users and data EXCEPT superadmin accounts
 * Run: node scripts/reset-database.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ── Init Firebase Admin ──────────────────────────────────────────────────────
const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDHA7grKhPcQbyL\nOV6XdpUHbpXGIMHS66KurOqDkw+mphvGodmNC6bZPwmX+hVVFbVI1Ir+AJbDdnbI\nNUehmQ84mZH+BuGbPtkBfhaU573PmebTrIy2EJZsULvcV3C4CKoqD6jDcbe95oHI\nNOIGOMeWAXLhpd92JANraZVVpsV4YwX7Rx7swWocnKRVOF40pXKiqDcQlTJRBZsg\nQjRTOr6U8B8Y8yKJX6MuUtWguZeBlcX1h1P9phUQLsR8dRaSPBpabRPRwNjH0Q6H\noylkKixEv08CwpaFchiWJhwTuBCF03kSGIm0HsBw6j3qjA641yeiPah+ix3wjecB\nCfNOFX0HAgMBAAECggEAFc/7jIeVG6v8zUmha3psxR7Cva9zbvmyn/CF15vzuDE2\nlCPDI2lmhSMamxSm5+d0MiJRhZts6sl+JV1pl3WeLHbwgGYirhBKWpaGRRXNQQa+\nPO8JkR7qTb7fiDvxN8qDVA7ZUWqSV/b+vIHHUCVDAtbvz3mNr3YtBcXRv0yDEjme\nXQvnL3IOwm+zkKKiPBKB4GORDFdLGitBncGM0wks+Hq/+a/iYfawc3YQVvaVgYOV\nKwaiDn9lVH5fZhSe5yVres5mjZFF/N9omJwl8RZTctTIRpFKgc81M4CMFTeWm7lt\nKobAujTcnFNe2ry5srcaJM4alDaUuenL9buAM7u8OQKBgQD/2xUmmHdUkxrdlSoi\nncsSaqc7MZC7J1d2wnKrSa0J0j0h9QR1DUSFQ9BW70k4JjCsf3Li70csxDbqto0E\nE0WrcOD2ngjerxItV0ZYZzBakudBLuhyc/M7FFTG0Q3m+Ek7BAq0i04/8GfhgIS3\nUok9jHgbHZtT6r7AwDsihTqAlQKBgQDHIG9nlYBbKNXr8jGObSns7ZKFVjhXUfC5\nhKbrxiiq1FCtpfNzbuGLQNitxa9d5G0qVTEFj+epwMUjo1XX11+MTpcUCzPXPF8H\nG+D7/zYsdqNf7dAx23nW9bD8qyLqdZ/hLfRXWkwJI0/jhTybdKydNqiHIWKod9Zs\nqInkBY1UKwKBgQDVS2PfkB1zIUu1TAQbZaaEjOsrOs/oZgzRUZtc1oft9xnFtEhp\n+IyV+Im337YPnC7Zr0osi8OvO0h49YSr0BE1sl2o2uiUFCk4KVjYm/XAnFUzjxJz\nT9yG9RUTxfYsBfKuw1jVWIj8XsOLR6PcXG9TI0aBfHYgSEOL1vW1epHh3QKBgQCk\noDY6ZylVNG+XwAYkgC/XR5qJTf0KhB4G4pq19oAMq7d/uOGLH7KsVBJPqE4RzBZM\nl14OASk/+LWDfzgrWE4QS7Evywsy+SB/Whcpf5ekLvlnB8/GSHN0um92lW4qdNCX\ndEy8I1UVgPI9Yhv3UgCbgWLXRUyxh1HpR3Wo5MYxPQKBgQC5NszAI8L6ye6zrm5k\n/V2+dRzI6KG5iT+fMEAZ3UTMxRw0twZ9KHtSuYGPNFU7HQheDAJvjn9CgMeCW1C0\nPOYxIShDit++ZC8oXuhU47OrgydFYdkwY4T9C5U/spJ2h8+uNLZR11dpaC2ArOjQ\ng7yS2ccLnldfIkWP9SAzHSwtOw==\n-----END PRIVATE KEY-----\n`;

initializeApp({
  credential: cert({
    projectId: 'sthara-edu',
    clientEmail: 'firebase-adminsdk-fbsvc@sthara-edu.iam.gserviceaccount.com',
    privateKey,
  }),
});

const auth = getAuth();
const db = getFirestore();

const SUPERADMIN_EMAILS = ['superadmin']; // partial match — anything with 'superadmin' in email kept

// ── Helper: delete all docs in batches ──────────────────────────────────────
async function deleteCollection(collRef, batchSize = 300) {
  let total = 0;
  while (true) {
    const snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      // Recursively delete subcollections
      const subs = await doc.ref.listCollections();
      for (const sub of subs) {
        await deleteCollection(sub);
      }
      batch.delete(doc.ref);
    }
    await batch.commit();
    total += snap.size;
    process.stdout.write(`.`);
    if (snap.size < batchSize) break;
  }
  return total;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Sthara Database Reset Script');
  console.log('================================\n');

  // ── Step 1: List all Firebase Auth users ────────────────────────────────
  console.log('📋 Fetching all Firebase Auth users...');
  let allUsers = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    allUsers = [...allUsers, ...result.users];
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`   Found ${allUsers.length} total users in Firebase Auth`);

  // Filter out superadmin
  const toDelete = allUsers.filter(u =>
    !SUPERADMIN_EMAILS.some(sa => u.email?.toLowerCase().includes(sa))
  );
  const kept = allUsers.filter(u =>
    SUPERADMIN_EMAILS.some(sa => u.email?.toLowerCase().includes(sa))
  );

  console.log(`   Keeping ${kept.length} superadmin(s): ${kept.map(u => u.email).join(', ')}`);
  console.log(`   Deleting ${toDelete.length} users from Auth...`);

  // ── Step 2: Delete from Firebase Auth in batches of 1000 ────────────────
  const uidsToDelete = toDelete.map(u => u.uid);
  const superadminUids = new Set(kept.map(u => u.uid));

  for (let i = 0; i < uidsToDelete.length; i += 1000) {
    const batch = uidsToDelete.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch);
    console.log(`   ✓ Deleted ${result.successCount} Auth users (${result.failureCount} failed)`);
    if (result.errors.length > 0) {
      result.errors.forEach(e => console.log(`     ⚠ ${e.error.message}`));
    }
  }

  // ── Step 3: Delete Firestore collections ────────────────────────────────
  console.log('\n🗂️  Clearing Firestore collections...\n');

  const collections = [
    'global_users',
    'users',
    'student_chats',
    'student_memory',
    'homework_assignments',
    'wellness_checkins',
  ];

  for (const col of collections) {
    process.stdout.write(`   Clearing ${col}... `);
    // Skip superadmin docs
    const colRef = db.collection(col);
    const snap = await colRef.get();
    let deleted = 0;
    for (const docSnap of snap.docs) {
      if (superadminUids.has(docSnap.id)) {
        console.log(`(skipped superadmin)`);
        continue;
      }
      const subs = await docSnap.ref.listCollections();
      for (const sub of subs) await deleteCollection(sub);
      await docSnap.ref.delete();
      deleted++;
    }
    console.log(`✓ ${deleted} docs deleted`);
  }

  // ── Step 4: Clear school-scoped collections ──────────────────────────────
  console.log('\n🏫  Clearing school-scoped data...');
  const schoolsSnap = await db.collection('schools').get();
  for (const schoolDoc of schoolsSnap.docs) {
    console.log(`\n   School: ${schoolDoc.id}`);
    const schoolSubcols = [
      'users', 'assignments', 'submissions', 'syllabus',
      'notifications', 'quiz_submissions', 'quiz_attempts', 'wellness',
    ];
    for (const sub of schoolSubcols) {
      const ref = schoolDoc.ref.collection(sub);
      process.stdout.write(`     Clearing ${sub}... `);
      const n = await deleteCollection(ref);
      console.log(`✓ ${n} deleted`);
    }
  }

  console.log('\n\n✅ Database reset complete!');
  console.log('   Firebase Auth: all non-superadmin users deleted');
  console.log('   Firestore: all user data cleared');
  console.log('   You can now create fresh accounts.\n');
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});
