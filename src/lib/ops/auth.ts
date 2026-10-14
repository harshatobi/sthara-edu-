import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { can, isOperatorRole, reachOf, roleLabel, type Capability, type OperatorRole } from './roles';
import { canSeeSchool } from './scope';
import { noteRequest } from '@/lib/debug/requestLog';

/**
 * Platform-operator gate for the hidden /ops console and /api/ops/*.
 *
 * An operator is a user with an active row in public.ops_operators, or (as a
 * director) one whose users.role is 'superadmin' or who is listed in
 * public.superadmins. All of it is checked against the database with the
 * service key. Never the __role cookie or user_metadata, which the user can set.
 *
 * The director role is only honoured for superadmins, so a row in ops_operators
 * alone can never grant it.
 *
 * Everything that fails this check gets a 404, so the console's existence
 * isn't revealed to anyone else.
 */
export interface Operator { id: string; email: string; role: OperatorRole; /** Still on a temporary password someone else issued. */ mustChangePassword: boolean }

export async function operatorFromToken(token: string | null | undefined): Promise<Operator | null> {
  if (!token) return null;
  try {
    const admin = createAdminClient();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return null;
    const [{ data: row }, { data: listed }, { data: op, error: opErr }] = await Promise.all([
      admin.from('users').select('role, metadata').eq('id', user.id).maybeSingle(),
      admin.from('superadmins').select('user_id').eq('user_id', user.id).maybeSingle(),
      // No such table on a database older than the ops_foundation migration: then superadmins are directors, as before.
      admin.from('ops_operators').select('role, active').eq('user_id', user.id).maybeSingle(),
    ]);
    if (opErr && !(opErr.code === '42P01' || opErr.code === 'PGRST205')) return null;
    const superadmin = row?.role === 'superadmin' || !!listed;
    const me = { id: user.id, email: user.email || '', mustChangePassword: (row?.metadata as { mustChangePassword?: unknown } | null)?.mustChangePassword === true };
    if (!op) return superadmin ? { ...me, role: 'director' } : null;
    if (!op.active || !isOperatorRole(op.role)) return null;
    if (op.role === 'director' && !superadmin) return null;
    return { ...me, role: op.role };
  } catch {
    return null;
  }
}

/** For API routes: Authorization: Bearer <access token>. */
export function operatorFromRequest(req: Request) {
  const h = req.headers.get('authorization') || '';
  return operatorFromToken(h.startsWith('Bearer ') ? h.slice(7).trim() : null);
}

/** For the server-rendered /ops pages: the __session access-token cookie set at login. */
export async function operatorFromCookies() {
  const jar = await cookies();
  return operatorFromToken(jar.get('__session')?.value);
}

/** The response every non-operator gets from /api/ops/*: indistinguishable from a missing route. */
export const notFoundResponse = () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } });

/**
 * The gate every /api/ops route starts with. Returns the operator, or the response to send back:
 *   - 404 for anyone who is not an operator (as if the route did not exist);
 *   - 403 for an operator whose role lacks `cap`;
 *   - 404 "School not found" when `schoolId` is given and lies outside the operator's territories.
 */
export async function operatorFor(req: Request, cap: Capability | null, schoolId?: string): Promise<Operator | Response> {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  void noteRequest({ userId: op.id, role: op.role });
  if (cap && !can(op.role, cap)) return NextResponse.json({ error: `Your role (${roleLabel(op.role)}) cannot do this.` }, { status: 403 });
  if (schoolId !== undefined && reachOf(op.role) !== 'all' && !(await canSeeSchool(createAdminClient(), op, schoolId))) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }
  return op;
}
