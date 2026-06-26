const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const SCHOOLS = [
  { id: 'sch-dps', name: 'Delhi Public School', code: 'DPS101', curriculum: 'CBSE' },
  { id: 'sch-oak', name: 'Oakridge International', code: 'OAK202', curriculum: 'State Board' }
];

const CLASSES = ['Class 10', 'Class 11'];
const STUDENTS_PER_CLASS = 15;
const TEACHERS_PER_SCHOOL = 2;

async function createAuthUser(email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error?.message === 'EMAIL_EXISTS') {
      const signRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const signData = await signRes.json();
      if (!signRes.ok) throw new Error(signData.error?.message || 'Login failed');
      return signData.localId;
    }
    throw new Error(data.error?.message || 'Failed to create user');
  }
  return data.localId;
}

function toFirestoreMap(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'number') fields[key] = { integerValue: value.toString() };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
  }
  return { fields };
}

async function writeDoc(collection, docId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?documentId=${docId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toFirestoreMap(data))
  });
  if (!res.ok) {
    const errorData = await res.json();
    if (errorData.error?.status === 'ALREADY_EXISTS') {
      // Patch instead
      const patchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
      await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreMap(data))
      });
      return;
    }
    console.error(`Error writing ${collection}/${docId}`, errorData);
    throw new Error('Write failed');
  }
}

async function run() {
  console.log("Starting DB generation via REST...");
  for (const school of SCHOOLS) {
    console.log(`Setting up ${school.name}...`);
    await writeDoc('schools', school.id, {
      name: school.name,
      code: school.code,
      curriculum: school.curriculum
    });

    for (let i = 1; i <= TEACHERS_PER_SCHOOL; i++) {
      const email = `teacher${i}_${school.id}@demo.com`;
      const password = `Teach${school.code}${i}!`;
      const uid = await createAuthUser(email, password);
      await writeDoc('users', uid, {
        name: `Teacher ${i} (${school.code})`,
        email,
        role: 'teacher',
        schoolId: school.id,
        teacherClass: CLASSES[(i - 1) % CLASSES.length],
        demoPassword: password
      });
      console.log(` Created teacher ${email}`);
    }

    let c = 1;
    for (const className of CLASSES) {
      for (let i = 1; i <= STUDENTS_PER_CLASS; i++) {
        const safeClass = className.replace(/\s+/g, '_').toLowerCase();
        const email = `student${c}_${school.id}_${safeClass}@demo.com`;
        const password = `Pass${school.code}${c}!`;
        const uid = await createAuthUser(email, password);
        await writeDoc('users', uid, {
          name: `Student ${c} (${school.code})`,
          email,
          role: 'student',
          schoolId: school.id,
          studentClass: className,
          demoPassword: password
        });
        c++;
      }
    }
  }
  console.log("DONE");
}

run().catch(console.error);
