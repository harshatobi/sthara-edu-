import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { daysBetween, isoDay } from '@/lib/admin/format';
import { dbError } from '@/lib/schedule/server';

export const dynamic = 'force-dynamic';

/**
 * A visiting teacher's sessions (schedule.academic or schedule.workforce), for per-session pay.
 *   PUT    { staffMemberId, date, slotId, status: 'taken' | 'missed', note? }   confirm one timetabled session
 *   DELETE { id }                                                              undo a confirmation
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.academic', 'schedule.workforce']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.staffMemberId) || !isUuid(b.slotId)) return bad('Pick the session.');
  if (!ISO_DAY.test(String(b.date))) return bad('Pick the date.');
  if (b.date > isoDay()) return bad('A session is confirmed on or after the day.');
  if (daysBetween(b.date, isoDay()) > 60) return bad('That is more than 60 days ago.');
  if (b.status !== 'taken' && b.status !== 'missed') return bad('Taken or missed?');
  const [{ data: m }, { data: slot }] = await Promise.all([
    db.from('staff_members').select('id').eq('id', b.staffMemberId).eq('school_id', admin.schoolId).maybeSingle(),
    db.from('timetable_slots').select('id, class, subject, staff_member_id').eq('id', b.slotId).eq('school_id', admin.schoolId).maybeSingle(),
  ]);
  if (!m) return bad('That person isn\'t on the register.');
  if (!slot || slot.staff_member_id !== b.staffMemberId) return bad('That isn\'t one of their lessons.');
  const row = { status: b.status, note: str(b.note, 500) || null, confirmed_by: admin.id, confirmed_at: new Date().toISOString() };
  const { data: existing } = await db.from('visit_sessions').select('id').eq('staff_member_id', b.staffMemberId).eq('on_date', b.date).eq('slot_id', b.slotId).maybeSingle();
  const { error } = existing
    ? await db.from('visit_sessions').update(row).eq('id', existing.id)
    : await db.from('visit_sessions').insert({ ...row, school_id: admin.schoolId, staff_member_id: b.staffMemberId, on_date: b.date, slot_id: b.slotId, class: slot.class, subject: slot.subject });
  return error ? dbError(error, 'Could not record the session.') : NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.academic', 'schedule.workforce']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick the session.');
  const { error } = await db.from('visit_sessions').delete().eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not undo that.') : NextResponse.json({ ok: true });
}
