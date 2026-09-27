import { NextResponse, type NextRequest } from 'next/server';
import { requireFeedCaller } from '@/lib/feed/access';
import { RegisterError, saveRegister } from '@/lib/feed/attendance';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/attendance
 * { className, day: 'YYYY-MM-DD', marks: [{ studentId, status, note? }] }
 *
 * The class teacher marks their class (see lib/feed/attendance.ts for the rules).
 * Saving runs the absence-streak and exam-day checks for the class at once.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedCaller(req);
  if ('res' in auth) return auth.res;
  const body = await req.json().catch(() => ({}));
  const marks = (Array.isArray(body.marks) ? body.marks : []).map((m: any) => ({
    studentId: typeof m?.studentId === 'string' ? m.studentId : '', status: typeof m?.status === 'string' ? m.status : '', note: typeof m?.note === 'string' ? m.note : null,
  }));
  try {
    const r = await saveRegister(auth.db, auth.me, typeof body.className === 'string' ? body.className.trim().slice(0, 40) : '', typeof body.day === 'string' ? body.day : '', marks);
    return NextResponse.json({ ok: true, saved: r.saved, counts: r.counts, raised: r.raised });
  } catch (e: any) {
    if (e instanceof RegisterError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[attendance]', e?.message);
    return NextResponse.json({ error: 'Could not save the register. Try again.' }, { status: 500 });
  }
}
