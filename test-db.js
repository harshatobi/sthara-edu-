const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, connectFirestoreEmulator } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'test',
  projectId: 'demo-sthara',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function check() {
  const users = await getDocs(collection(db, 'users'));
  console.log("Users:");
  users.forEach(u => console.log(u.id, u.data()));
  process.exit(0);
}
check();
