/**
 * full-wipe.mjs
 * Deletes ALL Firestore data except superadmin accounts.
 * Collections wiped: users, global_users, schools (+ all subcollections)
 */
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
}, "full-wipe");

const db = getFirestore(app, "default");

async function deleteCollection(colRef, label) {
  const snap = await colRef.get();
  if (snap.empty) { console.log(`  ${label}: empty, skipping`); return 0; }
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`  ✓ Deleted ${snap.size} docs from ${label}`);
  return snap.size;
}

async function deleteSchoolSubcollections(schoolId) {
  const subs = ["assignments", "notifications", "situations", "users", "attendance", "grades", "events"];
  for (const sub of subs) {
    const colRef = db.collection("schools").doc(schoolId).collection(sub);
    const snap = await colRef.get();
    if (snap.empty) continue;
    // For assignments, also delete submissions subcollection
    if (sub === "assignments") {
      for (const aDoc of snap.docs) {
        const subsSnap = await aDoc.ref.collection("submissions").get();
        if (!subsSnap.empty) {
          const b = db.batch();
          subsSnap.docs.forEach(d => b.delete(d.ref));
          await b.commit();
          console.log(`    ✓ Deleted ${subsSnap.size} submissions for assignment ${aDoc.id}`);
        }
      }
    }
    const b = db.batch();
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    console.log(`    ✓ Deleted ${snap.size} docs from schools/${schoolId}/${sub}`);
  }
}

async function main() {
  console.log("\n🔥 FULL DATABASE WIPE (keeping superadmins)\n");

  // 1. Wipe users (all)
  console.log("Wiping: users...");
  await deleteCollection(db.collection("users"), "users");

  // 2. Wipe global_users (skip superadmins)
  console.log("Wiping: global_users (skipping superadmins)...");
  const guSnap = await db.collection("global_users").get();
  let guDeleted = 0;
  const guBatch = db.batch();
  for (const d of guSnap.docs) {
    const data = d.data();
    if (data.role === "superadmin") {
      console.log(`  ⟳ Keeping superadmin: ${data.name || d.id}`);
      continue;
    }
    guBatch.delete(d.ref);
    guDeleted++;
  }
  if (guDeleted > 0) await guBatch.commit();
  console.log(`  ✓ Deleted ${guDeleted} docs from global_users`);

  // 3. Wipe schools (and all subcollections)
  console.log("Wiping: schools + subcollections...");
  const schoolsSnap = await db.collection("schools").get();
  for (const schoolDoc of schoolsSnap.docs) {
    console.log(`  School: ${schoolDoc.id} (${schoolDoc.data().name})`);
    await deleteSchoolSubcollections(schoolDoc.id);
    await schoolDoc.ref.delete();
    console.log(`  ✓ Deleted school doc: ${schoolDoc.id}`);
  }

  // 4. Wipe any top-level situations
  console.log("Wiping: top-level situations...");
  const sitSnap = await db.collection("situations").get();
  if (!sitSnap.empty) {
    const b = db.batch();
    sitSnap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    console.log(`  ✓ Deleted ${sitSnap.size} situations`);
  } else {
    console.log("  situations: empty");
  }

  console.log("\n✅ WIPE COMPLETE. Superadmin accounts preserved.\n");
  process.exit(0);
}

main().catch(e => { console.error("❌ Error:", e); process.exit(1); });
