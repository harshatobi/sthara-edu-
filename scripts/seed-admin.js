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

if (!privateKey) {
  console.error("No admin private key found");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: privateKey,
  })
});

const db = admin.firestore();
const auth = admin.auth();

const SCHOOLS = [
  { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
  { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
];

const CLASSES = ['Class 10', 'Class 11'];
const STUDENTS_PER_CLASS = 15;
const TEACHERS_PER_SCHOOL = 2;

async function createAuthUser(email, password) {
  try {
    const user = await auth.createUser({ email, password });
    return user.uid;
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const user = await auth.getUserByEmail(email);
      return user.uid;
    }
    throw err;
  }
}

async function run() {
  console.log("Starting DB generation via Admin...");
  for (const school of SCHOOLS) {
    console.log(`Setting up ${school.name}...`);
    await db.collection('schools').doc(school.id).set({
      name: school.name,
      code: school.code,
      curriculum: school.curriculum,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    for (let i = 1; i <= TEACHERS_PER_SCHOOL; i++) {
      const email = `teacher${i}_${school.id}@demo.com`;
      const password = `Teach${school.code}${i}!`;
      const uid = await createAuthUser(email, password);
      await db.collection('users').doc(uid).set({
        name: `Teacher ${i} (${school.code})`,
        email,
        role: 'teacher',
        schoolId: school.id,
        teacherClass: CLASSES[(i - 1) % CLASSES.length],
        demoPassword: password,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(` Created teacher ${email}`);
    }

    let c = 1;
    for (const className of CLASSES) {
      for (let i = 1; i <= STUDENTS_PER_CLASS; i++) {
        const safeClass = className.replace(/\s+/g, '_').toLowerCase();
        const email = `student${c}_${school.id}_${safeClass}@demo.com`;
        const password = `Pass${school.code}${c}!`;
        const uid = await createAuthUser(email, password);
        await db.collection('users').doc(uid).set({
          name: `Student ${c} (${school.code})`,
          email,
          role: 'student',
          schoolId: school.id,
          studentClass: className,
          demoPassword: password,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        c++;
      }
    }
  }
  console.log("DONE");
}

run().catch(console.error);
