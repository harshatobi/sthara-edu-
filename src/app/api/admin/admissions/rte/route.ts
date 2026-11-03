import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';
import { drawLottery, lotteryFor, setRte } from '@/lib/admin/rteFeesServer';
import { GRADES } from '@/lib/students/register';

export const dynamic = 'force-dynamic';

/**
 * The RTE quota (admissions phase 4b).
 *   GET ?grade=&session=      the class's RTE seats, its lottery (seed, entrants, order) and RTE applicants not in it
 *   POST { action: 'set', applicantId, rte, allotmentNo?, allottedOn? }   RTE on an applicant (admissions.manage)
 *   POST { action: 'draw', grade, session?, note? }                       the class's lottery, once (admissions.approve)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const p = req.nextUrl.searchParams;
  const grade = Number(p.get('grade'));
  if (!GRADES.includes(grade)) return bad('Pick the class.');
  const session = isSession(p.get('session')) ? p.get('session')! : nextSession(sessionOf());
  return NextResponse.json(await lotteryFor(db, admin.schoolId, session, grade));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['admissions.manage', 'admissions.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const a = { id: admin.id, schoolId: admin.schoolId };
  if (b.action === 'set') {
    const no = deny(admin, 'admissions.manage'); if (no) return no;
    if (!isUuid(b.applicantId)) return bad('Pick an applicant.');
    const r = await setRte(db, a, b.applicantId, b);
    return r.ok ? NextResponse.json(r) : bad(r.error, r.status);
  }
  if (b.action === 'draw') {
    // Who decides who gets the seats: the same people who approve offers.
    const no = deny(admin, 'admissions.approve'); if (no) return no;
    const grade = Number(b.grade);
    if (!GRADES.includes(grade)) return bad('Pick the class.');
    const r = await drawLottery(db, a, isSession(b.session) ? b.session : nextSession(sessionOf()), grade, b.note);
    return r.ok ? NextResponse.json(r) : bad(r.error, r.status);
  }
  return bad('Unknown action.');
}
