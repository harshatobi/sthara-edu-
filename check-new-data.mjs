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
}, "check-new");
const db = getFirestore(app, "default");
const auth = getAuth(app);

async function main() {
  console.log("\n=== ALL SCHOOLS (full data) ===");
  const schools = await db.collection("schools").get();
  console.log("Count:", schools.size);
  schools.forEach(d => {
    console.log("\n  docId:", d.id);
    console.log("  data:", JSON.stringify(d.data(), null, 4));
  });

  console.log("\n=== ALL USERS (users + global_users) ===");
  const users = await db.collection("users").get();
  const gu = await db.collection("global_users").get();
  console.log("users count:", users.size, "| global_users count:", gu.size);
  [...users.docs, ...gu.docs].forEach(d => {
    const x = d.data();
    console.log(" ", x.role, "|", x.name, "| schoolId:", x.schoolId, "| class:", x.studentClass || x.teacherClass);
  });

  console.log("\n=== AUTH USERS ===");
  const authList = await auth.listUsers(100);
  authList.users.forEach(u => console.log("  email:", u.email, "uid:", u.uid));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
