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
    projectId:   env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
}, "checkdb2");

const db = getFirestore(app, "default");

async function main() {
  console.log("\n=== SCHOOLS ===");
  const schools = await db.collection("schools").get();
  schools.forEach(d => {
    const x = d.data();
    console.log(`  schoolDocId: ${d.id} | joinCode: ${x.joinCode||"?"} | name: ${x.name}`);
  });

  console.log("\n=== TEACHERS ===");
  const teachers = await db.collection("users").where("role","==","teacher").get();
  if (teachers.empty) console.log("  (no teachers)");
  teachers.forEach(d => {
    const x = d.data();
    console.log(`  uid: ${d.id} | name: ${x.name} | schoolId: ${x.schoolId} | teacherClass: ${x.teacherClass}`);
  });

  console.log("\n=== STUDENTS ===");
  const students = await db.collection("users").where("role","==","student").get();
  if (students.empty) console.log("  (no students found at all)");
  students.forEach(d => {
    const x = d.data();
    console.log(`  uid: ${d.id} | name: ${x.name} | schoolId: ${x.schoolId} | studentClass: ${x.studentClass}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
