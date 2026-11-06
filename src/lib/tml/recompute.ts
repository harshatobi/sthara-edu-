import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeStudentTml } from './engine';
import { syncStudentGaps } from '@/lib/tutor/assignmentsServer';

/**
 * Recompute a student's TML and act on the bands (TML spec section 3): a chapter
 * in the Critical Gap gets a mandatory Socratic tutor session and its subject
 * teacher is told; one that has recovered has it cleared. Server routes call
 * this instead of computeStudentTml, which stays free of server imports (the
 * student desk uses its helpers in the browser).
 */
export async function recomputeTml(db: SupabaseClient, studentId: string, subject?: string) {
  const result = await computeStudentTml(db, studentId, subject);
  await syncStudentGaps(db, studentId);
  return result;
}
