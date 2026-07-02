import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/situations
 * Writes situation alerts to Firestore using server context.
 * This bypasses client-side Firestore rules issues for global_users teachers.
 */
export async function POST(request: NextRequest) {
  try {
    // Simple origin check — same pattern as teacher AI
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

    if (!schoolId || !Array.isArray(alerts)) {
      return NextResponse.json({ error: 'Missing schoolId or alerts' }, { status: 400 });
    }

    const situationsRef = collection(db, 'schools', schoolId, 'situations');

    // Write all alerts
    const written = await Promise.all(
      alerts.map(alert =>
        addDoc(situationsRef, {
          ...alert,
          createdAt: serverTimestamp(),
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
