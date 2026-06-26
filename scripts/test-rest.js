const fetch = require('node-fetch'); // Next.js polyfills this usually, but let's use native fetch in Node 18+
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

async function run() {
  const urlDPS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/sch-dps/assignments`;
  const urlOAK = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/sch-oak/assignments`;

  const resDPS = await fetch(urlDPS);
  const dataDPS = await resDPS.json();
  console.log('DPS Assignments:', dataDPS.documents ? dataDPS.documents.length : 0);

  const resOAK = await fetch(urlOAK);
  const dataOAK = await resOAK.json();
  console.log('OAK Assignments:', dataOAK.documents ? dataOAK.documents.length : 0);
}

run().catch(console.error);
