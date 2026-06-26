require('dotenv').config({path: '.env.local'});
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const db = getFirestore(app);

console.log('Fetching schools from default database...');
getDocs(collection(db, 'schools')).then(snap => {
  if (snap.empty) {
    console.log('CLIENT SDK: NO SCHOOLS FOUND IN DATABASE');
  } else {
    snap.forEach(doc => console.log('Found:', doc.id, doc.data()));
  }
  process.exit(0);
}).catch(e => {
  console.error('CLIENT SDK ERROR:', e.message);
  process.exit(1);
});
