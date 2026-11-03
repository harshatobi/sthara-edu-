import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { admissionError } from '@/lib/admin/admissionsServer';
import { stageGate } from '@/lib/admin/applicationServer';
import { flushSoon } from '@/lib/admin/crmServer';
import { meritOfApplicant } from '@/lib/admin/meritServer';

export const dynamic = 'force-dynamic';

/**
 * Offers (maker-checker). The admissions office proposes; the principal approves, which issues the offer when the
 * grade has a seat and puts the applicant on the waitlist when it doesn't; the office records the family's answer.
 *   POST { action: 'propose', applicantId, note?, respondBy? }   admissions.manage
 *   POST { action: 'approve' | 'return', offerId, note? }         admissions.approve (never the proposer; return needs a note)
 *   POST { action: 'accept' | 'decline', offerId, note? }         admissions.manage (decline needs a note)
 *   POST { action: 'cancel', offerId, note? }                     admissions.manage (only before the offer goes out)
 * The rules and the seat count are in the database functions (admission_offer_*), under a lock per grade. A proposed
 * offer carries the applicant's merit (assessment score plus sibling and staff-ward points); a full class's waitlist
 * fills highest merit first.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['admissions.manage', 'admissions.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const note = str(b.note, 1000) || null;
  const school = admin.schoolId;

  switch (b.action) {
    case 'propose': {
      const no = deny(admin, 'admissions.manage'); if (no) return no;
      if (!isUuid(b.applicantId)) return bad('Pick the applicant.');
      const respondBy = typeof b.respondBy === 'string' && ISO_DAY.test(b.respondBy) ? b.respondBy : null;
      // The last own stage's checks stand between the applicant and an offer.
      const { data: ap } = await db.from('admission_applicants').select('stage').eq('id', b.applicantId).eq('school_id', school).maybeSingle();
      if (ap) { const why = await stageGate(db, school, b.applicantId, ap.stage); if (why) return bad(why, 409); }
      const { data, error } = await db.rpc('admission_offer_propose', { p_school: school, p_applicant: b.applicantId, p_actor: admin.id, p_note: note, p_respond_by: respondBy });
      if (error) return admissionError(error, 'Could not propose the offer.');
      // Its merit orders the waitlist if the class is full when it is approved.
      const merit = await meritOfApplicant(db, school, b.applicantId);
      if (merit != null) await db.from('admission_offers').update({ merit }).eq('id', data);
      return NextResponse.json({ ok: true, id: data, merit });
    }
    case 'approve':
    case 'return': {
      const no = deny(admin, 'admissions.approve'); if (no) return no;
      if (!isUuid(b.offerId)) return bad('Pick the offer.');
      const { data, error } = await db.rpc('admission_offer_decide', { p_school: school, p_offer: b.offerId, p_actor: admin.id, p_approve: b.action === 'approve', p_note: note });
      if (error) return admissionError(error, 'Could not record the decision.');
      flushSoon(db, school);
      return NextResponse.json({ ok: true, status: data });
    }
    case 'accept':
    case 'decline': {
      const no = deny(admin, 'admissions.manage'); if (no) return no;
      if (!isUuid(b.offerId)) return bad('Pick the offer.');
      const { data, error } = await db.rpc('admission_offer_respond', { p_school: school, p_offer: b.offerId, p_actor: admin.id, p_accept: b.action === 'accept', p_note: note });
      if (error) return admissionError(error, 'Could not record the family’s answer.');
      flushSoon(db, school);
      return NextResponse.json({ ok: true, status: data });
    }
    case 'cancel': {
      const no = deny(admin, 'admissions.manage'); if (no) return no;
      if (!isUuid(b.offerId)) return bad('Pick the offer.');
      const { error } = await db.rpc('admission_offer_cancel', { p_school: school, p_offer: b.offerId, p_actor: admin.id, p_note: note });
      if (error) return admissionError(error, 'Could not cancel the offer.');
      return NextResponse.json({ ok: true });
    }
    default:
      return bad('Unknown action.');
  }
}
