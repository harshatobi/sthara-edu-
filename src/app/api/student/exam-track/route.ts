import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { getSchoolPolicy } from '@/lib/settings/server';
import { EXAMS } from '@/lib/curriculum/exams';
import { normaliseClass } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

/**
 * The student's competitive exam track.
 *   GET  -> { available: [{ id, exam, cycle, track }], chosen: string[] }
 *   POST { exams: string[] } -> { chosen }
 *
 * A student can only pick exams their school has switched on (ops school
 * settings, examTracks) and that draw on their class. Stored on
 * users.metadata.targetExams.
 */
async function context(userId: string) {
  const db = createAdminClient();
  const { data: me } = await db.from('users').select('school_id, student_class, metadata').eq('id', userId).maybeSingle();
  const policy = me?.school_id ? await getSchoolPolicy(me.school_id, db) : null;
  const cls = normaliseClass(me?.student_class);
  const available = EXAMS.filter(e => policy?.examTracks.includes(e.id) && (!cls || e.classes.includes(cls)));
  const meta = (me?.metadata && typeof me.metadata === 'object' ? me.metadata : {}) as Record<string, unknown>;
  const chosen = Array.isArray(meta.targetExams) ? (meta.targetExams as unknown[]).filter((x): x is string => typeof x === 'string' && available.some(e => e.id === x)) : [];
  return { db, available, chosen, meta };
}

const view = (a: typeof EXAMS) => a.map(e => ({ id: e.id, exam: e.exam, cycle: e.cycle, track: e.track }));

export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'Only students have an exam track.' }, { status: 403 });
  const { available, chosen } = await context(user.id);
  return NextResponse.json({ available: view(available), chosen });
}

export async function POST(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'Only students have an exam track.' }, { status: 403 });
  const rl = checkRateLimit(`exam-track:${user.id}`, ...limitOf('examTrack'));
  if (!rl.allowed) return NextResponse.json({ error: 'Too many changes. Try again shortly.' }, { status: 429 });

  let body: { exams?: unknown } | null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const want = body?.exams;
  if (!Array.isArray(want) || want.some(x => typeof x !== 'string')) return NextResponse.json({ error: 'exams must be a list of exam ids.' }, { status: 400 });

  const { db, available, meta } = await context(user.id);
  const bad = (want as string[]).filter(x => !available.some(e => e.id === x));
  if (bad.length) return NextResponse.json({ error: 'Your school has not switched on that exam track for your class.' }, { status: 403 });
  const chosen = available.map(e => e.id).filter(id => (want as string[]).includes(id));

  const { error: upErr } = await db.from('users').update({ metadata: { ...meta, targetExams: chosen } }).eq('id', user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ chosen });
}
