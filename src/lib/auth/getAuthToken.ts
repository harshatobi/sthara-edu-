import { auth } from '@/lib/firebase/config';

/**
 * Returns the current user's Firebase ID token for authenticated API calls.
 * Usage: const token = await getAuthToken();
 *        fetch('/api/...', { headers: { Authorization: `Bearer ${token}` } })
 */
export async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return '';
  try {
    return await user.getIdToken();
  } catch {
    return '';
  }
}
