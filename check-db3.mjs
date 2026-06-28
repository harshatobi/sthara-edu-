import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
}, "checkdb4");
const db = getFirestore(app, "default");

async function main() {
  console.log("\n=== global_users (all) ===");
  const gu = await db.collection("global_users").get();
  console.log(" Total:", gu.size);
  gu.forEach(d => {
    const x = d.data();
    console.log(" ", x.name, "| role:", x.role, "| schoolId:", x.schoolId, "| class:", x.studentClass);
  });

  console.log("\n=== schools/sch-test-batch/users ===");
  const su = await db.collection("schools").doc("sch-test-batch").collection("users").get();
  console.log(" Count:", su.size);
  su.forEach(d => { const x=d.data(); console.log(" uid:", d.id, "name:", x.name, "role:", x.role, "class:", x.studentClass); });

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
