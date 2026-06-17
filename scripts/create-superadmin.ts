import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];

if (!EMAIL || !PASSWORD) {
  console.error("Usage: npx tsx scripts/create-superadmin.ts <email> <password>");
  process.exit(1);
}

async function createSuperAdmin() {
  console.log(`Setting up superadmin for: ${EMAIL}`);
  try {
    // 1. Create User
    let user;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
      user = userCredential.user;
      console.log(`✓ Created user account (UID: ${user.uid})`);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        console.log("Account already exists. Signing in...");
        const userCredential = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
        user = userCredential.user;
        console.log(`✓ Signed in to existing account (UID: ${user.uid})`);
      } else {
        throw e;
      }
    }

    // 2. Add to superadmins collection
    await setDoc(doc(db, 'superadmins', user.uid), {
      email: EMAIL,
      role: 'superadmin',
      createdAt: new Date(),
    });
    console.log(`✓ Added to superadmins collection`);

    // 3. Add to global_users collection just in case
    await setDoc(doc(db, 'global_users', user.uid), {
      email: EMAIL,
      role: 'superadmin',
      name: 'Super Admin',
    });
    console.log(`✓ Added to global_users collection`);

    console.log('\n========================================================');
    console.log('SUCCESS! Master Super Admin created successfully.');
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log('You can now log in securely through the main interface.');
    console.log('========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error("Failed to create superadmin:", error);
    process.exit(1);
  }
}

createSuperAdmin();
