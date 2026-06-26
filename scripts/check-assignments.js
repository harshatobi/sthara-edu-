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
    })
  });
}

const db = admin.firestore();

async function check() {
  console.log("=== CHECKING ASSIGNMENTS ===");
  const schools = ['sch-dps', 'sch-oak'];
  for (const schoolId of schools) {
    const snap = await db.collection('schools').doc(schoolId).collection('assignments').get();
    console.log(`School ${schoolId} has ${snap.size} assignments:`);
    snap.forEach(doc => {
      console.log(`- ID: ${doc.id}, Title: ${doc.data().title}, Class: ${doc.data().class}`);
    });
  }

  console.log("\n=== CHECKING STUDENTS ===");
  const usersSnap = await db.collection('users').where('role', '==', 'student').get();
  console.log(`Total students: ${usersSnap.size}`);
  
  // Just print a few to see what they look like
  let dpsStudents = 0;
  let oakStudents = 0;
  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.schoolId === 'sch-dps') dpsStudents++;
    if (data.schoolId === 'sch-oak') oakStudents++;
  });
  console.log(`DPS Students: ${dpsStudents}`);
  console.log(`OAK Students: ${oakStudents}`);
}

check().catch(console.error);
