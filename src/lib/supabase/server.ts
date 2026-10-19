import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { dbProblem } from './watch';

// Server-side admin client — bypasses RLS (used in API routes only, never sent to browser)
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: watchedServerFetch },
  });
}

/**
 * fetch for the server database client: answers exactly as fetch does, and logs a list cut at the 1,000-row ceiling
 * to the ops error log, the same "[database] ..." report the browser client sends. Refused requests are not logged
 * here: server code sees and handles those errors itself. The stack says which query it was.
 */
const watchedServerFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!res.ok || !url.includes('/rest/v1/') || url.includes('/rpc/log_app_error')) return res;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const problem = dbProblem({ url, method }, { status: res.status, contentRange: res.headers.get('content-range') });
    if (problem) {
      const stack = new Error(problem).stack ?? null;
      // Imported here: the logger itself uses this client.
      void import('@/lib/errors/log').then(m => m.reportError({ source: 'server', kind: 'logged', message: problem, stack })).catch(() => {});
    }
  } catch { /* watching must never break a read */ }
  return res;
};

// Verify a user's JWT token and return their Supabase user object
export async function verifySupabaseToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createAdminClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid token' };
  }

  return { user, error: null };
}
