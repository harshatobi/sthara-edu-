import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normClass } from './people';
import { planCorrections, type CorrectionInput, type CorrectionPlan, type RosterPerson } from './corrections';

/**
 * Operator support fixes at one school: guardian links, class moves and
 * year-end promotion, marking people as left, and bulk roster corrections.
 * Every write checks that the records belong to the school, needs a reason,
 * and is written to audit_log as the operator.
 *
 * Parents are linked in two places (see accounts.ts): public.guardians (read by
 * RLS and the fee reminders) and users.metadata.linkedStudents (roll numbers,
 * read by the parent API). Both are kept in step here.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

/** A ban that outlasts any school year; "none" lifts it. */
const LEFT_BAN = '876000h';

async function audit(db: Db, schoolId: string, actorId: string, action: string, table: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({
    actor_id: actorId, actor_role: 'operator', action, table_name: table, row_id: rowId, school_id: schoolId, new_values: values,
  });
  if (error) console.warn('[ops support audit]', error.message);
}

async function person(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('users').select('id, school_id, role, name, email, student_class, custom_student_id, metadata').eq('id', id).maybeSingle();
  return data && data.school_id === schoolId ? data : null;
}

const rollsOf = (m: unknown) => (Array.isArray((m as { linkedStudents?: unknown })?.linkedStudents) ? ((m as { linkedStudents: unknown[] }).linkedStudents.map(String)) : []);

async function setParentRolls(db: Db, parentId: string, metadata: Record<string, unknown> | null, rolls: string[]) {
  const uniq = [...new Map(rolls.filter(Boolean).map(r => [r.trim().toLowerCase(), r.trim()])).values()];
  return db.from('users').update({ metadata: { ...(metadata || {}), linkedStudents: uniq } }).eq('id', parentId);
}

// ── Families ─────────────────────────────────────────────────────────────────

export interface FamilyLink { parentId: string; name: string; email: string; relationship: string | null; verified: boolean; left: boolean }
export interface FamilyRow { studentId: string; name: string; rollNo: string | null; cls: string | null; left: boolean; links: FamilyLink[] }
export interface ParentRow { id: string; name: string; email: string; left: boolean; children: number }

export async function loadFamilies(db: Db, schoolId: string) {
  const { data: people, error } = await db.from('users').select('id, role, name, email, student_class, custom_student_id, metadata')
    .eq('school_id', schoolId).in('role', ['student', 'parent']).order('name');
  if (error) return fail(error.message, 500);
  const students = (people || []).filter(p => p.role === 'student');
  const parents = (people || []).filter(p => p.role === 'parent');
  const ids = students.map(s => s.id);
  const { data: links, error: lErr } = ids.length
    ? await db.from('guardians').select('parent_id, student_id, relationship, verified').in('student_id', ids)
    : { data: [], error: null };
  if (lErr) return fail(lErr.message, 500);
  const parentById = new Map(parents.map(p => [p.id, p]));
  const isLeft = (m: unknown) => !!(m as { left?: unknown } | null)?.left;

  const families: FamilyRow[] = students.map(s => ({
    studentId: s.id, name: s.name, rollNo: s.custom_student_id, cls: s.student_class, left: isLeft(s.metadata),
    links: (links || []).filter(l => l.student_id === s.id && parentById.has(l.parent_id)).map(l => {
      const p = parentById.get(l.parent_id)!;
      return { parentId: p.id, name: p.name, email: p.email, relationship: l.relationship, verified: l.verified, left: isLeft(p.metadata) };
    }),
  }));
  const parentRows: ParentRow[] = parents.map(p => ({
    id: p.id, name: p.name, email: p.email, left: isLeft(p.metadata), children: (links || []).filter(l => l.parent_id === p.id).length,
  }));
  return { ok: true as const, families, parents: parentRows };
}

export async function linkGuardian(db: Db, schoolId: string, actorId: string, parentId: string, studentId: string, relationship: string | null, reason: string): Promise<Result> {
  const [parent, student] = await Promise.all([person(db, schoolId, parentId), person(db, schoolId, studentId)]);
  if (!parent || parent.role !== 'parent') return fail('Parent not found at this school.', 404);
  if (!student || student.role !== 'student') return fail('Student not found at this school.', 404);
  const rel = relationship?.trim().slice(0, 40) || 'parent';
  const { error } = await db.from('guardians').upsert(
    { parent_id: parentId, student_id: studentId, relationship: rel, verified: true },
    { onConflict: 'parent_id,student_id' },
  );
  if (error) return fail(error.message, 500);
  if (student.custom_student_id) {
    const { error: mErr } = await setParentRolls(db, parentId, parent.metadata, [...rollsOf(parent.metadata), student.custom_student_id]);
    if (mErr) return fail(`Linked, but the parent's child list wasn't updated: ${mErr.message}`, 500);
  }
  await audit(db, schoolId, actorId, 'guardian_linked', 'guardians', studentId, { parentId, relationship: rel, verified: true, reason });
  return { ok: true };
}

