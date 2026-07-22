import { createClient } from '@/lib/supabase/client';

/**
 * Returns the current user's Supabase JWT access token for authenticated API calls.
 * Usage: const token = await getAuthToken();
 *        fetch('/api/...', { headers: { Authorization: `Bearer ${token}` } })
 */
export async function getAuthToken(): Promise<string> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}
