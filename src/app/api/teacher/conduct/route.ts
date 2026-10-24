import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { findStudents } from '@/lib/cocurricular/server';
import { cancel, linkableIncidents, propose, proposedBy } from '@/lib/conduct/discipline';
import { counsellorsOf, refer, referredBy } from '@/lib/conduct/counselling';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Discipline and counselling for teachers (brief 07): any teacher proposes a discipline action (the vice principal or
 * principal approves) and refers a student to the counsellor. Teachers see their own proposals and whether their
 * referrals were seen, nothing more.
 *   GET                       what I proposed and referred, my classes, whether the school has a counsellor
 *   GET ?cls= | ?q=           students to pick
 *   GET ?incidentsFor=        incidents about a student (register id) to link an action to
 *   POST { action }:
 *     propose { studentId, kind, onDate, untilDate?, reason, details?, incidentId? }
 *     withdraw { id, reason }   my own proposal, before it is approved
 *     refer { studentId, reason }
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const p = req.nextUrl.searchParams;
  try {
    if (p.get('cls') || p.get('q')) return NextResponse.json({ students: await findStudents(db, staff.schoolId, { cls: p.get('cls')?.slice(0, 40), search: p.get('q')?.slice(0, 60) }) });
    const forStudent = p.get('incidentsFor');
    if (forStudent) {
      if (!UUID.test(forStudent)) return NextResponse.json({ incidents: [] });
      const { data: st } = await db.from('students').select('user_id').eq('id', forStudent).eq('school_id', staff.schoolId).maybeSingle();
      return NextResponse.json({ incidents: await linkableIncidents(db, staff.schoolId, st?.user_id ?? null, staff.id) });
    }
    const [actions, referrals, counsellors] = await Promise.all([
      proposedBy(db, staff.schoolId, staff.id), referredBy(db, staff.schoolId, staff.id), counsellorsOf(db, staff.schoolId),
    ]);
    return NextResponse.json({
      actions, referrals, hasCounsellor: counsellors.length > 0,
      classes: [...new Set(staff.scope.map(e => e.cls))].sort(),
    });
  } catch (e) {
    console.error('[teacher/conduct]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: staff.id, schoolId: staff.schoolId };
  const sid = typeof b.studentId === 'string' && UUID.test(b.studentId) ? b.studentId : null;
  const out = b.action === 'propose' ? (sid ? await propose(db, a, sid, b, null, true) : { ok: false as const, error: 'Pick the student.', status: 400 })
    : b.action === 'withdraw' ? (typeof b.id === 'string' && UUID.test(b.id) ? await cancel(db, a, null, b.id, typeof b.reason === 'string' ? b.reason : '') : { ok: false as const, error: 'Pick the action.', status: 400 })
      : b.action === 'refer' ? (sid ? await refer(db, { ...a, kind: 'teacher' }, sid, b) : { ok: false as const, error: 'Pick the student.', status: 400 })
        : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
