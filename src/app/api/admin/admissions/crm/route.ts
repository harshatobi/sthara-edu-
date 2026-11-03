import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { assign, counsellors, crmRecord, logContact, setFollowUp, setOptOut } from '@/lib/admin/crmServer';

export const dynamic = 'force-dynamic';

/**
 * Working an applicant (admissions phase 3).
 *   GET  ?applicant=<id>     the contact log and the stage messages sent, and who can own applicants (admissions.read)
 *   GET                      who can own applicants
 *   POST { action: 'log', applicantId, kind, outcome?, note?, direction?, followUpOn? }   a call, visit or note
 *   POST { action: 'follow-up', applicantId, on }        the next follow-up (blank: none)
 *   POST { action: 'assign', applicantId, ownerId }      the counsellor (blank: nobody); they are told
 *   POST { action: 'opt-out', applicantId, out }         stop (or restart) WhatsApp stage messages to the family
 * Writes need admissions.manage.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.read');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const id = req.nextUrl.searchParams.get('applicant');
  if (id !== null && !isUuid(id)) return bad('Pick an applicant.');
  const [people, record] = await Promise.all([counsellors(db, admin.schoolId), id ? crmRecord(db, admin.schoolId, id) : Promise.resolve(null)]);
  return NextResponse.json({ counsellors: people, ...(record ?? {}) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.applicantId)) return bad('Pick an applicant.');
  const a = { id: admin.id, schoolId: admin.schoolId };
  const r = b.action === 'log' ? await logContact(db, a, b.applicantId, b)
    : b.action === 'follow-up' ? await setFollowUp(db, a, b.applicantId, b.on)
      : b.action === 'assign' ? await assign(db, a, b.applicantId, b.ownerId)
        : b.action === 'opt-out' ? await setOptOut(db, a, b.applicantId, b.out === true)
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  return r.ok ? NextResponse.json({ ok: true }) : bad(r.error, r.status);
}
