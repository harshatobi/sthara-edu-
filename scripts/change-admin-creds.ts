import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updateEmail, updatePassword } from 'firebase/auth';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function changeCredentials() {
  try {
    const oldEmail = "admin@sthara.com";
    const oldPassword = "StharaAdmin123!";
    const newEmail = "payalaharshavardhanvarma44@gmail.com";
    const newPassword = "Kittu@761681";

    console.log(`Authenticating as ${oldEmail}...`);
    const userCredential = await signInWithEmailAndPassword(auth, oldEmail, oldPassword);
    const user = userCredential.user;
    
    console.log("Updating password...");
    await updatePassword(user, newPassword);
    
    console.log("Updating email...");
    await updateEmail(user, newEmail);
    
    console.log("✅ Successfully updated admin credentials! The UID is preserved.");
    process.exit(0);
  } catch (error: any) {
    console.error("Failed to update credentials:", error.message);
    process.exit(1);
  }
}

changeCredentials();
