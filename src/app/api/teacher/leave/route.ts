import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { daysBetween, isoDay, sessionOf } from '@/lib/admin/format';
import { leaveDays, overBalance } from '@/lib/admin/leave';

export const dynamic = 'force-dynamic';

/**
 * A staff member's own leave.
 *   POST  { type, from, to, halfDay?, reason }   apply
 *   PATCH { id, cancel: true }                   withdraw a request that's still pending, or approved and not yet started
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n = 1000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  if (!checkRateLimit(`leave:${staff.id}`, ...limitOf('leave')).allowed) return NextResponse.json({ error: 'Too many requests at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!(b.type in LEAVE_TYPES)) return NextResponse.json({ error: 'Pick a leave type.' }, { status: 400 });
  const from = str(b.from, 10);
  const to = str(b.to, 10) || from;
  const reason = str(b.reason);
  const halfDay = !!b.halfDay;
  if (!ISO.test(from) || !ISO.test(to)) return NextResponse.json({ error: 'Pick the dates.' }, { status: 400 });
  if (to < from) return NextResponse.json({ error: 'The end date must be on or after the start date.' }, { status: 400 });
  if (halfDay && to !== from) return NextResponse.json({ error: 'A half day is a single date.' }, { status: 400 });
  if (daysBetween(isoDay(), from) < -30) return NextResponse.json({ error: 'Leave more than 30 days in the past has to be recorded by the office.' }, { status: 400 });
  if (daysBetween(from, to) > 180) return NextResponse.json({ error: 'That range is over 180 days. Talk to the office about long leave.' }, { status: 400 });
  if (!reason) return NextResponse.json({ error: 'Give a reason.' }, { status: 400 });

  // No overlapping open requests.
  const { data: clash } = await db.from('leave_requests').select('id, from_date, to_date')
    .eq('staff_id', staff.id).in('status', ['pending', 'approved']).lte('from_date', to).gte('to_date', from).limit(1);
  if (clash?.length) return NextResponse.json({ error: `You already have leave from ${clash[0].from_date} to ${clash[0].to_date} that overlaps these dates.` }, { status: 409 });

  // Entitlement check against this school's leave policy for the session the leave starts in.
  const session = sessionOf(new Date(`${from}T12:00:00`));
  const [pol, reqs] = await Promise.all([
    db.from('leave_policies').select('leave_type, days_per_year').eq('school_id', staff.schoolId).eq('session', session),
    db.from('leave_requests').select('id, staff_id, leave_type, from_date, to_date, half_day, status').eq('staff_id', staff.id).in('status', ['pending', 'approved']),
  ]);
  const over = overBalance(pol.data || [], reqs.data || [], staff.id, session, b.type, leaveDays(from, to, halfDay));
  if (over) return NextResponse.json({ error: `${over} Apply the rest as leave without pay, or talk to the office.` }, { status: 409 });

  const { data, error } = await db.from('leave_requests').insert({
    school_id: staff.schoolId, staff_id: staff.id, leave_type: b.type, from_date: from, to_date: to, half_day: halfDay, reason,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const b = await req.json().catch(() => null);
  if (!b?.cancel || typeof b.id !== 'string') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { data: row } = await db.from('leave_requests').select('id, status, from_date').eq('id', b.id).eq('staff_id', staff.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
  const cancellable = row.status === 'pending' || (row.status === 'approved' && row.from_date > isoDay());
  if (!cancellable) return NextResponse.json({ error: 'Only pending requests, or approved leave that hasn\'t started, can be withdrawn.' }, { status: 400 });
  const { error } = await db.from('leave_requests').update({ status: 'cancelled' }).eq('id', b.id).eq('status', row.status);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: 'cancelled' });
}
