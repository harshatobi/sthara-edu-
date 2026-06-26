const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(admin.app(), 'default');

async function test() {
  try {
    const res = await db.collection('test').add({ test: true });
    console.log('Success! Doc ID:', res.id);
  } catch (err) {
    console.error('Error with default DB:', err.message, err.code);
  }
}

test();
