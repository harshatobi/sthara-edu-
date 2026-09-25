import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { ROLES, type RoleKey } from '@/lib/admin/rbac';
import { isoDay } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

/**
 * Office roles (access.manage).
 *   POST  { userId, role, expiresOn?, note? }   give a role, optionally until a date (e.g. acting principal)
 *   PATCH { id }                                 take it away (soft: the grant stays on record as revoked)
 * The database refuses roles for non-office accounts and removing a school's last school admin.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'access.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.userId)) return bad('Pick a person.');
  if (!(b.role in ROLES)) return bad('Pick a role.');
  const expiresOn = str(b.expiresOn, 10);
  if (expiresOn && (!ISO_DAY.test(expiresOn) || expiresOn < isoDay())) return bad('The end date must be today or later.');
  const { data: target } = await db.from('users').select('id, role, name').eq('id', b.userId).eq('school_id', admin.schoolId).maybeSingle();
  if (!target) return bad('Person not found in this school.', 404);
  if (target.role !== 'admin') return bad(`${target.name || 'This person'} has a ${target.role} account. Office roles go on office accounts; add one in the directory.`);
  const { data, error } = await db.from('role_grants').insert({
    school_id: admin.schoolId, user_id: b.userId, role_key: b.role as RoleKey, expires_on: expiresOn || null,
    note: str(b.note, 300) || null, granted_by: admin.id,
  }).select('id').single();
  if (error) return bad(error.code === '23505' ? `${target.name} already has this role.` : error.message, error.code === '23505' ? 409 : 400);
  await db.from('notifications').insert({
    school_id: admin.schoolId, user_id: b.userId, type: 'access',
    title: `You're now ${ROLES[b.role as RoleKey].label}`,
    body: `${admin.name} gave you the ${ROLES[b.role as RoleKey].label} role${expiresOn ? ` until ${expiresOn}` : ''}: ${ROLES[b.role as RoleKey].summary.toLowerCase()}.`,
    metadata: { grantId: data.id },
  }).then(({ error: e }) => { if (e) console.warn('[admin/access] notification failed:', e.message); });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, 'access.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick a role to remove.');
  const { data, error } = await db.from('role_grants').update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
    .eq('id', b.id).eq('school_id', admin.schoolId).is('revoked_at', null).select('id');
  if (error) return bad(error.message, 400);
  if (!data?.length) return bad('That role was already removed.', 409);
  return NextResponse.json({ ok: true });
}
