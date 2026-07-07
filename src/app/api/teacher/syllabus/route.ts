import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * Handles all syllabus CRUD operations server-side using Admin SDK.
 * Bypasses Firestore security rules for global_users teachers.
 *
 * GET  ?schoolId=X&teacherId=Y       → fetch modules for teacher
 * POST { schoolId, teacherId, ...fields }  → create module
 * PUT  { schoolId, id, ...fields }    → update module
 * DELETE { schoolId, id }             → delete module
 */

function authCheck(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  const authHeader = req.headers.get('authorization') || '';
  const appOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || '',
    'http://localhost:3000',
    'https://stharaschoolos.vercel.app',
    'https://sthara.in',
    'https://www.sthara.in',
  ].filter(Boolean);
  const isInternal = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
  const hasToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
  return isInternal || hasToken || !origin;
}

export async function GET(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: 'Admin SDK not initialized' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  const teacherId = searchParams.get('teacherId');

  if (!schoolId || !teacherId) {
    return NextResponse.json({ error: 'Missing schoolId or teacherId' }, { status: 400 });
  }

  try {
    const snap = await adminDb
      .collection('schools').doc(schoolId)
      .collection('syllabus')
      .where('teacherId', '==', teacherId)
      .get();

    const modules = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
      };
    });
    return NextResponse.json({ modules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: 'Admin SDK not initialized' }, { status: 500 });

  try {
    const body = await req.json();
    const { schoolId, id, ...fields } = body;
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    const docId = id || `syl_${Date.now()}`;
    await adminDb
      .collection('schools').doc(schoolId)
      .collection('syllabus').doc(docId)
      .set({ ...fields, createdAt: FieldValue.serverTimestamp() });

    return NextResponse.json({ success: true, id: docId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: 'Admin SDK not initialized' }, { status: 500 });

  try {
    const body = await req.json();
    const { schoolId, id, ...fields } = body;
    if (!schoolId || !id) return NextResponse.json({ error: 'Missing schoolId or id' }, { status: 400 });

    await adminDb
      .collection('schools').doc(schoolId)
      .collection('syllabus').doc(id)
      .update(fields);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: 'Admin SDK not initialized' }, { status: 500 });

  try {
    const body = await req.json();
    const { schoolId, id } = body;
    if (!schoolId || !id) return NextResponse.json({ error: 'Missing schoolId or id' }, { status: 400 });

    await adminDb
      .collection('schools').doc(schoolId)
      .collection('syllabus').doc(id)
      .delete();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
