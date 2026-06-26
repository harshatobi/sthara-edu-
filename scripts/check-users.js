const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

async function check() {
  const usersRef = db.collection('users');
  const snap = await usersRef.get();
  console.log('Total users:', snap.size);
  let student1, student2;
  snap.forEach(doc => {
    const data = doc.data();
    if (data.email === 'student1_sch-dps_class_10@demo.com') {
      student1 = data;
    }
    if (data.email === 'student2_sch-dps_class_10@demo.com') {
      student2 = data;
    }
  });

  console.log('Student 1:', student1);
  console.log('Student 2:', student2);
}

check().catch(console.error);
