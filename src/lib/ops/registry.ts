import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSchoolFacts } from '@/lib/settings/collect';
import type { RegistrySchool } from './attention';

interface Counts {
  roles?: Record<string, number>; people?: number; lastSignIn?: string | null; classes?: number; classesWithoutSubjects?: number;
  openCases?: number; lateCases?: number; unassignedCases?: number; openTasks?: number; overdueTasks?: number;
  lastActivity?: string | null; contact?: { name: string; phone: string | null; email: string | null } | null;
}

/**
 * Every school as the product enforces it, with head counts by role, class setup, and where it stands with Sthara
 * (open and late cases, follow-ups, primary contact, last contact and last sign-in). All counted in the database:
 * counting rows here was silently cut short at 1,000.
 */
export async function loadRegistry(db: SupabaseClient): Promise<RegistrySchool[]> {
  const [{ data: rows, error }, { data: created }] = await Promise.all([
    db.rpc('ops_registry_counts', { p_school: null }),
    db.from('schools').select('id, created_at'),
  ]);
  const counts = new Map(error ? [] : ((rows || []) as { school_id: string; counts: Counts }[]).map(r => [r.school_id, r.counts]));
  if (error) await legacyCounts(db, counts);
  const facts = await loadSchoolFacts(db, new Map([...counts].map(([id, c]) => [id, Number(c.people ?? 0)])));
  const createdAt = new Map((created || []).map(s => [s.id as string, s.created_at as string]));
  return facts.schools.map(s => {
    const c = counts.get(s.id) ?? {};
    return {
      ...s,
      createdAt: createdAt.get(s.id) ?? null,
      roles: c.roles ?? {},
      classes: c.classes ?? 0,
      classesWithoutSubjects: c.classesWithoutSubjects ?? 0,
      openCases: c.openCases ?? 0, lateCases: c.lateCases ?? 0, unassignedCases: c.unassignedCases ?? 0,
      openTasks: c.openTasks ?? 0, overdueTasks: c.overdueTasks ?? 0,
      lastSignIn: c.lastSignIn ?? null, lastActivity: c.lastActivity ?? null, contact: c.contact ?? null,
    };
  });
}

/** Head counts on a database older than the ops_registry migration: an exact count per school and role. */
async function legacyCounts(db: SupabaseClient, into: Map<string, Counts>) {
  const { data: schools } = await db.from('schools').select('id');
  await Promise.all((schools || []).map(async s => {
    const roles: Record<string, number> = {};
    await Promise.all(['admin', 'teacher', 'student', 'parent'].map(async role => {
      const { count } = await db.from('users').select('id', { count: 'exact', head: true }).eq('school_id', s.id).eq('role', role);
      if (count) roles[role] = count;
    }));
    const { data: classes } = await db.from('classes').select('metadata').eq('school_id', s.id);
    const empty = (classes || []).filter(c => { const sub = (c.metadata as { subjects?: unknown } | null)?.subjects; return !Array.isArray(sub) || !sub.length; }).length;
    into.set(s.id as string, { roles, people: Object.values(roles).reduce((n, v) => n + v, 0), classes: (classes || []).length, classesWithoutSubjects: empty });
  }));
}
