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
}, "checkdb3");
const db = getFirestore(app, "default");

async function main() {
  console.log("\n=== SCHOOL CODES ===");
  const schools = await db.collection("schools").get();
  schools.forEach(d => {
    const x = d.data();
    console.log("  docId:", d.id, "| code:", x.code, "| name:", x.name);
  });

  console.log("\n=== STUDENTS by schoolId:sch-test-batch ===");
  const s1 = await db.collection("users").where("schoolId","==","sch-test-batch").get();
  console.log(" Count:", s1.size);
  s1.forEach(d => { const x=d.data(); console.log(" ",x.name, x.role, x.studentClass); });

  console.log("\n=== STUDENTS by schoolId:SDS ===");
  const s2 = await db.collection("users").where("schoolId","==","SDS").get();
  console.log(" Count:", s2.size);
  s2.forEach(d => { const x=d.data(); console.log(" ",x.name, x.role, x.studentClass); });

  console.log("\n=== STUDENTS by schoolId:test100 ===");
  const s3 = await db.collection("users").where("schoolId","==","test100").get();
  console.log(" Count:", s3.size);
  s3.forEach(d => { const x=d.data(); console.log(" ",x.name, x.role, x.studentClass); });

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
