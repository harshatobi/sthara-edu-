/**
 * list-collections.mjs — diagnostic: lists all top-level Firestore collections
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, '.env.local'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
}

initializeApp({
  credential: cert({
    projectId:   env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

async function main() {
  console.log('\n🔍  Listing all top-level Firestore collections...\n');
  const cols = await db.listCollections();
  for (const col of cols) {
    const snap = await col.limit(3).get();
    console.log(`📁  /${col.id}  (${snap.size}+ docs)`);
    snap.docs.forEach(d => {
      const data = d.data();
      const preview = Object.keys(data).slice(0, 4).map(k => `${k}: ${JSON.stringify(data[k]).slice(0,40)}`).join(', ');
      console.log(`     └─ ${d.id}: { ${preview} }`);
    });
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
