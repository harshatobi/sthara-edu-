import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { checkFamily, checkProposal, cleanPhone, type FamilyInput } from './register';

/**
 * Family on the student record (brief 02): contacts, emergency contacts in calling order, sibling suggestions the
 * registrar decides, and the changes parents propose. The caller has been authorised and passes the school.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

const FCOLS = 'id, student_id, relation, name, phone, email, education, occupation, annual_income, is_primary, lives_with, user_id, updated_at';

async function studentOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('students').select('id, school_id, status, full_name, admission_no, user_id').eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data;
}

/** Family, emergency order, siblings (with names) and open requests for one student. */
export async function familyOf(db: Db, schoolId: string, studentId: string) {
  const [fam, em, sib, req] = await Promise.all([
    db.from('family_members').select(FCOLS).eq('student_id', studentId).eq('school_id', schoolId).order('is_primary', { ascending: false }).order('created_at').limit(30),
    db.from('emergency_contacts').select('id, position, family_member_id, name, relation, phone').eq('student_id', studentId).order('position').limit(3),
    db.from('sibling_links').select('id, a, b, status, source').eq('school_id', schoolId).or(`a.eq.${studentId},b.eq.${studentId}`).neq('status', 'rejected').limit(40),
    db.from('student_change_requests').select('id, kind, target_id, proposed, note, status, requested_by, created_at').eq('student_id', studentId).eq('status', 'pending').order('created_at').limit(40),
  ]);
  const others = (sib.data || []).map(l => (l.a === studentId ? l.b : l.a));
  const names = new Map<string, { name: string; admissionNo: string }>();
  if (others.length) {
    const { data } = await byIds<{ id: string; full_name: string; admission_no: string }>(others, (chunk, f, t) => db.from('students').select('id, full_name, admission_no').in('id', chunk).order('id').range(f, t));
    for (const s of data) names.set(s.id, { name: s.full_name, admissionNo: s.admission_no });
  }
  return {
    family: fam.data || [],
    emergency: em.data || [],
    siblings: (sib.data || []).map(l => { const o = l.a === studentId ? l.b : l.a; return { linkId: l.id, studentId: o, status: l.status, source: l.source, ...(names.get(o) ?? { name: 'Student', admissionNo: '' }) }; }),
    requests: req.data || [],
  };
}

