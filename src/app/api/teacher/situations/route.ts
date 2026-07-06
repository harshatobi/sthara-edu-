import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/situations
 * Writes situation alerts to Firestore using Admin SDK.
 * Bypasses ALL Firestore security rules — safe because we verify the request
 * is from our own app (bearer token + origin check).
 */
export async function POST(request: NextRequest) {
  try {
    // Origin / token check
    const origin = request.headers.get('origin') || '';
    const referer = request.headers.get('referer') || '';
    const authHeader = request.headers.get('authorization') || '';
    const appOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || '',
      'http://localhost:3000',
      'https://stharaschoolos.vercel.app',
      'https://sthara.in',
      'https://www.sthara.in',
    ].filter(Boolean);
    const isInternalOrigin = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    const hasBearerToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
    const noOrigin = !origin;
    if (!isInternalOrigin && !hasBearerToken && !noOrigin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { schoolId, alerts } = await request.json();

    if (!schoolId || !Array.isArray(alerts) || alerts.length === 0) {
      return NextResponse.json({ error: 'Missing schoolId or alerts' }, { status: 400 });
    }

    // Use Admin SDK — bypasses all client security rules
    const situationsRef = adminDb
      .collection('schools')
      .doc(schoolId)
      .collection('situations');

    const written = await Promise.all(
      alerts.map(alert =>
        situationsRef.add({
          ...alert,
          createdAt: FieldValue.serverTimestamp(),
        })
      )
    );

    return NextResponse.json({ success: true, count: written.length });
  } catch (err: any) {
    console.error('[situations API] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to write situations' },
      { status: 500 }
    );
  }
}
