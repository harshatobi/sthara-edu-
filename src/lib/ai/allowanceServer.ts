import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { effectivePrice } from '@/lib/settings/registry';
import { getSchoolPolicy } from '@/lib/settings/server';
import { allowanceFrom, type Allowance } from './allowance';

/**
 * A student's AI allowance right now (see allowance.ts). When the spend can't be
 * read, the student is treated as normal: a metering hiccup must not stop
 * learning, and the next call reads it again.
 */
export async function studentAllowance(db: SupabaseClient, studentId: string): Promise<Allowance | null> {
  const { data, error } = await db.rpc('student_ai_spend', { p_student: studentId });
  if (error || !data) {
    if (error) console.error('[allowance] spend unavailable:', error.message);
    return null;
  }
  const d = data as { schoolId: string; ownUsd: number | string; sharedUsd: number | string };
  const policy = await getSchoolPolicy(d.schoolId, db).catch(() => null);
  const price = policy ? effectivePrice(policy) : null;
  return allowanceFrom(price, Number(d.ownUsd) + Number(d.sharedUsd));
}
