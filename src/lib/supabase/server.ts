import { createClient } from '@supabase/supabase-js';

// Hardcoded values — the service role key is only used server-side (API routes) and is not exposed to browser
const SUPABASE_URL = 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEzNzAzNSwiZXhwIjoyMDk5NzEzMDM1fQ.rFuYkmbA-T92TzWIqgbpCn2Ua_qdGymJB9u-9B4X2hk';

// Server-side admin client — bypasses RLS (used in API routes only, never sent to browser)
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || SERVICE_ROLE_KEY;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

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
