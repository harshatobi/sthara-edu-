import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';
import { addSlot, assessmentFor, book, cancelBooking, cancelSlot, meritFor, recordResult, slotsOf } from '@/lib/admin/meritServer';
import { GRADES } from '@/lib/students/register';

export const dynamic = 'force-dynamic';

/**
 * The admission assessment and merit (admissions phase 4a). Reads need admissions.read, writes admissions.manage.
 *   GET ?applicant=<id>              their bookings, score and the slots open to them
 *   GET ?slots=1&session=            every slot of the admission year, with how many are booked
 *   GET ?merit=<grade>&session=      the merit list of a class (score plus sibling and staff-ward points)
 *   POST { action: 'add-slot', session?, startsAt, minutes, capacity, grade?, place?, note? }
 *   POST { action: 'cancel-slot', slotId }            unbooks everyone in it (each record says so)
 *   POST { action: 'book', applicantId, slotId }      replaces a booking they have
 *   POST { action: 'cancel-booking', applicantId }
 *   POST { action: 'result', bookingId, status: 'attended' | 'no_show', score?, note? }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const p = req.nextUrl.searchParams;
  const session = isSession(p.get('session')) ? p.get('session')! : nextSession(sessionOf());
  const applicant = p.get('applicant');
  if (applicant) {
    if (!isUuid(applicant)) return bad('Pick an applicant.');
    const r = await assessmentFor(db, admin.schoolId, applicant);
    return r ? NextResponse.json(r) : bad('Applicant not found.', 404);
  }
  if (p.get('merit') !== null) {
    const grade = Number(p.get('merit'));
    if (!GRADES.includes(grade)) return bad('Pick the class.');
    return NextResponse.json(await meritFor(db, admin.schoolId, session, grade));
  }
  return NextResponse.json({ slots: await slotsOf(db, admin.schoolId, session) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const no = deny(admin, 'admissions.manage'); if (no) return no;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const a = { id: admin.id, schoolId: admin.schoolId };
  const session = isSession(b.session) ? b.session : nextSession(sessionOf());
  const r = b.action === 'add-slot' ? await addSlot(db, a, session, b)
    : b.action === 'cancel-slot' ? (isUuid(b.slotId) ? await cancelSlot(db, a, b.slotId) : { ok: false as const, error: 'Pick a slot.', status: 400 })
      : b.action === 'book' ? (isUuid(b.applicantId) ? await book(db, admin.schoolId, b.slotId, b.applicantId, admin.id) : { ok: false as const, error: 'Pick an applicant.', status: 400 })
        : b.action === 'cancel-booking' ? (isUuid(b.applicantId) ? await cancelBooking(db, admin.schoolId, b.applicantId, admin.id) : { ok: false as const, error: 'Pick an applicant.', status: 400 })
          : b.action === 'result' ? await recordResult(db, a, b)
            : { ok: false as const, error: 'Unknown action.', status: 400 };
  return r.ok ? NextResponse.json(r) : bad(r.error, r.status);
}
