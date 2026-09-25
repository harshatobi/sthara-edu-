import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { fmtDate, sessionOf } from '@/lib/admin/format';
import { leaveDays, overBalance } from '@/lib/admin/leave';

export const dynamic = 'force-dynamic';

/**
 * Decide a leave request (school admins only).
 *   PATCH { id, decision: 'approve' | 'reject', note?, override? }   a rejection needs a note the teacher will see;
 *   approving beyond the teacher's entitlement needs override: true and a note (it's recorded on the request)
 * Only pending requests can be decided; the teacher is notified either way.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, 'leave.approve');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick a leave request.');
  if (b.decision !== 'approve' && b.decision !== 'reject') return bad('Approve or reject.');
  const note = str(b.note, 1000);
  if (b.decision === 'reject' && !note) return bad('Give a reason for the rejection — the teacher will see it.');

  if (b.decision === 'approve') {
    const { data: lr } = await db.from('leave_requests').select('id, staff_id, leave_type, from_date, to_date, half_day')
      .eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
    if (lr) {
      const session = sessionOf(new Date(`${lr.from_date}T12:00:00`));
      const [pol, reqs] = await Promise.all([
        db.from('leave_policies').select('leave_type, days_per_year').eq('school_id', admin.schoolId).eq('session', session),
        db.from('leave_requests').select('id, staff_id, leave_type, from_date, to_date, half_day, status').eq('staff_id', lr.staff_id).eq('status', 'approved'),
      ]);
      const over = overBalance(pol.data || [], reqs.data || [], lr.staff_id, session, lr.leave_type, leaveDays(lr.from_date, lr.to_date, lr.half_day), lr.id);
      if (over && !(b.override && note)) return NextResponse.json({ error: over, overBalance: true }, { status: 409 });
    }
  }

  const { data, error } = await db.from('leave_requests')
    .update({ status: b.decision === 'approve' ? 'approved' : 'rejected', decided_by: admin.id, decided_at: new Date().toISOString(), decision_note: note || null })
    .eq('id', b.id).eq('school_id', admin.schoolId).eq('status', 'pending')
    .select('staff_id, leave_type, from_date, to_date').maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad('This request was already decided or withdrawn. Refresh to see its status.', 409);

  const what = `${LEAVE_TYPES[data.leave_type] || 'Leave'}, ${fmtDate(data.from_date, true)}${data.to_date !== data.from_date ? ` to ${fmtDate(data.to_date, true)}` : ''}`;
  await db.from('notifications').insert({
    school_id: admin.schoolId, user_id: data.staff_id, type: 'leave',
    title: b.decision === 'approve' ? 'Leave approved' : 'Leave not approved',
    body: b.decision === 'approve' ? `${admin.name} approved your ${what}.${note ? ` "${note.slice(0, 200)}"` : ''}` : `${admin.name} didn't approve your ${what}: "${note.slice(0, 300)}"`,
    metadata: { leaveId: b.id },
  }).then(({ error: e }) => { if (e) console.warn('[admin/leave] notification failed:', e.message); });

  return NextResponse.json({ status: b.decision === 'approve' ? 'approved' : 'rejected' });
}
