import { createBrowserClient } from '@supabase/ssr';

function getSanitizedSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (envUrl && envUrl.startsWith('https://') && envUrl.includes('.supabase.co')) {
    return envUrl;
  }
  return 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
}

const SUPABASE_URL = getSanitizedSupabaseUrl();
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzcwMzUsImV4cCI6MjA5OTcxMzAzNX0.zFKl8EUpgjC04AUDY8UbCtM1p6y8wmWX389jODke5Pc';

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Singleton for use in client components
let client: ReturnType<typeof createClient> | undefined;
export function getSupabaseBrowserClient() {
  if (!client) client = createClient();
  return client;
}
