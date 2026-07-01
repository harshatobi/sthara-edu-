/**
 * Fix Superadmin Firestore Collection
 * The AuthContext checks 'superadmins' collection first.
 * This script writes the profile doc there.
 * Run: node scripts/fix-superadmin-collection.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDHA7grKhPcQbyL\nOV6XdpUHbpXGIMHS66KurOqDkw+mphvGodmNC6bZPwmX+hVVFbVI1Ir+AJbDdnbI\nNUehmQ84mZH+BuGbPtkBfhaU573PmebTrIy2EJZsULvcV3C4CKoqD6jDcbe95oHI\nNOIGOMeWAXLhpd92JANraZVVpsV4YwX7Rx7swWocnKRVOF40pXKiqDcQlTJRBZsg\nQjRTOr6U8B8Y8yKJX6MuUtWguZeBlcX1h1P9phUQLsR8dRaSPBpabRPRwNjH0Q6H\noylkKixEv08CwpaFchiWJhwTuBCF03kSGIm0HsBw6j3qjA641yeiPah+ix3wjecB\nCfNOFX0HAgMBAAECggEAFc/7jIeVG6v8zUmha3psxR7Cva9zbvmyn/CF15vzuDE2\nlCPDI2lmhSMamxSm5+d0MiJRhZts6sl+JV1pl3WeLHbwgGYirhBKWpaGRRXNQQa+\nPO8JkR7qTb7fiDvxN8qDVA7ZUWqSV/b+vIHHUCVDAtbvz3mNr3YtBcXRv0yDEjme\nXQvnL3IOwm+zkKKiPBKB4GORDFdLGitBncGM0wks+Hq/+a/iYfawc3YQVvaVgYOV\nKwaiDn9lVH5fZhSe5yVres5mjZFF/N9omJwl8RZTctTIRpFKgc81M4CMFTeWm7lt\nKobAujTcnFNe2ry5srcaJM4alDaUuenL9buAM7u8OQKBgQD/2xUmmHdUkxrdlSoi\nncsSaqc7MZC7J1d2wnKrSa0J0j0h9QR1DUSFQ9BW70k4JjCsf3Li70csxDbqto0E\nE0WrcOD2ngjerxItV0ZYZzBakudBLuhyc/M7FFTG0Q3m+Ek7BAq0i04/8GfhgIS3\nUok9jHgbHZtT6r7AwDsihTqAlQKBgQDHIG9nlYBbKNXr8jGObSns7ZKFVjhXUfC5\nhKbrxiiq1FCtpfNzbuGLQNitxa9d5G0qVTEFj+epwMUjo1XX11+MTpcUCzPXPF8H\nG+D7/zYsdqNf7dAx23nW9bD8qyLqdZ/hLfRXWkwJI0/jhTybdKydNqiHIWKod9Zs\nqInkBY1UKwKBgQDVS2PfkB1zIUu1TAQbZaaEjOsrOs/oZgzRUZtc1oft9xnFtEhp\n+IyV+Im337YPnC7Zr0osi8OvO0h49YSr0BE1sl2o2uiUFCk4KVjYm/XAnFUzjxJz\nT9yG9RUTxfYsBfKuw1jVWIj8XsOLR6PcXG9TI0aBfHYgSEOL1vW1epHh3QKBgQCk\noDY6ZylVNG+XwAYkgC/XR5qJTf0KhB4G4pq19oAMq7d/uOGLH7KsVBJPqE4RzBZM\nl14OASk/+LWDfzgrWE4QS7Evywsy+SB/Whcpf5ekLvlnB8/GSHN0um92lW4qdNCX\ndEy8I1UVgPI9Yhv3UgCbgWLXRUyxh1HpR3Wo5MYxPQKBgQC5NszAI8L6ye6zrm5k\n/V2+dRzI6KG5iT+fMEAZ3UTMxRw0twZ9KHtSuYGPNFU7HQheDAJvjn9CgMeCW1C0\nPOYxIShDit++ZC8oXuhU47OrgydFYdkwY4T9C5U/spJ2h8+uNLZR11dpaC2ArOjQ\ng7yS2ccLnldfIkWP9SAzHSwtOw==\n-----END PRIVATE KEY-----\n`;

initializeApp({
  credential: cert({
    projectId: 'sthara-edu',
    clientEmail: 'firebase-adminsdk-fbsvc@sthara-edu.iam.gserviceaccount.com',
    privateKey,
  }),
});

const auth = getAuth();
const db = getFirestore();

const SUPERADMIN_EMAIL = 'admin@sthara.com';

async function main() {
  console.log('\n🔧 Fixing Superadmin Firestore Collections');
  console.log('==========================================\n');

  // Get the UID from Auth
  const user = await auth.getUserByEmail(SUPERADMIN_EMAIL);
  const uid = user.uid;
  console.log(`Found Auth user: ${uid} (${user.email})`);

  const profileData = {
    uid,
    email: SUPERADMIN_EMAIL,
    name: 'Sthara Admin',
    role: 'superadmin',
    createdAt: new Date().toISOString(),
  };

  // Write to ALL collections the AuthContext checks
  await db.collection('superadmins').doc(uid).set(profileData, { merge: true });
  console.log('✓ Written to: superadmins/' + uid);

  await db.collection('global_users').doc(uid).set(profileData, { merge: true });
  console.log('✓ Written to: global_users/' + uid);

  await db.collection('users').doc(uid).set(profileData, { merge: true });
  console.log('✓ Written to: users/' + uid);

  console.log('\n✅ Done! Try logging in now at stharaschoolos.vercel.app/login');
  console.log(`   Email    : ${SUPERADMIN_EMAIL}`);
  console.log('   Password : Sthara@2025\n');
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
