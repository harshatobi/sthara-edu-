import { createBrowserClient } from '@supabase/ssr';

// Hardcoded fallback values — these are public anon keys (safe to expose in browser)
const SUPABASE_URL = 'https://nqwvsuyiwswnsqbyhghb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd3ZzdXlpd3N3bnNxYnloZ2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzcwMzUsImV4cCI6MjA5OTcxMzAzNX0.zFKl8EUpgjC04AUDY8UbCtM1p6y8wmWX389jODke5Pc';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || SUPABASE_ANON_KEY;
  return createBrowserClient(url, key);
}

// Singleton for use in client components
let client: ReturnType<typeof createClient> | undefined;
export function getSupabaseBrowserClient() {
  if (!client) client = createClient();
  return client;
}
