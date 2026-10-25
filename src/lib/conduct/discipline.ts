import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate, isoDay } from '@/lib/admin/format';
import type { Access } from '@/lib/admin/rbac';
import { byIds, pageAll } from '@/lib/ops/page';
import { notifyGuardians } from '@/lib/parent/notify';
import { currentSession } from '@/lib/students/register';
import { ACTION_LABEL, approverPerm, archived, checkAction, parentLine, parentSees, type ActionKind, type ActionStatus } from './rules';

/**
 * Discipline actions (brief 07), server side. Any teacher (or office member) proposes a warning, parent meeting,
 * detention or suspension; the vice principal or principal approves (a suspension is the principal's). Approved
 * actions are on the record and the parent portal; warnings and detentions move to the archive at the next session.
 * The caller has been authenticated and passes the school.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

const COLS = 'id, student_id, incident_id, session, kind, on_date, until_date, reason, details, status, return_note, cancel_reason, notify_parent, parent_notified_at, proposed_by, approved_by, approved_at, created_at';

export interface ActionRow {
  id: string; studentId: string; student: string; admissionNo: string; incidentId: string | null; session: string; kind: ActionKind;
  onDate: string; untilDate: string | null; reason: string; details: string | null; status: ActionStatus; returnNote: string | null;
  cancelReason: string | null; parentNotifiedAt: string | null; proposedBy: string | null; approvedBy: string | null; approvedAt: string | null;
  createdAt: string; archived: boolean;
}

async function sessionOf(db: Db, schoolId: string) {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  return currentSession(data?.settings);
}
async function names(db: Db, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await byIds<{ id: string; name: string | null }>(want, (chunk, f, t) => db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
  return new Map(data.map(u => [u.id, u.name || 'Someone']));
}
async function shape(db: Db, rows: any[], session: string): Promise<ActionRow[]> {
  const who = await names(db, rows.flatMap(r => [r.proposed_by, r.approved_by]));
  return rows.map(r => ({
    id: r.id, studentId: r.student_id, student: r.students?.full_name ?? '', admissionNo: r.students?.admission_no ?? '', incidentId: r.incident_id, session: r.session,
    kind: r.kind, onDate: r.on_date, untilDate: r.until_date, reason: r.reason, details: r.details, status: r.status, returnNote: r.return_note, cancelReason: r.cancel_reason,
    parentNotifiedAt: r.parent_notified_at, proposedBy: r.proposed_by ? who.get(r.proposed_by) ?? null : null, approvedBy: r.approved_by ? who.get(r.approved_by) ?? null : null,
    approvedAt: r.approved_at, createdAt: r.created_at, archived: archived(r, session),
  }));
}

/** Tells the student's parents about an approved action (only when the approver chose to, and the student has a login). */
async function tellParents(db: Db, schoolId: string, row: any): Promise<number> {
  const { data: st } = await db.from('students').select('user_id').eq('id', row.student_id).maybeSingle();
  if (!st?.user_id) return 0;
  const r = await notifyGuardians(db, {
    schoolId, studentId: st.user_id, type: 'discipline', pref: 'alerts',
    title: `${ACTION_LABEL[row.kind as ActionKind]} from the school`,
    body: `${parentLine(row, d => fmtDate(d))}. Please contact the class teacher or the principal if you would like to talk about it.`,
    metadata: { actionId: row.id, kind: row.kind },
  });
  if (r.parents) await db.from('discipline_actions').update({ parent_notified_at: new Date().toISOString() }).eq('id', row.id);
  return r.parents;
}

/**
 * Proposes an action. `direct` (an approver recording their own decision) approves it at once; it must hold the
 * approving permission for this kind of action.
 */
