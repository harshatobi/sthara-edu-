// Supabase token verification — replaces Firebase Admin verifyIdToken
// Used by all API routes to authenticate requests
import { createAdminClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';

export interface VerifiedUser {
  uid: string;
  id: string; // alias for uid, consistent with profile.id
  email: string;
  role?: string;
}

/**
 * Verifies a Supabase JWT bearer token.
 * Accepts EITHER:
 *   - A string auth header: "Bearer eyJ..."
 *   - A NextRequest object (extracts the Authorization header automatically)
 *   - null/undefined (returns error)
 */
export async function verifyApiToken(
  input: string | null | undefined | NextRequest
): Promise<{ user: VerifiedUser | null; error: string | null }> {
  // Handle NextRequest object passed directly
  let authHeader: string | null = null;
  if (input && typeof input === 'object' && 'headers' in input) {
    authHeader = (input as NextRequest).headers.get('authorization');
  } else {
    authHeader = input as string | null;
  }

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

    // Fetch role from users table
    let role: string | undefined;
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      role = userRow?.role || user.user_metadata?.role;
    } catch (_) { /* ignore */ }

    return {
      user: { uid: user.id, id: user.id, email: user.email || '', role },
      error: null,
    };
  } catch (err: any) {
    return { user: null, error: err?.message || 'Token verification failed' };
  }
}
