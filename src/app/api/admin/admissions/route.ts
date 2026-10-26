import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { SOURCES } from '@/lib/admin/admissions';
import { admissionError } from '@/lib/admin/admissionsServer';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * Admissions pipeline (school admins only).
 *   POST  { name, grade, session?, dob?, guardianName?, guardianPhone?, guardianEmail?, previousSchool?, source?, notes? }
 *   PATCH { id, from, to, note? }                  move stage (forward one of the school's own, reject, withdraw, reopen)
 *   PATCH { id, fields: {...} }              edit details
 * Every stage move writes an admission_events row with who and why.
 */

function details(b: any): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  if (b.name !== undefined) { row.name = str(b.name, 120); if (!row.name) return { row, error: 'Enter the applicant\'s name.' }; }
  if (b.grade !== undefined) {
    const g = Number(b.grade);
    if (!Number.isInteger(g) || g < 1 || g > 12) return { row, error: 'Pick the grade applied for.' };
    row.grade = g;
  }
  if (b.dob !== undefined) row.date_of_birth = ISO_DAY.test(str(b.dob, 10)) ? str(b.dob, 10) : null;
  if (b.guardianName !== undefined) row.guardian_name = str(b.guardianName, 120) || null;
  if (b.guardianPhone !== undefined) {
    const p = str(b.guardianPhone, 20).replace(/[^\d+]/g, '');
    if (p && !/^\+?\d{10,13}$/.test(p)) return { row, error: 'Enter a 10-digit mobile number (with country code if outside India).' };
    row.guardian_phone = p || null;
  }
  if (b.guardianEmail !== undefined) {
    const e = str(b.guardianEmail, 160).toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { row, error: 'That email address doesn\'t look right.' };
    row.guardian_email = e || null;
  }
  if (b.previousSchool !== undefined) row.previous_school = str(b.previousSchool, 160) || null;
  if (b.source !== undefined) { if (!(b.source in SOURCES)) return { row, error: 'Pick how they heard about the school.' }; row.source = b.source; }
  if (b.assessmentOn !== undefined) row.assessment_on = ISO_DAY.test(str(b.assessmentOn, 10)) ? str(b.assessmentOn, 10) : null;
  if (b.notes !== undefined) row.notes = str(b.notes, 2000) || null;
  return { row };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const { row, error } = details({ ...b, name: b.name ?? '', grade: b.grade ?? 0 });
  if (error) return bad(error);
  const session = isSession(b.session) ? b.session : nextSession(sessionOf());
  // A new applicant starts at the school's first stage in use.
  await db.rpc('admission_ensure_stages', { p_school: admin.schoolId });
  const { data: first } = await db.from('admission_stages').select('key').eq('school_id', admin.schoolId).is('system', null).eq('active', true)
    .order('position').limit(1).maybeSingle();
  if (!first) return bad('Your admissions pipeline has no stages before Offer. Add one in Set up.', 409);
  const { data, error: e } = await db.from('admission_applicants').insert({
    ...row, school_id: admin.schoolId, session, stage: first.key, furthest_stage: first.key, created_by: admin.id,
  }).select('id').single();
  if (e) return bad(e.message, 500);
  await db.from('admission_events').insert({ applicant_id: data.id, school_id: admin.schoolId, from_stage: null, to_stage: first.key, note: str(b.notes, 1000) || null, actor_id: admin.id });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick an applicant.');
  const { data: cur } = await db.from('admission_applicants').select('id, stage, furthest_stage').eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
  if (!cur) return bad('Applicant not found.', 404);

  if (b.fields) {
    const { row, error } = details(b.fields);
    if (error) return bad(error);
    if (!Object.keys(row).length) return bad('Nothing to change.');
    // An offer holds a seat in one grade: changing the grade under it would move the seat without approval.
    if (row.grade !== undefined) {
      const { data: live } = await db.from('admission_offers').select('id, grade').eq('applicant_id', b.id).in('status', ['proposed', 'waitlisted', 'issued', 'accepted']).maybeSingle();
      if (live && live.grade !== row.grade) return bad('This applicant has an offer for their grade. Cancel or close it before changing the grade.', 409);
    }
    const { error: e } = await db.from('admission_applicants').update(row).eq('id', b.id);
    if (e) return bad(e.message, 500);
    return NextResponse.json({ ok: true });
  }

  // The rules (one stage at a time, Offer only through an approved offer, a reason to close) are in the database.
  const to = str(b.to, 40);
  if (!to) return bad('Pick where to move them.');
  const { data, error } = await db.rpc('admission_move', {
    p_school: admin.schoolId, p_applicant: b.id, p_from: str(b.from, 40) || cur.stage, p_to: to, p_actor: admin.id, p_note: str(b.note, 1000) || null,
  });
  if (error) return admissionError(error, 'Could not move the applicant.');
  return NextResponse.json({ stage: data });
}
