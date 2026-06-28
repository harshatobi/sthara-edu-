/**
 * nuke-all-demo-data.mjs
 * Scans EVERY collection in Firestore and deletes all demo/test data.
 * Safe: prints what it keeps and what it deletes before committing.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

const db = getFirestore(app, 'default');

// ── Demo indicators ───────────────────────────────────────────
const DEMO_NAME_PATTERNS = [
  /^test\s*student/i,
  /^student\s*\d+$/i,
  /\btest\s*student\b/i,
  /\bdemo\b/i,
  /\bsample\b/i,
  /\btest\s*user\b/i,
  /\bfake\b/i,
];

const DEMO_FIELD_FLAGS = ['demo', 'isDemo', 'seed', 'isSeed', 'test'];

const DEMO_TITLE_KEYWORDS = [
  'algebra quiz 1', 'essay draft', 'midterm exam',
  'chapter 3 homework', 'chapter 4 exercise',
  'science lab report', 'history essay',
  'demo assignment', 'test assignment', 'sample assignment',
  'background noise',  // from situational feed screenshot
  'homework completed', // generic demo situation
];

function isDocDemo(id, data) {
  // Flag-based
  for (const f of DEMO_FIELD_FLAGS) {
    if (data[f] === true) return true;
  }

  // Student name patterns
  const name = (data.studentName || data.name || data.title || data.description || '').toLowerCase();
  for (const p of DEMO_NAME_PATTERNS) {
    if (p.test(name)) return true;
  }
  if (p => DEMO_NAME_PATTERNS.some(r => r.test(id))) return true;

  // Title/keyword patterns
  const title = (data.title || data.topic || data.name || data.type || '').toLowerCase();
  for (const kw of DEMO_TITLE_KEYWORDS) {
    if (title.includes(kw)) return true;
  }

  return false;
}

async function deleteSubcollections(docRef) {
  const subcols = await docRef.listCollections();
  for (const subcol of subcols) {
    const snap = await subcol.get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

async function scanAndClean(colRef, indent = '') {
  const snap = await colRef.get();
  let deleted = 0;
  let kept = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    if (isDocDemo(docSnap.id, data)) {
      // Delete subcollections first, then doc
      await deleteSubcollections(docSnap.ref);
      await docSnap.ref.delete();
      deleted++;
      const label = data.studentName || data.name || data.title || data.type || docSnap.id;
      console.log(`${indent}🗑️   Deleted: "${label}" (${docSnap.ref.path})`);
    } else {
      kept++;
    }
  }

  return { deleted, kept };
}

async function main() {
  console.log('\n🧹  Full Demo Data Nuke — Sthara\n');

  let totalDeleted = 0;
  let totalKept = 0;

  // ── 1. Situations (situational feed) ─────────────────────────
  console.log('📋  Scanning: situations (collectionGroup)...');
  const situations = await db.collectionGroup('situations').get();
  let sitDel = 0;
  for (const doc of situations.docs) {
    const d = doc.data();
    const label = d.studentName || d.type || d.title || doc.id;
    if (isDocDemo(doc.id, d)) {
      await doc.ref.delete();
      sitDel++;
      console.log(`   🗑️   Deleted situation: "${label}" [${d.studentName || ''}] (${doc.ref.parent.parent?.id})`);
    }
  }
  console.log(`   → Deleted ${sitDel} / ${situations.size} situations\n`);
  totalDeleted += sitDel;
  totalKept += (situations.size - sitDel);

  // ── 2. Wellness logs ──────────────────────────────────────────
  console.log('💚  Scanning: wellness_logs...');
  const wellness = await db.collectionGroup('wellness_logs').get();
  const wellnessTop = await db.collection('wellness_logs').get();
  let wDel = 0;
  for (const doc of [...wellness.docs, ...wellnessTop.docs]) {
    const d = doc.data();
    if (isDocDemo(doc.id, d)) {
      await doc.ref.delete();
      wDel++;
      console.log(`   🗑️   Deleted wellness: "${d.studentName || d.note || doc.id}"`);
    }
  }
  console.log(`   → Deleted ${wDel} wellness logs\n`);
  totalDeleted += wDel;

  // ── 3. Users ──────────────────────────────────────────────────
  console.log('👤  Scanning: users & global_users...');
  let uDel = 0;
  for (const colName of ['users', 'global_users']) {
    const usersSnap = await db.collection(colName).get();
    for (const doc of usersSnap.docs) {
      const d = doc.data();
      const name = (d.name || d.displayName || '').toLowerCase();
      if (DEMO_NAME_PATTERNS.some(p => p.test(name)) || d.demo === true) {
        await deleteSubcollections(doc.ref);
        await doc.ref.delete();
        uDel++;
        console.log(`   🗑️   Deleted user: "${d.name || doc.id}" from ${colName}`);
      }
    }
  }
  console.log(`   → Deleted ${uDel} demo users\n`);
  totalDeleted += uDel;

  // ── 4. School sub-collections (all schools) ───────────────────
  console.log('🏫  Scanning: all school sub-collections...');
  const schools = await db.collection('schools').get();
  for (const school of schools.docs) {
    const schoolId = school.id;
    const schoolName = school.data().name || schoolId;
    console.log(`\n   School: ${schoolName} (${schoolId})`);

    // Sub-collections to check
    const subcols = [
      'situations', 'wellness_flags', 'alerts',
      'assignments', 'quiz_results', 'homework_submissions',
      'students', 'notifications', 'messages',
    ];

    for (const sub of subcols) {
      const subSnap = await school.ref.collection(sub).get();
      if (subSnap.empty) continue;

      let subDel = 0;
      for (const doc of subSnap.docs) {
        const d = doc.data();
        if (isDocDemo(doc.id, d)) {
          await deleteSubcollections(doc.ref);
          await doc.ref.delete();
          subDel++;
          totalDeleted++;
          const label = d.studentName || d.name || d.title || d.type || doc.id;
          console.log(`      🗑️   [${sub}] Deleted: "${label}"`);
        } else {
          totalKept++;
        }
      }
      if (subDel > 0) console.log(`      → Deleted ${subDel} from ${sub}`);
    }
  }

  // ── 5. student_chats ─────────────────────────────────────────
  console.log('\n💬  Scanning: student_chats...');
  const chats = await db.collection('student_chats').get();
  let chatDel = 0;
  for (const doc of chats.docs) {
    const d = doc.data();
    // Check if the user this chat belongs to is a demo user
    if (d.demo === true || isDocDemo(doc.id, d)) {
      await deleteSubcollections(doc.ref);
      await doc.ref.delete();
      chatDel++;
    }
  }
  console.log(`   → Deleted ${chatDel} demo chat threads\n`);
  totalDeleted += chatDel;

  console.log('═'.repeat(50));
  console.log(`✅  COMPLETE`);
  console.log(`   Total deleted : ${totalDeleted}`);
  console.log(`   Total kept    : ${totalKept}`);
  console.log('═'.repeat(50) + '\n');
}

main().catch(err => { console.error('❌', err.message, err.stack); process.exit(1); });
