import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

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
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function run() {
  console.log("Authenticating...");
  // Login with student to get permissions if rules require it
  await signInWithEmailAndPassword(auth, "student1_sch-dps_class_10a@demo.com", "PassDPS1011!").catch(e => {
     console.log("Could not login as student, proceeding as anonymous/unauthenticated client (might fail if rules block)");
  });

  const schoolId = 'sch-dps';
  
  console.log(`Fetching assignments for school: ${schoolId}`);
  const assignmentsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments'));
  console.log(`Found ${assignmentsSnap.size} assignments.`);

  for (const assignmentDoc of assignmentsSnap.docs) {
    const data = assignmentDoc.data();
    if (data.title === 'Algebra Quiz 1' || data.title === 'Essay Draft' || data.title === 'Midterm Exam' || data.title === 'History Project' || data.title === 'Lab Report') {
        console.log(`Deleting assignment: ${data.title}`);
        
        // Delete submissions first
        const subsSnap = await getDocs(collection(db, 'schools', schoolId, 'assignments', assignmentDoc.id, 'submissions'));
        for (const subDoc of subsSnap.docs) {
            await deleteDoc(doc(db, 'schools', schoolId, 'assignments', assignmentDoc.id, 'submissions', subDoc.id));
        }
        
        // Delete assignment
        await deleteDoc(doc(db, 'schools', schoolId, 'assignments', assignmentDoc.id));
        console.log(`✅ Deleted ${data.title} and all its submissions.`);
    }
  }
  console.log("Done clearing demo assignments.");
  process.exit(0);
}

run().catch(console.error);
