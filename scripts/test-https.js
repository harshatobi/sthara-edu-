const https = require('https');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  const urlDPS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/sch-dps/assignments`;
  const urlOAK = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/schools/sch-oak/assignments`;

  const dataDPS = await get(urlDPS);
  console.log('DPS Assignments:', dataDPS.documents ? dataDPS.documents.length : 0);
  if (dataDPS.documents) {
    dataDPS.documents.forEach(d => console.log('DPS:', d.name));
  }

  const dataOAK = await get(urlOAK);
  console.log('OAK Assignments:', dataOAK.documents ? dataOAK.documents.length : 0);
  if (dataOAK.documents) {
    dataOAK.documents.forEach(d => console.log('OAK:', d.name));
  }
}

run().catch(console.error);
