import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error(".env.local file not found.");
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SCHOOLS = [
  { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
  { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
];

const CLASSES = ['Class 10', 'Class 11'];
const STUDENTS_PER_CLASS = 15; // Reduced to avoid rate limits
const TEACHERS_PER_SCHOOL = 2;

async function createAuthUserREST(email: string, password: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error?.message === 'EMAIL_EXISTS') {
      const signRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const signData = await signRes.json();
      if (!signRes.ok) throw new Error(signData.error?.message || 'Login failed');
      return signData.localId;
    }
    throw new Error(data.error?.message || 'Failed to create user');
  }
  return data.localId;
}

async function generateData() {
  console.log("🚀 Starting Demo Data Generation...");

  const adminEmail = "payalaharshavardhanvarma44@gmail.com";
  const adminPassword = "Kittu@761681";

  try {
    console.log("Authenticating as Super Admin...");
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    console.log("✅ Authenticated.");

    for (const school of SCHOOLS) {
      console.log(`\n🏢 Setting up School: ${school.name}`);
      
      await setDoc(doc(db, 'schools', school.id), {
        name: school.name,
        code: school.code,
        curriculum: school.curriculum,
        createdAt: serverTimestamp()
      });
      console.log(`✅ Created school document: ${school.id}`);

      // Generate Teachers
      console.log(`  👨‍🏫 Generating ${TEACHERS_PER_SCHOOL} teachers...`);
      for (let i = 1; i <= TEACHERS_PER_SCHOOL; i++) {
        const teacherName = `Teacher ${i} (${school.code})`;
        const email = `teacher${i}_${school.id}@demo.com`;
        const password = `Teach${school.code}${i}!`;
        // Assign each teacher to a class for demo purposes
        const assignedClass = CLASSES[(i - 1) % CLASSES.length];
        
        try {
          const uid = await createAuthUserREST(email, password);
          await setDoc(doc(db, 'users', uid), {
            name: teacherName,
            email,
            role: 'teacher',
            schoolId: school.id,
            teacherClass: assignedClass, // Assigned for syllabus sync
            demoPassword: password,
            createdAt: serverTimestamp()
          });
        } catch (error: any) {
          console.error(`❌ Failed to process teacher ${email}:`, error.message);
        }
      }

      let globalCounter = 1;
      for (const className of CLASSES) {
        console.log(`  📚 Generating students for ${className}...`);
        
        for (let i = 1; i <= STUDENTS_PER_CLASS; i++) {
          const studentName = `Student ${globalCounter} (${school.code})`;
          // Replace spaces with underscores for email
          const safeClassName = className.replace(/\s+/g, '_').toLowerCase();
          const email = `student${globalCounter}_${school.id}_${safeClassName}@demo.com`;
          const password = `Pass${school.code}${globalCounter}!`;

          try {
            const uid = await createAuthUserREST(email, password);
            await setDoc(doc(db, 'users', uid), {
              name: studentName,
              email,
              role: 'student',
              schoolId: school.id,
              studentClass: className,
              demoPassword: password,
              createdAt: serverTimestamp()
            });
            globalCounter++;
          } catch (error: any) {
            console.error(`❌ Failed to process student ${email}:`, error.message);
          }
        }
      }
    }

    console.log("\n🎉 Demo Data Generation Complete!");
    process.exit(0);

  } catch (err: any) {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  }
}

generateData().catch(console.error);
