// DEPRECATED: Firebase Admin SDK has been completely replaced by Supabase Service Role client.
// Import createAdminClient from '@/lib/supabase/server' instead.
import { createAdminClient } from '@/lib/supabase/server';

export const adminDb = null as any;
export const adminAuth = null as any;
export const getAdminClient = createAdminClient;
