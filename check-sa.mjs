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
}, "check-sa");
const db = getFirestore(app, "default");
const authAdmin = getAuth(app);

async function main() {
  console.log("\n=== SUPERADMINS collection ===");
  const snap = await db.collection("superadmins").get();
  for (const d of snap.docs) {
    const data = d.data();
    console.log("  UID:", d.id);
    console.log("  Name:", data.name);
    console.log("  Email (stored):", data.email || "(not in doc)");
    // Get email from Firebase Auth
    try {
      const user = await authAdmin.getUser(d.id);
      console.log("  Email (Auth):", user.email);
    } catch(e) {
      console.log("  Auth lookup failed:", e.message);
    }
  }
  console.log("\n=== global_users superadmins ===");
  const gu = await db.collection("global_users").where("role","==","superadmin").get();
  for (const d of gu.docs) {
    const data = d.data();
    console.log("  UID:", d.id, "| Name:", data.name, "| Email:", data.email);
    try {
      const user = await authAdmin.getUser(d.id);
      console.log("  Email (Auth):", user.email);
    } catch(e) {}
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
