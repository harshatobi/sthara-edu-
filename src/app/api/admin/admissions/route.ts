import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { canMove, SOURCES, STAGES, type ApplicantStage } from '@/lib/admin/admissions';
import { isSession, nextSession, sessionOf } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * Admissions pipeline (school admins only).
 *   POST  { name, grade, session?, dob?, guardianName?, guardianPhone?, guardianEmail?, previousSchool?, source?, notes? }
 *   PATCH { id, to, note? }                  move stage (forward one, reject, withdraw, reopen)
 *   PATCH { id, fields: {...} }              edit details
 * Every stage move writes an admission_events row with who and why.
 */

const OPEN_STAGES: ApplicantStage[] = [...STAGES];
const CLOSED: ApplicantStage[] = ['rejected', 'withdrawn'];

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
  const { data, error: e } = await db.from('admission_applicants').insert({
    ...row, school_id: admin.schoolId, session, stage: 'enquiry', furthest_stage: 'enquiry', created_by: admin.id,
  }).select('id').single();
  if (e) return bad(e.message, 500);
  await db.from('admission_events').insert({ applicant_id: data.id, school_id: admin.schoolId, from_stage: null, to_stage: 'enquiry', note: str(b.notes, 1000) || null, actor_id: admin.id });
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
    const { error: e } = await db.from('admission_applicants').update(row).eq('id', b.id);
    if (e) return bad(e.message, 500);
    return NextResponse.json({ ok: true });
  }

  let to = b.to as ApplicantStage;
  const from = cur.stage as ApplicantStage;
  const note = str(b.note, 1000);
  // Reopening returns them to the furthest open stage they'd reached.
  if (b.to === 'reopen') {
    if (!CLOSED.includes(from)) return bad('Only a rejected or withdrawn applicant can be reopened.');
    to = cur.furthest_stage === 'enrolled' ? 'offer' : cur.furthest_stage;
  }
  if (![...OPEN_STAGES, ...CLOSED].includes(to)) return bad('Unknown stage.');
  if (!canMove(from, to)) return bad(`An applicant at ${from} can't move straight to ${to}.`);
  if (CLOSED.includes(to) && !note) return bad(`Give a reason — it stays on the applicant's record.`);

  const rank = (s: string) => STAGES.indexOf(s as any);
  const furthest = rank(to) > rank(cur.furthest_stage) ? to : cur.furthest_stage;
  // Guard against a concurrent move: only update if the stage is still what we read.
  const { data: moved, error: e } = await db.from('admission_applicants')
    .update({ stage: to, furthest_stage: furthest, stage_changed_at: new Date().toISOString() })
    .eq('id', b.id).eq('stage', from).select('id');
  if (e) return bad(e.message, 500);
  if (!moved?.length) return bad('Someone else just moved this applicant. Refresh and try again.', 409);
  await db.from('admission_events').insert({ applicant_id: b.id, school_id: admin.schoolId, from_stage: from, to_stage: to, note: note || null, actor_id: admin.id });
  return NextResponse.json({ stage: to });
}
