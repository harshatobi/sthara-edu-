// DEPRECATED: Firebase has been completely replaced by Supabase (SQL/PostgreSQL).
// Import createClient from '@/lib/supabase/client' instead.
import { createClient } from '@/lib/supabase/client';

export const supabase = createClient();
export const db = null as any;
export const auth = null as any;
export const storage = null as any;
