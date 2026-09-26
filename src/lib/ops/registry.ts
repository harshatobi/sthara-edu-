import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSchoolFacts } from '@/lib/settings/collect';
import type { RegistrySchool } from './attention';

/** Every school as the product enforces it, with head counts by role and class setup. */
export async function loadRegistry(db: SupabaseClient): Promise<RegistrySchool[]> {
  const [facts, { data: people }, { data: classes }, { data: created }] = await Promise.all([
    loadSchoolFacts(db),
    db.from('users').select('school_id, role'),
    db.from('classes').select('school_id, metadata'),
    db.from('schools').select('id, created_at'),
  ]);
  const roles = new Map<string, Record<string, number>>();
  for (const p of people || []) {
    if (!p.school_id) continue;
    const r = roles.get(p.school_id) ?? {};
    r[p.role] = (r[p.role] ?? 0) + 1;
    roles.set(p.school_id, r);
  }
  const cls = new Map<string, { n: number; empty: number }>();
  for (const c of classes || []) {
    const x = cls.get(c.school_id) ?? { n: 0, empty: 0 };
    x.n += 1;
    const subjects = (c.metadata as { subjects?: unknown } | null)?.subjects;
    if (!Array.isArray(subjects) || subjects.length === 0) x.empty += 1;
    cls.set(c.school_id, x);
  }
  const createdAt = new Map((created || []).map(s => [s.id as string, s.created_at as string]));
  return facts.schools.map(s => ({
    ...s,
    createdAt: createdAt.get(s.id) ?? null,
    roles: roles.get(s.id) ?? {},
    classes: cls.get(s.id)?.n ?? 0,
    classesWithoutSubjects: cls.get(s.id)?.empty ?? 0,
  }));
}
