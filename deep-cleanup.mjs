/**
 * deep-cleanup.mjs — finds and deletes demo assignments across ALL schools
 * using direct Firestore queries including collectionGroup
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, '.env.local'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
}

const app = initializeApp({
  credential: cert({
    projectId:   env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

// The app uses getFirestore(app, 'default') — a NAMED database called 'default'
const db = getFirestore(app, 'default');


const DEMO_NAMES = [
  'algebra quiz 1', 'essay draft', 'midterm exam',
  'chapter 3 homework', 'chapter 4 exercise',
  'science lab report', 'history essay',
  'math test', 'english test', 'demo', 'test assignment', 'sample',
];

function isDemo(data) {
  if (data.demo === true || data.isDemo === true) return true;
  const title = (data.title || data.name || data.topic || '').toLowerCase();
  return DEMO_NAMES.some(d => title.includes(d));
}

async function main() {
  console.log('\n🧹  Sthara Deep Demo Data Cleanup\n');

  // --- Try collectionGroup query across ALL schools ---
  console.log('🔍  Scanning all assignments via collectionGroup...');
  const allAssignments = await db.collectionGroup('assignments').get();
  console.log(`    Found ${allAssignments.size} total assignment(s)\n`);

  if (allAssignments.empty) {
    console.log('ℹ️   No assignments in any school. Checking users collection...');

    // Try to find users and check if data is seeded there
    const users = await db.collection('users').limit(5).get();
    console.log(`    Users collection: ${users.size} docs`);
    users.docs.forEach(d => console.log(`    └─ ${d.id}: ${JSON.stringify(d.data()).slice(0, 100)}`));

    const globalUsers = await db.collection('global_users').limit(5).get();
    console.log(`    global_users: ${globalUsers.size} docs`);

    console.log('\n    All top-level collections:');
    const cols = await db.listCollections();
    for (const c of cols) {
      const s = await c.limit(1).get();
      console.log(`    /${c.id}  (${s.size}+ docs)`);
    }
    return;
  }

  let deleted = 0;
  let kept = 0;

  for (const aDoc of allAssignments.docs) {
    const data = aDoc.data();
    if (!isDemo(data)) {
      console.log(`✅  Keeping: "${data.title || aDoc.id}" in ${aDoc.ref.parent.parent?.id}`);
      kept++;
      continue;
    }

    // Delete all submissions
    const subsSnap = await aDoc.ref.collection('submissions').get();
    if (!subsSnap.empty) {
      const batch = db.batch();
      subsSnap.docs.forEach(s => batch.delete(s.ref));
      await batch.commit();
    }

    await aDoc.ref.delete();
    deleted++;
    console.log(`🗑️   Deleted: "${data.title || aDoc.id}" + ${subsSnap.size} submission(s) [school: ${aDoc.ref.parent.parent?.id}]`);
  }

  console.log(`\n✅  Done! Deleted: ${deleted} | Kept: ${kept}\n`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
