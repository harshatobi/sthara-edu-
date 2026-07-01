import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!admin || !admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin not initialized' });
  }

  const db = admin.firestore();

  try {
    const parents: any[] = [];
    const globalParentsSnap = await db.collection('global_users').where('role', '==', 'parent').get();
    globalParentsSnap.forEach(d => {
      parents.push({ id: d.id, collection: 'global_users', ...d.data() });
    });

    const localParentsSnap = await db.collection('users').where('role', '==', 'parent').get();
    localParentsSnap.forEach(d => {
      parents.push({ id: d.id, collection: 'users', ...d.data() });
    });

    const students: any[] = [];
    const globalStudentsSnap = await db.collection('global_users').where('role', '==', 'student').get();
    globalStudentsSnap.forEach(d => {
      students.push({ id: d.id, collection: 'global_users', ...d.data() });
    });

    const localStudentsSnap = await db.collection('users').where('role', '==', 'student').get();
    localStudentsSnap.forEach(d => {
      students.push({ id: d.id, collection: 'users', ...d.data() });
    });

    return NextResponse.json({
      success: true,
      parents,
      students
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err)
    });
  }
}