export async function propose(db: Db, a: Actor, studentId: string, b: Record<string, unknown>, direct: { access: Access; notify: boolean } | null, ownIncidentsOnly = false): Promise<Result<{ id: string; status: ActionStatus; parentsTold: number }>> {
  const c = checkAction(b, isoDay());
  if ('error' in c) return fail(c.error);
  const { data: st } = await db.from('students').select('id, status, user_id').eq('id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!st || st.status === 'cancelled') return fail('That student is not on the register.', 404);
  if (st.status !== 'active') return fail('The student has left the school.', 409);
  let incidentId: string | null = null;
  if (typeof b.incidentId === 'string' && b.incidentId) {
    const { data: inc } = await db.from('incidents').select('id, category, student_id, logged_by').eq('id', b.incidentId).eq('school_id', a.schoolId).maybeSingle();
    // A child-protection case never becomes a discipline matter here; a teacher links only what they logged.
    if (!inc || inc.category === 'child_protection' || (ownIncidentsOnly && inc.logged_by !== a.id)) return fail('That incident is not one you can link.', 404);
    if (inc.student_id && inc.student_id !== st.user_id) return fail('That incident is about another student.');
    incidentId = inc.id;
  }
  if (direct && !direct.access.can(approverPerm(c.value.kind))) return fail(c.value.kind === 'suspension' ? 'Only the principal approves a suspension.' : 'Your role doesn’t approve discipline actions.', 403);
  const now = new Date().toISOString();
  const { data, error } = await db.from('discipline_actions').insert({
    ...c.value, school_id: a.schoolId, student_id: st.id, incident_id: incidentId, session: await sessionOf(db, a.schoolId), proposed_by: a.id,
    ...(direct ? { status: 'approved', approved_by: a.id, approved_at: now, notify_parent: direct.notify } : {}),
  }).select(COLS).single();
  if (error || !data) return fail('Could not save the action.', 500);
  const told = direct?.notify ? await tellParents(db, a.schoolId, data) : 0;
  return { ok: true, id: data.id, status: data.status, parentsTold: told };
}

/** Approve or send back one proposed action. The approver's role must cover the kind (a suspension is the principal's). */
export async function decide(db: Db, a: Actor, access: Access, id: string, approve: boolean, b: { note?: string; notify?: boolean }): Promise<Result<{ parentsTold: number }>> {
  const { data: row } = await db.from('discipline_actions').select(COLS).eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!row) return fail('Action not found.', 404);
  if (row.status !== 'proposed') return fail('Someone has already decided this one. Refresh.', 409);
  if (!access.can(approverPerm(row.kind))) return fail(row.kind === 'suspension' ? 'Only the principal approves a suspension.' : 'Your role doesn’t approve discipline actions.', 403);
  if (!approve) {
    const note = (b.note ?? '').trim();
    if (note.length < 3) return fail('Say why, so the teacher knows.');
    const { data: done } = await db.from('discipline_actions').update({ status: 'returned', return_note: note.slice(0, 300) }).eq('id', id).eq('status', 'proposed').select('id').maybeSingle();
    return done ? { ok: true, parentsTold: 0 } : fail('Someone has already decided this one. Refresh.', 409);
  }
  const { data: done } = await db.from('discipline_actions').update({ status: 'approved', approved_by: a.id, approved_at: new Date().toISOString(), notify_parent: !!b.notify, return_note: null })
    .eq('id', id).eq('status', 'proposed').select(COLS).maybeSingle();
  if (!done) return fail('Someone has already decided this one. Refresh.', 409);
  return { ok: true, parentsTold: b.notify ? await tellParents(db, a.schoolId, done) : 0 };
}

/**
 * Withdraws a proposal (its proposer, or an approver) or cancels an approved action (an approver of its kind). A
 * cancelled action stays, marked, and leaves the parent view.
 */
export async function cancel(db: Db, a: Actor, access: Access | null, id: string, reason: string): Promise<Result> {
  const { data: row } = await db.from('discipline_actions').select('id, kind, status, proposed_by').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!row) return fail('Action not found.', 404);
  if (row.status === 'cancelled') return { ok: true };
  const approver = !!access?.can(approverPerm(row.kind));
  const ownProposal = row.proposed_by === a.id && (row.status === 'proposed' || row.status === 'returned');
  if (!approver && !ownProposal) return fail('Only the principal or vice principal cancels an approved action.', 403);
  if (reason.trim().length < 3) return fail('Say why it is cancelled.');
  const { error } = await db.from('discipline_actions').update({ status: 'cancelled', cancel_reason: reason.trim().slice(0, 300), cancelled_by: a.id, cancelled_at: new Date().toISOString() })
    .eq('id', id).neq('status', 'cancelled');
  return error ? fail('Could not cancel.', 500) : { ok: true };
}

