const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAtR8egIZAUWxu2Z740u8ako6vV3koZ1rQ",
  authDomain: "sthara-edu.firebaseapp.com",
  projectId: "sthara-edu",
  storageBucket: "sthara-edu.firebasestorage.app",
  messagingSenderId: "874599942767",
  appId: "1:874599942767:web:4bd929d91cfd0d6e3edb9a",
  measurementId: "G-8HV77F9VDX"
};

const app = initializeApp(firebaseConfig);

const databaseIds = [
  undefined, // defaults to '(default)'
  'default',
  'sthara-edu',
  'sthara-edu-db',
  'STHARA-EDU'
];

async function test() {
  for (const dbId of databaseIds) {
    try {
      console.log(`\nTesting Database ID: ${dbId === undefined ? "'(default)'" : `'${dbId}'`}`);
      const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
      const snap = await getDocs(collection(db, 'superadmins'));
      console.log(`✅ SUCCESS! Connected to database ID: ${dbId === undefined ? '(default)' : dbId}`);
      console.log(`Docs found: ${snap.size}`);
      return;
    } catch (err) {
      console.error(`❌ FAILED for ${dbId === undefined ? '(default)' : dbId}:`, err.message.split('\n')[0]);
    }
  }
}

test();
