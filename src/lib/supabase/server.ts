import { createClient } from '@supabase/supabase-js';

function getSanitizedSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (envUrl && envUrl.startsWith('https://') && envUrl.includes('.supabase.co')) {
    return envUrl;
  }
  return 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
}

const SUPABASE_URL = getSanitizedSupabaseUrl();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEzNzAzNSwiZXhwIjoyMDk5NzEzMDM1fQ.rFuYkmbA-T92TzWIqgbpCn2Ua_qdGymJB9u-9B4X2hk';

// Server-side admin client — bypasses RLS (used in API routes)
export function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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
