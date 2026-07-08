import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/get-students
 * Body: { schoolId, classFilter?: string }
 * Returns all students for a school (or filtered by class/branch).
 * Uses Admin SDK — bypasses ALL Firestore security rules.
 *
 * This is needed because /users and /global_users only allow reading
 * your own document via client SDK. Teachers need to read all students.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const appOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || '',
      'http://localhost:3000',
      'https://stharaschoolos.vercel.app',
      'https://sthara.in',
      'https://www.sthara.in',
    ].filter(Boolean);
    const isInternal = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    const hasToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
    if (!isInternal && !hasToken && origin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not initialized — check server credentials' }, { status: 500 });
    }

    const { schoolId, classFilter } = await req.json();
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    // Query both /users and /global_users collections for students of this school
    const [usersSnap, globalSnap] = await Promise.all([
      adminDb.collection('users')
        .where('schoolId', '==', schoolId)
        .where('role', '==', 'student')
        .get(),
      adminDb.collection('global_users')
        .where('schoolId', '==', schoolId)
        .where('role', '==', 'student')
        .get(),
    ]);

    const seen = new Set<string>();
    const students: any[] = [];

    [...usersSnap.docs, ...globalSnap.docs].forEach(d => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const data = d.data();
        students.push({
          id: d.id,
          name: data.name || data.displayName || 'Unknown',
          email: data.email || '',
          studentClass: data.studentClass || data.branch || '',
          branch: data.branch || '',
          year: data.year || '',
          semester: data.semester || '',
          customStudentId: data.customStudentId || '',  // needed for per-subject filtering
          schoolId: data.schoolId || schoolId,
          role: data.role || 'student',
          // Performance fields
          weakTopics: data.weakTopics || [],
          strongTopics: data.strongTopics || [],
          historicalWeaknesses: data.historicalWeaknesses || [],
          energyLevel: data.energyLevel || null,
          wellnessLastCheck: data.wellnessLastCheck || null,
          averageScore: data.averageScore || null,
          masteryScore: data.masteryScore || null,
        });
      }
    });

    // Optional class/branch filter
    const filtered = classFilter
      ? students.filter(s => s.studentClass === classFilter || s.branch === classFilter)
      : students;

    return NextResponse.json({ students: filtered, total: filtered.length });
  } catch (err: any) {
    console.error('[get-students]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch students' }, { status: 500 });
  }
}
