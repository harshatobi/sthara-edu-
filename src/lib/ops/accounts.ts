import 'server-only';
import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normClass, tempPassword, validatePeople, type PersonInput, type RowIssue } from './people';
import { setTeacherSubjects } from '@/lib/subjects/server';

/**
 * Creates school accounts (admin / teacher / student / parent) with the
 * service key. Rules:
 *  - never touches an existing login: an email already in use is rejected,
 *    never "updated" (no password or role takeover);
 *  - role lives only in public.users, never in user_metadata (user-editable);
 *  - each account gets its own random temporary password, returned once;
 *  - if the profile insert fails, the just-created login is deleted again;
 *  - parents are linked to children both in users.metadata.linkedStudents
 *    (read by today's parent API) and in public.guardians (verified, read by
 *    the hardened RLS) when that table exists.
 */

export interface PersonResult {
  row: number;
  role: string;
  name: string;
  email: string;
  status: 'created' | 'error';
  message?: string;
  userId?: string;
  tempPassword?: string;
}

const missingRelation = (e: { code?: string; message?: string } | null) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message || ''));

/** Who made the change: a Sthara operator, or someone at the school (their role there). */
export type ActorRole = 'operator' | 'school_admin';

async function audit(admin: SupabaseClient, schoolId: string, actorId: string, action: string, rowId: string, values: Record<string, unknown>, actorRole: ActorRole = 'operator') {
  const { error } = await admin.from('audit_log').insert({
    actor_id: actorId, actor_role: actorRole, action, table_name: 'users', row_id: rowId, school_id: schoolId, new_values: values,
  });
  if (error && !missingRelation(error)) console.warn('[ops audit]', error.message);
}

export async function schoolState(admin: SupabaseClient, schoolId: string) {
  const [{ data: classes }, { data: people }] = await Promise.all([
    admin.from('classes').select('id, name, metadata').eq('school_id', schoolId).order('name'),
    admin.from('users').select('id, email, custom_student_id').eq('school_id', schoolId),
  ]);
  return {
    classes: (classes || []) as { id: string; name: string; metadata: Record<string, unknown> | null }[],
    rollToStudent: new Map((people || []).filter(p => p.custom_student_id).map(p => [String(p.custom_student_id).trim().toLowerCase(), p.id as string])),
  };
}

