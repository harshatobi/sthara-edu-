import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, ".env.local"), "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim().replace(/^"|"$/g, "");
}
const app = initializeApp({
  credential: cert({
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
}, "fix-sa");
const db = getFirestore(app, "default");
const auth = getAuth(app);

async function main() {
  const email = "admin@sthara.com";
  const newPassword = "Sthara@Admin2024";

  // Try to find existing auth user by email
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log("Found existing auth user:", uid);
    // Reset password
    await auth.updateUser(uid, { password: newPassword });
    console.log("Password updated.");
  } catch(e) {
    // Create new auth user
    console.log("No auth user found for", email, "- creating new one...");
    const newUser = await auth.createUser({ email, password: newPassword, displayName: "Super Admin" });
    uid = newUser.uid;
    console.log("Created new auth user:", uid);
  }

  // Update/create superadmin docs with correct UID
  await db.collection("superadmins").doc(uid).set({ email, name: "Super Admin", role: "superadmin" }, { merge: true });
  await db.collection("global_users").doc(uid).set({ email, name: "Super Admin", role: "superadmin" }, { merge: true });
  console.log("Firestore superadmin docs updated.");

  console.log("\n=============================");
  console.log("SUPERADMIN CREDENTIALS:");
  console.log("  Email   :", email);
  console.log("  Password:", newPassword);
  console.log("  UID     :", uid);
  console.log("  URL     : https://stharaschoolos.vercel.app/superadmin");
  console.log("=============================\n");
  process.exit(0);
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });
