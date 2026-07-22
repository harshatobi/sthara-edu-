// Supabase token verification — replaces Firebase Admin verifyIdToken
// Used by all API routes to authenticate requests
import { createAdminClient } from '@/lib/supabase/server';

export interface VerifiedUser {
  uid: string;
  email: string;
}

export async function verifyApiToken(
  authHeader: string | null | undefined
): Promise<{ user: VerifiedUser | null; error: string | null }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const supabase = createAdminClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { user: null, error: error?.message || 'Invalid or expired token' };
    }

    return {
      user: { uid: user.id, email: user.email || '' },
      error: null,
    };
  } catch (err: any) {
    return { user: null, error: err?.message || 'Token verification failed' };
  }
}
