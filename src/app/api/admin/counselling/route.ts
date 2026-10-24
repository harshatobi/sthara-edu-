import { NextResponse, type NextRequest } from 'next/server';
import { deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { addNote, caseNotes, cases, closeReferral, counsellorsOf, inbox, openCase, refer, referredBy, searchStudents, setCaseStatus } from '@/lib/conduct/counselling';

export const dynamic = 'force-dynamic';

/**
 * Counselling (brief 07).
 *   GET                       counsellor: the referral inbox and every case; principal / school admin: cases only (dates
 *                             and status, never notes); anyone else in the office: what they referred
 *   GET ?caseId=              one case with its notes (counselling.notes; every look recorded)
 *   GET ?q=                   students to open a case for (counselling.notes)
 *   POST { action }:
 *     refer { studentId, reason }                         any office member with students.read
 *     open { studentId } | open { referralId }             counselling.notes
 *     note { caseId, onDate, notes } | status { caseId, status } | seen { referralId }   counselling.notes
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['counselling.notes', 'counselling.overview', 'students.read']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const a = { id: admin.id, schoolId: admin.schoolId };
  const counsellor = admin.access.can('counselling.notes');
  const p = req.nextUrl.searchParams;
  try {
    const caseId = p.get('caseId');
    if (caseId) {
      const d = deny(admin, 'counselling.notes'); if (d) return d;
      const c = isUuid(caseId) ? await caseNotes(db, a, caseId) : null;
      return c ? NextResponse.json(c) : NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    if (p.get('q') !== null) {
      const d = deny(admin, 'counselling.notes'); if (d) return d;
      return NextResponse.json({ students: await searchStudents(db, admin.schoolId, str(p.get('q'), 60)) });
    }
    const [referrals, all, mine, hasCounsellor] = await Promise.all([
      counsellor ? inbox(db, a) : Promise.resolve(null),
      admin.access.any('counselling.notes', 'counselling.overview') ? cases(db, admin.schoolId) : Promise.resolve(null),
      referredBy(db, admin.schoolId, admin.id),
      counsellorsOf(db, admin.schoolId).then(x => x.length > 0),
    ]);
    return NextResponse.json({ referrals, cases: all, mine, hasCounsellor, can: { notes: counsellor, overview: admin.access.can('counselling.overview'), refer: admin.access.can('students.read') } });
  } catch (e) {
    console.error('[admin/counselling]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load counselling.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['counselling.notes', 'students.read']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const a = { id: admin.id, schoolId: admin.schoolId };
  if (b.action === 'refer') {
    const d = deny(admin, 'students.read'); if (d) return d;
    const out = isUuid(b.studentId) ? await refer(db, { ...a, kind: 'office' }, b.studentId, b) : { ok: false as const, error: 'Pick the student.', status: 400 };
    return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
  }
  const d = deny(admin, 'counselling.notes'); if (d) return d;
  const caseId = isUuid(b.caseId) ? b.caseId : null;
  const out = b.action === 'open' ? await openCase(db, a, { studentId: isUuid(b.studentId) ? b.studentId : undefined, referralId: isUuid(b.referralId) ? b.referralId : undefined })
    : b.action === 'note' ? (caseId ? await addNote(db, a, caseId, b) : { ok: false as const, error: 'Pick the case.', status: 400 })
      : b.action === 'status' ? (caseId ? await setCaseStatus(db, a, caseId, b.status) : { ok: false as const, error: 'Pick the case.', status: 400 })
        : b.action === 'seen' ? (isUuid(b.referralId) ? await closeReferral(db, a, b.referralId) : { ok: false as const, error: 'Pick the referral.', status: 400 })
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
