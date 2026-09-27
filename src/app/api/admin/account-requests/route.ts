import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { checkPeople } from '@/lib/ops/requests';

export const dynamic = 'force-dynamic';

/**
 * Ask Sthara for new logins (people.manage: school admin, principal). Logins are created by Sthara operators only,
 * so the school lists who needs one and an operator approves the request in the ops console.
 *   POST   { people: [{ role, name, email, className?, rollNo?, children? }], note? }
 *   DELETE { id }   withdraw a pending request
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'people.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const checked = checkPeople(b.people);
  if ('error' in checked) return bad(checked.error);
  // An email that already has a login here can't get another; say so now rather than at approval. (Only this
  // school's accounts are checked, so the answer never reveals who uses Sthara elsewhere; ops checks the rest.)
  const emails = checked.people.map(p => p.email);
  if (new Set(emails).size !== emails.length) return bad('The same email is listed twice.');
  const { data: taken } = await db.from('users').select('email').eq('school_id', admin.schoolId).in('email', emails);
  if (taken?.length) return bad(`${taken.map(t => t.email).join(', ')} already ${taken.length === 1 ? 'has' : 'have'} a login.`, 409);
  const { data, error } = await db.from('account_requests').insert({
    school_id: admin.schoolId, kind: 'accounts', people: checked.people, note: str(b.note, 1000) || null, requested_by: admin.id,
  }).select('id').single();
  if (error) { console.error('[account request]', error.message); return bad('Could not send the request. Try again.', 500); }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'people.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick a request.');
  const { data, error } = await db.from('account_requests').update({ status: 'cancelled', decided_by: admin.id, decided_at: new Date().toISOString() })
    .eq('id', b.id).eq('school_id', admin.schoolId).eq('kind', 'accounts').eq('status', 'pending').select('id');
  if (error) return bad('Could not withdraw the request.', 500);
  if (!data?.length) return bad('There is no pending request to withdraw.', 404);
  return NextResponse.json({ ok: true });
}
