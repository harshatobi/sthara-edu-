/**
 * cleanup-demo-data.mjs
 * Deletes ALL demo/seed assignments and their submissions from every school in Firestore.
 * Run once: node cleanup-demo-data.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = resolve(__dirname, '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
}

initializeApp({
  credential: cert({
    projectId:   env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

// ── Names that identify seeded/demo assignments ───────────────
const DEMO_NAMES = [
  'algebra quiz 1',
  'essay draft',
  'midterm exam',
  'chapter 3 homework',
  'chapter 4 exercise',
  'science lab report',
  'history essay',
  'math test',
  'english test',
  'demo assignment',
  'test assignment',
  'sample assignment',
];

function isDemoAssignment(data) {
  if (data.demo === true || data.isDemo === true || data.seed === true) return true;
  const title = (data.title || data.name || '').toLowerCase().trim();
  return DEMO_NAMES.some(d => title.includes(d));
}

async function deleteCollection(colRef) {
  const snap = await colRef.get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

async function main() {
  console.log('\n🧹  Sthara Demo Data Cleanup\n');

  const schoolsSnap = await db.collection('schools').get();
  if (schoolsSnap.empty) {
    console.log('No schools found. Nothing to clean.');
    return;
  }

  let totalAssignmentsDeleted = 0;
  let totalSubmissionsDeleted = 0;

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id;
    const schoolName = schoolDoc.data().name || schoolId;
    console.log(`\n📚  School: ${schoolName} (${schoolId})`);

    const assignmentsSnap = await db
      .collection('schools').doc(schoolId)
      .collection('assignments')
      .get();

    if (assignmentsSnap.empty) {
      console.log('   No assignments found.');
      continue;
    }

    for (const aDoc of assignmentsSnap.docs) {
      const data = aDoc.data();

      if (!isDemoAssignment(data)) {
        console.log(`   ✅ Keeping: "${data.title || aDoc.id}"`);
        continue;
      }

      // Delete all submissions under this assignment
      const subsRef = aDoc.ref.collection('submissions');
      const subCount = await deleteCollection(subsRef);
      totalSubmissionsDeleted += subCount;

      // Delete the assignment itself
      await aDoc.ref.delete();
      totalAssignmentsDeleted++;

      console.log(`   🗑️  Deleted: "${data.title || aDoc.id}" + ${subCount} submission(s)`);
    }
  }

  console.log(`\n✅  Done!`);
  console.log(`   Assignments deleted : ${totalAssignmentsDeleted}`);
  console.log(`   Submissions deleted : ${totalSubmissionsDeleted}`);
  console.log('\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
