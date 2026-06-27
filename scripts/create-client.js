const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

async function run() {
  console.log("Setting up real school...");
  await setDoc(doc(db, 'schools', SCHOOL_ID), {
    name: 'Real Testing School',
    code: SCHOOL_CODE,
    curriculum: 'CBSE',
    createdAt: serverTimestamp()
  });

  for (const u of USERS) {
    let uid;
    try {
      const cred = await createUserWithEmailAndPassword(auth, u.email, PASSWORD);
      uid = cred.user.uid;
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
         console.log(`User ${u.email} already exists. We can't get the UID directly via client SDK easily if we don't sign in. Please delete them first if you need to recreate.`);
         continue;
      } else {
         throw e;
      }
    }
    
    const userData = {
      name: u.name,
      email: u.email,
      role: u.role,
      schoolId: SCHOOL_ID,
      createdAt: serverTimestamp()
    };
    if (u.role === 'student') {
      userData.studentClass = u.studentClass;
      userData.customStudentId = u.customStudentId;
    }
    if (u.role === 'teacher') {
      userData.teacherClass = u.teacherClass;
      userData.subject = u.subject;
    }
    
    await setDoc(doc(db, 'users', uid), userData);
    console.log(`Created ${u.role}: ${u.email}`);
  }
  
  console.log("DONE");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