export async function createPeople(admin: SupabaseClient, schoolId: string, actorId: string, input: PersonInput[]) {
  const rows = input.map(r => ({ ...r, email: (r.email || '').trim().toLowerCase(), name: (r.name || '').trim() }));
  const state = await schoolState(admin, schoolId);

  // Emails are unique platform-wide (one login per email).
  const emails = rows.map(r => r.email).filter(Boolean);
  const { data: taken } = emails.length ? await admin.from('users').select('email').in('email', emails) : { data: [] as { email: string }[] };
  const issues: RowIssue[] = validatePeople(rows, {
    classes: state.classes.map(c => c.name),
    existingEmails: new Set((taken || []).map(t => String(t.email).toLowerCase())),
    existingRollNos: new Set(state.rollToStudent.keys()),
  });
  if (issues.length) return { issues, results: [] as PersonResult[] };

  const classByNorm = new Map(state.classes.map(c => [normClass(c.name), c]));
  const canonicalClass = (c?: string) => (c ? classByNorm.get(normClass(c))?.name ?? c.trim() : null);
  const results: PersonResult[] = [];

  // Students before parents, so parents can link to children created in the same batch.
  const order = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.role === 'parent') - Number(b.r.role === 'parent'));
  for (const { r, i } of order) {
    const base = { row: i + 1, role: r.role, name: r.name, email: r.email };
    const password = tempPassword(randomInt);
    const { data: auth, error: authErr } = await admin.auth.admin.createUser({
      email: r.email, password, email_confirm: true, user_metadata: { name: r.name },
    });
    if (authErr || !auth?.user) { results.push({ ...base, status: 'error', message: authErr?.message || 'Could not create the login' }); continue; }
    const uid = auth.user.id;

    const subjects = (r.role === 'teacher' ? r.subjects ?? [] : [])
      .filter(s => s.subject?.trim())
      .map(s => ({ class: canonicalClass(s.class)!, subject: s.subject.trim() }));
    const childIds = r.role === 'parent' ? (r.children ?? []).map(c => state.rollToStudent.get(c.trim().toLowerCase())).filter(Boolean) as string[] : [];

    const profile: Record<string, unknown> = {
      id: uid, school_id: schoolId, role: r.role, name: r.name, email: r.email,
      student_class: r.role === 'student' ? canonicalClass(r.className) : null,
      custom_student_id: r.role === 'student' ? r.rollNo!.trim() : null,
      teacher_class: r.role === 'teacher' ? canonicalClass(r.classTeacherOf) : null,
      teacher_subject: subjects[0]?.subject ?? null,
      assignments: subjects,
      teaching_subjects: subjects.map(s => ({ classId: classByNorm.get(normClass(s.class))?.id ?? null, className: s.class, subjectName: s.subject })),
      metadata: {
        mustChangePassword: true,
        createdBy: actorId,
        ...(r.role === 'parent' ? { linkedStudents: (r.children ?? []).map(c => c.trim()) } : {}),
      },
    };
    const { error: rowErr } = await admin.from('users').insert(profile);
    if (rowErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      results.push({ ...base, status: 'error', message: `Profile not saved: ${rowErr.message}` });
      continue;
    }
    if (r.role === 'student') state.rollToStudent.set(r.rollNo!.trim().toLowerCase(), uid);

    if (childIds.length) {
      const { error: gErr } = await admin.from('guardians').upsert(
        childIds.map(sid => ({ parent_id: uid, student_id: sid, relationship: 'parent', verified: true })),
        { onConflict: 'parent_id,student_id' },
      );
      if (gErr && !missingRelation(gErr)) console.warn('[ops guardians]', gErr.message);
    }
    // Link the teacher's subjects to the classes' official subjects (unlinked classes keep plain entries).
    if (r.role === 'teacher' && (subjects.length || r.classTeacherOf)) {
      const linked = await setTeacherSubjects(admin, schoolId, actorId, 'operator', uid, subjects, canonicalClass(r.classTeacherOf), { allowLegacy: true });
      if (!linked.ok) console.warn('[ops teacher links]', linked.error);
    }
    await audit(admin, schoolId, actorId, 'account_created', uid, { role: r.role, email: r.email, class: profile.student_class, subjects });
    results.push({ ...base, status: 'created', userId: uid, tempPassword: password });
  }
  results.sort((a, b) => a.row - b.row);
  return { issues: [] as RowIssue[], results };
}

/** Checks untrusted { class, subject } rows; null when any row isn't two non-empty strings. */
export function parseAssignments(v: unknown): { class: string; subject: string }[] | null {
  if (!Array.isArray(v) || v.length > 60) return null;
  const out: { class: string; subject: string }[] = [];
  for (const x of v) {
    const c = (x as { class?: unknown } | null)?.class, s = (x as { subject?: unknown } | null)?.subject;
    if (typeof c !== 'string' || typeof s !== 'string' || !c.trim() || !s.trim()) return null;
    out.push({ class: c.trim().slice(0, 40), subject: s.trim().slice(0, 80) });
  }
  return out;
}

/**
 * Replace a teacher's subject/class assignments (no password or role changes). Goes through the subject
 * links (teacher_subjects), so every subject must be one the class offers; classes whose subjects aren't
 * linked yet keep plain entries.
 */
export async function updateTeacherAssignments(admin: SupabaseClient, schoolId: string, actorId: string, userId: string,
  subjects: { class: string; subject: string }[], classTeacherOf: string | null, actorRole: ActorRole = 'operator') {
  const r = await setTeacherSubjects(admin, schoolId, actorId, actorRole, userId, subjects, classTeacherOf, { allowLegacy: true });
  if (!r.ok) return { error: r.error };
  await audit(admin, schoolId, actorId, 'assignments_updated', userId, { subjects, classTeacherOf }, actorRole);
  return { error: null };
}

/** New temporary password for an account in this school (shown once). */
export async function resetPassword(admin: SupabaseClient, schoolId: string, actorId: string, userId: string) {
  const { data: u } = await admin.from('users').select('id, school_id, role, metadata').eq('id', userId).maybeSingle();
  if (!u || u.school_id !== schoolId || u.role === 'superadmin') return { error: 'Account not found in this school.' };
  const password = tempPassword(randomInt);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };
  await admin.from('users').update({ metadata: { ...(u.metadata || {}), mustChangePassword: true } }).eq('id', userId);
  await audit(admin, schoolId, actorId, 'password_reset', userId, {});
  return { error: null, tempPassword: password };
}
