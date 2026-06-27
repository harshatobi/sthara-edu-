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

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
}

const db = admin.firestore();
const auth = admin.auth();

const SCHOOL_ID = 'sch-real';
const SCHOOL_CODE = 'REAL101';
const PASSWORD = '1234567890';

const USERS = [
  {
    email: '23B61A05E3@sthara.com',
    role: 'student',
    name: 'Student (23B61A05E3)',
    customStudentId: '23B61A05E3',
    studentClass: 'Class 10'
  },
  {
    email: '23B61A05J3@sthara.com',
    role: 'student',
    name: 'Student (23B61A05J3)',
    customStudentId: '23B61A05J3',
    studentClass: 'Class 10'
  },
  {
    email: '23B61A05H0@sthara.com',
    role: 'teacher',
    name: 'Maths Teacher (23B61A05H0)',
    teacherClass: 'Class 10',
    subject: 'Mathematics'
  }
];

async function createAuthUser(email, password) {
  try {
    const user = await auth.createUser({ email, password });
    return user.uid;
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const user = await auth.getUserByEmail(email);
      // Update password just in case
      await auth.updateUser(user.uid, { password });
      return user.uid;
    }
    throw err;
  }
}

async function run() {
  console.log("Setting up real school...");
  await db.collection('schools').doc(SCHOOL_ID).set({
    name: 'Real Testing School',
    code: SCHOOL_CODE,
    curriculum: 'CBSE',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  for (const u of USERS) {
    const uid = await createAuthUser(u.email, PASSWORD);
    const userData = {
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: SCHOOL_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (u.role === 'student') {
      userData.studentClass = u.studentClass;
      userData.customStudentId = u.customStudentId;
    }
    if (u.role === 'teacher') {
      userData.teacherClass = u.teacherClass;
      userData.subject = u.subject;
    }
    
    await db.collection('users').doc(uid).set(userData);
    console.log(`Created ${u.role}: ${u.email}`);
  }
  
  console.log("DONE");
}

run().catch(console.error);