/** Waiting for a decision, oldest first. */
export async function waiting(db: Db, schoolId: string): Promise<ActionRow[]> {
  const { data, error } = await pageAll<any>((f, t) => db.from('discipline_actions').select(`${COLS}, students!inner(full_name, admission_no)`)
    .eq('school_id', schoolId).eq('status', 'proposed').order('created_at').order('id').range(f, t), 5_000);
  if (error) throw new Error(error.message);
  return shape(db, data, await sessionOf(db, schoolId));
}

/**
 * The school's actions, newest first: the current record (archived ones left out) or the archive (warnings and
 * detentions of earlier sessions). Approved, returned and cancelled ones; proposals are in `waiting`.
 */
export async function register(db: Db, schoolId: string, q: { archive: boolean; studentId?: string; search?: string }): Promise<ActionRow[]> {
  const session = await sessionOf(db, schoolId);
  let query = db.from('discipline_actions').select(`${COLS}, students!inner(full_name, admission_no)`).eq('school_id', schoolId).neq('status', 'proposed');
  if (q.studentId) query = query.eq('student_id', q.studentId);
  if (q.archive) query = query.in('kind', ['warning', 'detention']).lt('session', session);
  const { data, error } = await pageAll<any>((f, t) => query.order('on_date', { ascending: false }).order('id').range(f, t), 20_000);
  if (error) throw new Error(error.message);
  const s = (q.search ?? '').trim().toLowerCase();
  const rows = (await shape(db, data, session)).filter(r => q.archive || !r.archived);
  return s ? rows.filter(r => [r.student, r.admissionNo, r.reason].some(x => x.toLowerCase().includes(s))) : rows;
}

/** One student's actions for the record: proposals too, and the archive only for discipline.archive. */
export async function forStudent(db: Db, schoolId: string, studentId: string, withArchive: boolean): Promise<ActionRow[]> {
  const session = await sessionOf(db, schoolId);
  const { data } = await db.from('discipline_actions').select(`${COLS}, students!inner(full_name, admission_no)`).eq('school_id', schoolId).eq('student_id', studentId)
    .order('on_date', { ascending: false }).limit(500);
  return (await shape(db, data || [], session)).filter(r => withArchive || !r.archived);
}

/** What a parent sees for one child (a register id): approved actions, archived ones left out, no staff details. */
export async function forParent(db: Db, schoolId: string, studentId: string) {
  const session = await sessionOf(db, schoolId);
  const { data } = await db.from('discipline_actions').select('id, session, kind, on_date, until_date, reason, status').eq('school_id', schoolId).eq('student_id', studentId)
    .eq('status', 'approved').order('on_date', { ascending: false }).limit(200);
  return (data || []).filter(r => parentSees(r as any, session)).map(r => ({ id: r.id as string, kind: r.kind as ActionKind, onDate: r.on_date as string, untilDate: r.until_date as string | null, reason: r.reason as string }));
}

/** What a teacher proposed, newest first, with the outcome. */
export async function proposedBy(db: Db, schoolId: string, userId: string): Promise<ActionRow[]> {
  const { data } = await db.from('discipline_actions').select(`${COLS}, students!inner(full_name, admission_no)`).eq('school_id', schoolId).eq('proposed_by', userId)
    .order('created_at', { ascending: false }).limit(200);
  return shape(db, data || [], await sessionOf(db, schoolId));
}

/** Incidents about this student an action may be linked to (not child protection); a teacher's own only. */
export async function linkableIncidents(db: Db, schoolId: string, studentUserId: string | null, loggedBy?: string) {
  if (!studentUserId) return [];
  // bounded: .limit(20) below
  let q = db.from('incidents').select('id, category, summary, occurred_at').eq('school_id', schoolId).eq('student_id', studentUserId).neq('category', 'child_protection');
  if (loggedBy) q = q.eq('logged_by', loggedBy);
  const { data } = await q.order('occurred_at', { ascending: false }).limit(20);
  return (data || []).map(i => ({ id: i.id as string, label: `${fmtDate(String(i.occurred_at).slice(0, 10))}: ${i.summary}` }));
}