/** Adds or edits a family member (registrar). A new primary contact takes over from the old one. */
export async function saveFamily(db: Db, a: Actor, studentId: string, input: Record<string, unknown>, memberId?: string): Promise<Result<{ id: string }>> {
  const st = await studentOf(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  if (st.status === 'cancelled') return fail('This entry is cancelled.', 409);
  const c = checkFamily(input);
  if ('error' in c) return fail(c.error);
  return writeFamily(db, a, studentId, c.value, memberId);
}

async function writeFamily(db: Db, a: Actor, studentId: string, v: FamilyInput, memberId?: string): Promise<Result<{ id: string }>> {
  if (v.is_primary) {
    let q = db.from('family_members').update({ is_primary: false }).eq('student_id', studentId).eq('is_primary', true);
    if (memberId) q = q.neq('id', memberId);
    await q;
  }
  if (memberId) {
    const { data, error } = await db.from('family_members').update(v).eq('id', memberId).eq('student_id', studentId).eq('school_id', a.schoolId).select('id').maybeSingle();
    if (error) return fail('Could not save.', 500);
    return data ? { ok: true, id: data.id } : fail('Family member not found.', 404);
  }
  const { data, error } = await db.from('family_members').insert({ ...v, school_id: a.schoolId, student_id: studentId, created_by: a.id }).select('id').single();
  return error || !data ? fail('Could not save.', 500) : { ok: true, id: data.id };
}

/** Removes a family member who isn't a parent login (unlink the login through Sthara first). */
export async function removeFamily(db: Db, a: Actor, studentId: string, memberId: string): Promise<Result> {
  const { data } = await db.from('family_members').select('id, user_id').eq('id', memberId).eq('student_id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!data) return fail('Family member not found.', 404);
  if (data.user_id) return fail('This person has a Sthara parent login linked to the student. Ask Sthara support to unlink it first.', 409);
  const { error } = await db.from('family_members').delete().eq('id', memberId);
  return error ? fail('Could not remove.', 500) : { ok: true };
}

export interface EmergencyInput { familyMemberId?: string | null; name?: string; relation?: string; phone?: string }
/** Sets the emergency contacts in calling order (up to 3): family members on the record, or other people. */
export async function setEmergency(db: Db, a: Actor, studentId: string, list: EmergencyInput[]): Promise<Result> {
  if (!Array.isArray(list) || list.length > 3) return fail('Up to three emergency contacts.');
  const st = await studentOf(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  const fam = new Set(((await db.from('family_members').select('id').eq('student_id', studentId).limit(30)).data || []).map(f => f.id));
  const rows = [];
  for (const [i, e] of list.entries()) {
    if (e.familyMemberId) {
      if (!fam.has(e.familyMemberId)) return fail('An emergency contact must be family on this record, or someone with a name and phone.');
      rows.push({ school_id: a.schoolId, student_id: studentId, position: i + 1, family_member_id: e.familyMemberId, name: null, relation: null, phone: null });
    } else {
      const name = (e.name || '').trim(), phone = cleanPhone(e.phone || '');
      if (!name || name.length > 120) return fail(`Emergency contact ${i + 1} needs a name.`);
      if (!phone) return fail(`Emergency contact ${i + 1} needs a phone number.`);
      rows.push({ school_id: a.schoolId, student_id: studentId, position: i + 1, family_member_id: null, name, relation: (e.relation || '').trim().slice(0, 40) || null, phone });
    }
  }
  const del = await db.from('emergency_contacts').delete().eq('student_id', studentId).eq('school_id', a.schoolId);
  if (del.error) return fail('Could not save.', 500);
  if (rows.length) { const { error } = await db.from('emergency_contacts').insert(rows); if (error) return fail('Could not save.', 500); }
  return { ok: true };
}

/** Confirms or rejects a suggested sibling pair, or links two students by hand (source "office"). */
export async function decideSibling(db: Db, a: Actor, studentId: string, otherId: string, decision: 'confirmed' | 'rejected'): Promise<Result> {
  if (studentId === otherId) return fail('A student can’t be their own sibling.');
  const [x, y] = [studentId, otherId].sort();
  const both = await byIds<{ id: string }>([x, y], (chunk, f, t) => db.from('students').select('id').in('id', chunk).eq('school_id', a.schoolId).order('id').range(f, t));
  if (both.data.length !== 2) return fail('Both students must be at this school.', 404);
  const decided = { status: decision, decided_by: a.id, decided_at: new Date().toISOString() };
  // A suggestion keeps how it was found; a pair the office links by hand is marked so.
  const { data: had } = await db.from('sibling_links').update(decided).eq('a', x).eq('b', y).eq('school_id', a.schoolId).select('id');
  if (had?.length) return { ok: true };
  const { error } = await db.from('sibling_links').insert({ school_id: a.schoolId, a: x, b: y, source: 'office', ...decided });
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** Confirmed siblings of a student (for the fee concession screen). */
export async function confirmedSiblings(db: Db, schoolId: string, studentId: string) {
  const { data } = await db.from('sibling_links').select('a, b').eq('school_id', schoolId).eq('status', 'confirmed').or(`a.eq.${studentId},b.eq.${studentId}`).limit(20);
  const ids = (data || []).map(l => (l.a === studentId ? l.b : l.a));
  if (!ids.length) return [];
  const { data: st } = await byIds<{ id: string; full_name: string; admission_no: string; user_id: string | null }>(ids, (chunk, f, t) => db.from('students').select('id, full_name, admission_no, user_id').in('id', chunk).order('id').range(f, t));
  return st;
}

// ── Requests from parents ───────────────────────────────────────────────────

/** The office queue: pending requests across the school, oldest first, with the student. */
export async function pendingRequests(db: Db, schoolId: string) {
  const { data, error } = await pageAll<any>((f, t) => db.from('student_change_requests')
    .select('id, student_id, kind, target_id, proposed, note, created_at, requested_by, students!inner(full_name, admission_no)')
    .eq('school_id', schoolId).eq('status', 'pending').order('created_at').order('id').range(f, t), 5_000);
  if (error) throw new Error(error.message);
  const who = new Map<string, string>();
  const ids = [...new Set(data.map(r => r.requested_by))];
  if (ids.length) {
    const { data: ps } = await byIds<{ id: string; name: string | null }>(ids, (chunk, f, t) => db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
    for (const p of ps) who.set(p.id, p.name || 'Parent');
  }
  return data.map(r => ({ id: r.id, studentId: r.student_id, student: r.students.full_name, admissionNo: r.students.admission_no, kind: r.kind, targetId: r.target_id,
    proposed: r.proposed, note: r.note, createdAt: r.created_at, by: who.get(r.requested_by) ?? 'Parent' }));
}

/** Approves (applies) or rejects a parent request. Applying runs the same checks the office's own edits do. */
export async function decideRequest(db: Db, a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const { data: r } = await db.from('student_change_requests').select('*').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!r) return fail('Request not found.', 404);
  if (r.status !== 'pending') return fail('Already decided.', 409);
  if (!approve && note.trim().length < 3) return fail('Say why, so the parent knows what to fix.');
  if (approve) {
    const checked = checkProposal(r.kind, r.proposed);
    if ('error' in checked) return fail(`The request can’t be applied as it stands: ${checked.error}`, 409);
    let out: Result<object>;
    if (r.kind === 'address') {
      const { error } = await db.rpc('student_correct', { p_student: r.student_id, p_school: a.schoolId, p_actor: a.id, p_kind: 'staff', p_patch: checked.value, p_reason: 'Requested by parent, approved by the office', p_masked: {} });
      out = error ? fail(error.message, 400) : { ok: true };
    } else if (r.kind === 'family') {
      const target = r.target_id as string | null;
      if (target) {
        const { data: cur } = await db.from('family_members').select('is_primary').eq('id', target).maybeSingle();
        out = await writeFamily(db, a, r.student_id, { ...(checked.value as unknown as FamilyInput), is_primary: !!cur?.is_primary }, target);
      } else out = await writeFamily(db, a, r.student_id, checked.value as unknown as FamilyInput);
    } else out = await setEmergency(db, a, r.student_id, (checked.value as { list: EmergencyInput[] }).list);
    if (!out.ok) return out;
  }
  const { error } = await db.from('student_change_requests').update({ status: approve ? 'approved' : 'rejected', decided_by: a.id, decided_at: new Date().toISOString(), decision_note: note.trim().slice(0, 300) || null })
    .eq('id', id).eq('status', 'pending');
  return error ? fail('Could not save the decision.', 500) : { ok: true };
}

/** A parent proposes a change for one of their verified children. */
export async function propose(db: Db, parentId: string, studentUserId: string, kind: unknown, proposed: unknown, targetId: unknown, note: unknown): Promise<Result<{ id: string }>> {
  if (kind !== 'address' && kind !== 'family' && kind !== 'emergency') return fail('Pick what you want to change.');
  const { data: g } = await db.from('guardians').select('id').eq('parent_id', parentId).eq('student_id', studentUserId).eq('verified', true).maybeSingle();
  if (!g) return fail('Only a verified parent can propose changes.', 403);
  const { data: st } = await db.from('students').select('id, school_id').eq('user_id', studentUserId).maybeSingle();
  if (!st) return fail('This student isn’t on the school register yet.', 404);
  const checked = checkProposal(kind, (proposed && typeof proposed === 'object' ? proposed : {}) as Record<string, unknown>);
  if ('error' in checked) return fail(checked.error);
  let target: string | null = null;
  if (kind === 'family' && typeof targetId === 'string') {
    const { data: f } = await db.from('family_members').select('id').eq('id', targetId).eq('student_id', st.id).maybeSingle();
    if (!f) return fail('That family member isn’t on this record.', 404);
    target = f.id;
  }
  const { count } = await db.from('student_change_requests').select('id', { count: 'exact', head: true }).eq('student_id', st.id).eq('requested_by', parentId).eq('status', 'pending');
  if ((count ?? 0) >= 10) return fail('You already have 10 changes waiting for the school. Wait for them to be looked at first.', 429);
  const { data, error } = await db.from('student_change_requests').insert({
    school_id: st.school_id, student_id: st.id, requested_by: parentId, kind, target_id: target, proposed: checked.value,
    note: typeof note === 'string' ? note.trim().slice(0, 300) || null : null,
  }).select('id').single();
  return error || !data ? fail('Could not send the request.', 500) : { ok: true, id: data.id };
}

/** What a parent sees for one verified child: address, family, emergency contacts and their own requests. */
export async function parentView(db: Db, parentId: string, studentUserId: string) {
  const { data: g } = await db.from('guardians').select('id').eq('parent_id', parentId).eq('student_id', studentUserId).eq('verified', true).maybeSingle();
  if (!g) return null;
  const { data: st } = await db.from('students').select('id, school_id, full_name, address, permanent_address, permanent_same').eq('user_id', studentUserId).maybeSingle();
  if (!st) return null;
  const [fam, em, req] = await Promise.all([
    db.from('family_members').select('id, relation, name, phone, email, education, occupation, is_primary').eq('student_id', st.id).order('is_primary', { ascending: false }).order('created_at').limit(30),
    db.from('emergency_contacts').select('position, family_member_id, name, relation, phone').eq('student_id', st.id).order('position').limit(3),
    db.from('student_change_requests').select('id, kind, proposed, status, decision_note, created_at').eq('student_id', st.id).eq('requested_by', parentId).order('created_at', { ascending: false }).limit(20),
  ]);
  return { student: { name: st.full_name, address: st.address, permanentAddress: st.permanent_address, permanentSame: st.permanent_same }, family: fam.data || [], emergency: em.data || [], requests: req.data || [] };
}
