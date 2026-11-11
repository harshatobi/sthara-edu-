import 'server-only';
/**
 * The Studio library on the server: who may see and change a material, saving with version history, and the
 * school's moderation setting. Materials are private to their teacher until shared with the department; a
 * department share is visible to staff who teach that subject and to its subject leads.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/teacher/serverAuth';
import { normSubject } from '@/lib/teacher/scope';

export const MATERIAL_COLS = 'id, school_id, teacher_id, class, subject, chapter_key, chapter_name, kind, title, content, language, status, share, common_test, moderation, reviewed_by, reviewed_at, review_note, assignment_ids, lesson_plan_id, version, created_at, updated_at';

export type Moderation = 'none' | 'common_tests' | 'all_shared';

/** The school's moderation setting (schools.settings.studio.moderation); "none" until a school chooses. */
export async function moderationOf(db: SupabaseClient, schoolId: string): Promise<Moderation> {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  const v = (data?.settings as any)?.studio?.moderation;
  return v === 'common_tests' || v === 'all_shared' ? v : 'none';
}

export const MODERATION_MODES: Moderation[] = ['none', 'common_tests', 'all_shared'];
export const isModeration = (v: unknown): v is Moderation => MODERATION_MODES.includes(v as Moderation);

/**
 * Sets the school's moderation setting, keeping every other setting as it is, and records who changed it.
 * Loosening it doesn't approve anything by itself: material already waiting stays waiting until the lead decides
 * or the teacher shares it again.
 */
export async function setModeration(db: SupabaseClient, schoolId: string, actor: { id: string; role: string }, mode: Moderation): Promise<{ ok: true; moderation: Moderation } | { ok: false; error: string; status: number }> {
  const { data, error } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  if (error || !data) return { ok: false, error: 'School not found.', status: 404 };
  const st = (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<string, any>;
  const was: Moderation = isModeration(st.studio?.moderation) ? st.studio.moderation : 'none';
  if (was === mode) return { ok: true, moderation: mode };
  const { error: upErr } = await db.from('schools').update({ settings: { ...st, studio: { ...(st.studio || {}), moderation: mode } } }).eq('id', schoolId);
  if (upErr) return { ok: false, error: 'Could not save the setting.', status: 500 };
  const { error: logErr } = await db.from('audit_log').insert({
    actor_id: actor.id, actor_role: actor.role, action: 'studio_moderation_set', table_name: 'schools', row_id: schoolId, school_id: schoolId,
    old_values: { moderation: was }, new_values: { moderation: mode },
  });
  if (logErr) console.warn('[studio moderation audit]', logErr.message);
  return { ok: true, moderation: mode };
}

/** Does this share need the subject lead's approval under the school's setting? */
export const needsApproval = (mode: Moderation, m: { share: string; common_test: boolean }) =>
  mode === 'all_shared' ? m.share === 'department' || m.common_test : mode === 'common_tests' ? m.common_test : false;

export async function isSubjectLead(db: SupabaseClient, staff: Pick<Staff, 'id' | 'schoolId'>, subject: string): Promise<boolean> {
  const { data } = await db.from('subject_leads').select('subject_name, subject_key').eq('school_id', staff.schoolId).eq('user_id', staff.id);
  return (data || []).some(r => normSubject(r.subject_name) === normSubject(subject) || normSubject(r.subject_key) === normSubject(subject));
}

const teaches = (staff: Pick<Staff, 'scope'>, subject: string) => staff.scope.some(e => normSubject(e.subject) === normSubject(subject));

/** Read access: the owner; department shares for staff teaching the subject, subject leads and office academics. */
export async function canRead(db: SupabaseClient, staff: Staff, m: any): Promise<boolean> {
  if (!m || m.school_id !== staff.schoolId) return false;
  if (m.teacher_id === staff.id) return true;
  if (m.share !== 'department') return false;
  return staff.role === 'admin' || teaches(staff, m.subject) || (await isSubjectLead(db, staff, m.subject));
}

export async function loadMaterial(db: SupabaseClient, staff: Staff, id: string): Promise<any | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('studio_materials').select(MATERIAL_COLS).eq('id', id).maybeSingle();
  return data && (await canRead(db, staff, data)) ? data : null;
}

/** Saves new content as the next version, keeping the old one in the history. */
export async function saveVersion(db: SupabaseClient, staff: Staff, m: any, content: unknown, note: string, extra: Record<string, unknown> = {}): Promise<any> {
  const version = (m.version || 1) + 1;
  const { data, error } = await db.from('studio_materials').update({ content, version, ...extra }).eq('id', m.id).eq('version', m.version).select(MATERIAL_COLS).maybeSingle();
  if (error) throw new Error(error.message);
  // Someone else saved in between (another tab): the caller reloads rather than overwriting their change.
  if (!data) throw Object.assign(new Error('This material changed since you opened it. Reload to see the latest.'), { status: 409 });
  await db.from('studio_material_versions').insert({ material_id: m.id, school_id: m.school_id, version, content, change_note: note.slice(0, 300), changed_by: staff.id });
  return data;
}

export async function createMaterial(db: SupabaseClient, staff: Staff, row: { class: string; subject: string; chapter_key: string | null; chapter_name: string | null; kind: string; title: string; content: unknown; language: string }): Promise<any> {
  const { data, error } = await db.from('studio_materials').insert({ ...row, school_id: staff.schoolId, teacher_id: staff.id }).select(MATERIAL_COLS).single();
  if (error) throw new Error(error.message);
  await db.from('studio_material_versions').insert({ material_id: data.id, school_id: staff.schoolId, version: 1, content: row.content, change_note: 'Created', changed_by: staff.id });
  return data;
}

/** The access needs of these students (teachers see the needs only, never a health record). */
export async function accessNeeds(db: SupabaseClient, schoolId: string, studentIds: string[]): Promise<Map<string, string[]>> {
  if (!studentIds.length) return new Map();
  const { data } = await db.from('student_access_needs').select('student_id, needs').eq('school_id', schoolId).in('student_id', studentIds.slice(0, 1000));
  return new Map((data || []).map(r => [r.student_id, Array.isArray(r.needs) ? r.needs : []]));
}
