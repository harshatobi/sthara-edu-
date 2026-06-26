const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: privateKey,
  })
});

const db = admin.firestore();

async function run() {
  try {
    const snap = await db.collection('schools').get();
    console.log(`Found ${snap.size} schools.`);
    for (const doc of snap.docs) {
      console.log(`School: ${doc.id}`);
      const assignments = await doc.ref.collection('assignments').get();
      console.log(`  Assignments: ${assignments.size}`);
      for (const a of assignments.docs) {
        console.log(`    - ${a.data().title}`);
        const subs = await a.ref.collection('submissions').get();
        console.log(`      Submissions: ${subs.size}`);
      }
    }
  } catch (err) {
    console.error("ERROR", err);
  }
}

run().catch(console.error);