export async function setGuardianVerified(db: Db, schoolId: string, actorId: string, parentId: string, studentId: string, verified: boolean, reason: string): Promise<Result> {
  const [parent, student] = await Promise.all([person(db, schoolId, parentId), person(db, schoolId, studentId)]);
  if (!parent || !student) return fail('Link not found at this school.', 404);
  const { data, error } = await db.from('guardians').update({ verified }).eq('parent_id', parentId).eq('student_id', studentId).select('id');
  if (error) return fail(error.message, 500);
  if (!data?.length) return fail('Link not found at this school.', 404);
  await audit(db, schoolId, actorId, verified ? 'guardian_verified' : 'guardian_unverified', 'guardians', studentId, { parentId, reason });
  return { ok: true };
}

export async function unlinkGuardian(db: Db, schoolId: string, actorId: string, parentId: string, studentId: string, reason: string): Promise<Result> {
  const [parent, student] = await Promise.all([person(db, schoolId, parentId), person(db, schoolId, studentId)]);
  if (!parent || !student) return fail('Link not found at this school.', 404);
  const { error } = await db.from('guardians').delete().eq('parent_id', parentId).eq('student_id', studentId);
  if (error) return fail(error.message, 500);
  const roll = student.custom_student_id?.trim().toLowerCase();
  if (roll) await setParentRolls(db, parentId, parent.metadata, rollsOf(parent.metadata).filter(r => r.trim().toLowerCase() !== roll));
  await audit(db, schoolId, actorId, 'guardian_unlinked', 'guardians', studentId, { parentId, reason });
  return { ok: true };
}

// ── Roster moves ─────────────────────────────────────────────────────────────

async function className(db: Db, schoolId: string, cls: string) {
  const { data } = await db.from('classes').select('name').eq('school_id', schoolId);
  return (data || []).find(c => normClass(c.name) === normClass(cls))?.name ?? null;
}

/** Moves the given students to one class. Refused as a whole if any id isn't a student here. */
export async function moveStudents(db: Db, schoolId: string, actorId: string, studentIds: string[], toClass: string, reason: string): Promise<Result<{ moved: number }>> {
  const ids = [...new Set(studentIds)];
  if (!ids.length || ids.length > 500) return fail('Pick between 1 and 500 students.');
  const target = await className(db, schoolId, toClass);
  if (!target) return fail(`Class "${toClass}" isn't set up for this school.`);
  const { data: rows } = await db.from('users').select('id, role, school_id, student_class').in('id', ids);
  if ((rows || []).length !== ids.length || rows!.some(r => r.school_id !== schoolId || r.role !== 'student')) return fail('Every id must be a student at this school.', 404);
  const moving = rows!.filter(r => normClass(r.student_class ?? '') !== normClass(target));
  if (!moving.length) return { ok: true, moved: 0 };
  const { error } = await db.from('users').update({ student_class: target }).in('id', moving.map(r => r.id));
  if (error) return fail(error.message, 500);
  await Promise.all(moving.map(r => audit(db, schoolId, actorId, 'student_moved', 'users', r.id, { from: r.student_class, to: target, reason })));
  return { ok: true, moved: moving.length };
}

/** Year-end promotion: every student still in `fromClass` (and not marked as left) moves to `toClass`. */
export async function promoteClass(db: Db, schoolId: string, actorId: string, fromClass: string, toClass: string, reason: string): Promise<Result<{ moved: number }>> {
  const from = await className(db, schoolId, fromClass);
  if (!from) return fail(`Class "${fromClass}" isn't set up for this school.`);
  if (normClass(from) === normClass(toClass)) return fail('Pick a different class to promote into.');
  const { data } = await db.from('users').select('id, student_class, metadata').eq('school_id', schoolId).eq('role', 'student');
  const ids = (data || []).filter(s => normClass(s.student_class ?? '') === normClass(from) && !(s.metadata as { left?: unknown } | null)?.left).map(s => s.id);
  if (!ids.length) return fail(`No current students in ${from}.`);
  return moveStudents(db, schoolId, actorId, ids, toClass, `Promotion ${from} to ${toClass}: ${reason}`);
}

// ── Left the school ──────────────────────────────────────────────────────────

/**
 * Marks someone as having left (sign-in blocked, record and history kept) or
 * brings them back. The school's last active school admin can't be marked left.
 */
