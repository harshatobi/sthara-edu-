/**
 * wipe-auth.mjs
 * Deletes ALL Firebase Auth users EXCEPT the superadmin account.
 */
import { initializeApp, cert } from "firebase-admin/app";
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
}, "wipe-auth");

const auth = getAuth(app);

const SUPERADMIN_EMAIL = "admin@sthara.com";

async function main() {
  console.log("\n🔥 Wiping ALL Firebase Auth users (except superadmin)\n");

  let pageToken;
  const toDelete = [];
  let kept = 0;

  // List all users (paginated)
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      if (user.email === SUPERADMIN_EMAIL) {
        console.log("  ⟳ Keeping superadmin:", user.email, "(uid:", user.uid + ")");
        kept++;
      } else {
        toDelete.push(user.uid);
        console.log("  🗑  Queued for delete:", user.email || "(no email)", "uid:", user.uid);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`\n  Total to delete: ${toDelete.length} | Keeping: ${kept}`);

  if (toDelete.length === 0) {
    console.log("  Nothing to delete.");
    process.exit(0);
  }

  // Delete in batches of 1000
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch);
    console.log(`  ✓ Deleted ${result.successCount} users (${result.failureCount} failed)`);
    if (result.errors.length > 0) {
      result.errors.forEach(e => console.log("    ✗", e.error.message));
    }
  }

  console.log("\n✅ AUTH WIPE COMPLETE. All accounts cleared except superadmin.\n");
  process.exit(0);
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
