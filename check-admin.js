require('dotenv').config({path: '.env.local'});
const admin = require('firebase-admin');

const email = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: email,
    privateKey: key
  })
});

const db = admin.firestore();
db.collection('schools').get().then(snap => {
  if (snap.empty) {
    console.log('ADMIN SDK: NO SCHOOLS FOUND IN DATABASE');
  } else {
    snap.forEach(doc => console.log('Found:', doc.id, doc.data()));
  }
  process.exit(0);
}).catch(e => {
  console.error('ADMIN SDK ERROR:', e.message);
  process.exit(1);
});
