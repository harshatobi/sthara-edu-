import 'server-only';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Platform-operator gate for the hidden /ops console and /api/ops/*.
 *
 * An operator is a user whose users.role is 'superadmin' or who is listed in
 * public.superadmins, checked against the database with the service key.
 * Never the __role cookie or user_metadata, which the user can set.
 *
 * Everything that fails this check gets a 404, so the console's existence
 * isn't revealed to anyone else.
 */
export interface Operator { id: string; email: string }

export async function operatorFromToken(token: string | null | undefined): Promise<Operator | null> {
  if (!token) return null;
  try {
    const admin = createAdminClient();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return null;
    const [{ data: row }, { data: listed }] = await Promise.all([
      admin.from('users').select('role').eq('id', user.id).maybeSingle(),
      admin.from('superadmins').select('user_id').eq('user_id', user.id).maybeSingle(),
    ]);
    return row?.role === 'superadmin' || listed ? { id: user.id, email: user.email || '' } : null;
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