export async function setLeft(db: Db, schoolId: string, actorId: string, userId: string, left: boolean, reason: string): Promise<Result> {
  const u = await person(db, schoolId, userId);
  if (!u || u.role === 'superadmin') return fail('Account not found at this school.', 404);
  const meta = (u.metadata || {}) as Record<string, unknown>;
  if (left === !!meta.left) return fail(left ? 'Already marked as left.' : 'This account is active.', 409);
  if (left && u.role === 'admin') {
    const { data: grants } = await db.from('role_grants').select('user_id').eq('school_id', schoolId).eq('role_key', 'school_admin').is('revoked_at', null);
    const holders = new Set((grants || []).map(g => g.user_id));
    if (holders.has(userId)) {
      const { data: others } = holders.size > 1 ? await db.from('users').select('id, metadata').in('id', [...holders].filter(h => h !== userId)) : { data: [] };
      if (!(others || []).some(o => !(o.metadata as { left?: unknown } | null)?.left)) {
        return fail('This is the school’s only active school admin. Give another admin that role first.', 409);
      }
    }
  }
  const { error: bErr } = await db.auth.admin.updateUserById(userId, { ban_duration: left ? LEFT_BAN : 'none' });
  if (bErr) return fail(`Sign-in wasn't changed: ${bErr.message}`, 500);
  const next = { ...meta };
  if (left) next.left = { on: new Date().toISOString(), reason, by: actorId };
  else delete next.left;
  const { error } = await db.from('users').update({ metadata: next }).eq('id', userId);
  if (error) {
    await db.auth.admin.updateUserById(userId, { ban_duration: left ? 'none' : LEFT_BAN }).catch(() => {});
    return fail(error.message, 500);
  }
  await audit(db, schoolId, actorId, left ? 'account_left' : 'account_returned', 'users', userId, { role: u.role, reason });
  return { ok: true };
}

// ── Bulk corrections ─────────────────────────────────────────────────────────

async function correctionContext(db: Db, schoolId: string, rows: CorrectionInput[]) {
  const [{ data: people }, { data: classes }] = await Promise.all([
    db.from('users').select('id, role, name, email, student_class, custom_student_id').eq('school_id', schoolId),
    db.from('classes').select('name').eq('school_id', schoolId),
  ]);
  const wanted = [...new Set(rows.map(r => r.newEmail).filter(Boolean))] as string[];
  const { data: taken } = wanted.length ? await db.from('users').select('email').in('email', wanted) : { data: [] as { email: string }[] };
  return {
    people: (people || []) as RosterPerson[],
    classes: (classes || []).map(c => c.name as string),
    takenEmails: new Set((taken || []).map(t => String(t.email).toLowerCase())),
  };
}

export async function previewCorrections(db: Db, schoolId: string, rows: CorrectionInput[]) {
  return planCorrections(rows, await correctionContext(db, schoolId, rows));
}

/**
 * Applies a correction batch. Nothing is applied if any row has an issue (the
 * console shows the same preview first). Rows are applied one by one; each
 * result says what happened, so a failure midway is visible, not silent.
 */
export async function applyCorrections(db: Db, schoolId: string, actorId: string, rows: CorrectionInput[], reason: string) {
  const plan = await previewCorrections(db, schoolId, rows);
  if (plan.some(p => p.issues.length)) return { ok: false as const, status: 422, error: 'Some rows have problems. Fix them and preview again.', plan };
  const results: { row: number; status: 'applied' | 'skipped' | 'error'; message?: string }[] = [];
  for (const p of plan) {
    if (!p.changes.length) { results.push({ row: p.row, status: 'skipped' }); continue; }
    const uid = p.userId!;
    const patch: Record<string, unknown> = {};
    for (const c of p.changes) {
      if (c.field === 'name') patch.name = c.to;
      if (c.field === 'email') patch.email = c.to;
      if (c.field === 'rollNo') patch.custom_student_id = c.to;
      if (c.field === 'class') patch.student_class = c.to;
    }
    const email = p.changes.find(c => c.field === 'email');
    if (email) {
      const { error } = await db.auth.admin.updateUserById(uid, { email: email.to, email_confirm: true });
      if (error) { results.push({ row: p.row, status: 'error', message: `Login email not changed: ${error.message}` }); continue; }
    }
    const { error } = await db.from('users').update(patch).eq('id', uid);
    if (error) {
      if (email) await db.auth.admin.updateUserById(uid, { email: email.from!, email_confirm: true }).catch(() => {});
      results.push({ row: p.row, status: 'error', message: error.message });
      continue;
    }
    // A new roll number: parents who link by the old one follow it.
    const roll = p.changes.find(c => c.field === 'rollNo');
    if (roll?.from) {
      const old = roll.from.trim().toLowerCase();
      const { data: parents } = await db.from('users').select('id, metadata').eq('school_id', schoolId).eq('role', 'parent');
      for (const par of parents || []) {
        const rolls = rollsOf(par.metadata);
        if (rolls.some(r => r.trim().toLowerCase() === old)) {
          await setParentRolls(db, par.id, par.metadata, rolls.map(r => (r.trim().toLowerCase() === old ? roll.to : r)));
        }
      }
    }
    await audit(db, schoolId, actorId, 'roster_corrected', 'users', uid, { changes: p.changes, reason });
    results.push({ row: p.row, status: 'applied' });
  }
  return { ok: true as const, results, plan: plan as CorrectionPlan[] };
}
