import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inScope, teachingScope } from '@/lib/teacher/scope';

export interface Caller { id: string; role: string; schoolId: string | null; name: string | null; scope: ReturnType<typeof teachingScope> }

export async function callerOf(db: SupabaseClient, userId: string): Promise<Caller | null> {
  const { data } = await db.from('users').select('id, name, role, school_id, assignments, teacher_class, teacher_subject').eq('id', userId).maybeSingle();
  return data ? { id: data.id, role: data.role, schoolId: data.school_id, name: data.name, scope: teachingScope(data) } : null;
}

/** Staff who may capture or review work for this assignment: its teacher, a teacher of the class+subject, or a school admin. */
export const staffCanGrade = (c: Caller, a: any) =>
  c.schoolId === a.school_id && (c.role === 'admin' || (c.role === 'teacher' && (a.teacher_id === c.id || inScope(c.scope, a.class, a.subject))));
