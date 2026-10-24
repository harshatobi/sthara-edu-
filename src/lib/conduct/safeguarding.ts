import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import type { Access } from '@/lib/admin/rbac';
import { byIds, pageAll } from '@/lib/ops/page';
import { openText, piiReady, sealText } from '@/lib/students/pii';
import { checkCpStep, cpState, type CpStep } from './rules';

/**
 * Child protection (brief 07), server side. Child-protection incidents belong to the school's Safeguarding lead; while
 * a school has none, to its principal. Nobody else (not the vice principal, not the school admin) reads them, and the
 * student's record shows nothing. The lead records the POCSO steps; details are encrypted, every look recorded.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

/** Office accounts holding a role today, in this school. */
async function holders(db: Db, schoolId: string, role: string): Promise<string[]> {
  const today = isoDay();
  const { data: g } = await db.from('role_grants').select('user_id, expires_on').eq('school_id', schoolId).eq('role_key', role).is('revoked_at', null);
  const ids = [...new Set((g || []).filter(x => !x.expires_on || x.expires_on >= today).map(x => x.user_id as string))];
  if (!ids.length) return [];
  // bounded: the holders of one role in one school
  const { data: u } = await db.from('users').select('id, role, school_id').in('id', ids);
  return (u || []).filter(x => x.role === 'admin' && x.school_id === schoolId).map(x => x.id as string);
}

/** Whether the school has assigned a Safeguarding lead. */
export const hasLead = async (db: Db, schoolId: string) => (await holders(db, schoolId, 'safeguarding_lead')).length > 0;

/** Who reads child-protection cases (mirrors app.user_cp_reader): the lead, else the principal. */
export async function cpReaders(db: Db, schoolId: string): Promise<string[]> {
  const leads = await holders(db, schoolId, 'safeguarding_lead');
  return leads.length ? leads : holders(db, schoolId, 'principal');
}

/** May this office account read child-protection cases? */
export async function isCpReader(db: Db, schoolId: string, access: Access | null): Promise<boolean> {
  if (!access) return false;
  if (access.can('safeguarding.cases')) return true;
  return access.roles.includes('principal') && !(await hasLead(db, schoolId));
}

async function recordLook(db: Db, a: Actor, rowId: string) {
  await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action: 'safeguarding.viewed', table_name: 'incidents', row_id: rowId, school_id: a.schoolId, new_values: {} });
}
const open = (c: string | null) => { if (!c) return null; try { return openText(c); } catch { return '(could not be read: the key has changed)'; } };

/** The school's child-protection cases, open first, then newest. */
export async function cpCases(db: Db, schoolId: string) {
  const { data, error } = await pageAll<any>((f, t) => db.from('incidents').select('id, student_id, class_name, summary, severity, status, occurred_at, logged_by, created_at')
    .eq('school_id', schoolId).eq('category', 'child_protection').order('created_at', { ascending: false }).order('id').range(f, t), 5_000);
  if (error) throw new Error(error.message);
  const { data: steps } = await byIds<{ incident_id: string; kind: CpStep }>(data.map(i => i.id), (chunk, f, t) =>
    db.from('safeguarding_log').select('incident_id, kind').in('incident_id', chunk).order('id').range(f, t));
  const { data: people } = await byIds<{ id: string; name: string | null }>([...new Set(data.flatMap(i => [i.student_id, i.logged_by]).filter(Boolean))], (chunk, f, t) =>
    db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
  const name = new Map(people.map(p => [p.id, p.name || 'Someone']));
  return data.map(i => {
    const st = cpState(steps.filter(s => s.incident_id === i.id));
    return {
      id: i.id as string, student: i.student_id ? name.get(i.student_id) ?? null : null, className: i.class_name as string | null, summary: i.summary as string,
      open: i.status === 'open', occurredAt: i.occurred_at as string, loggedBy: i.logged_by ? name.get(i.logged_by) ?? null : null, reported: st.reported, steps: steps.filter(s => s.incident_id === i.id).length,
    };
  }).sort((a, b) => Number(b.open) - Number(a.open));
}

/** One case: the incident as logged, and its steps. Recorded. */
export async function cpCase(db: Db, a: Actor, id: string) {
  const { data: i } = await db.from('incidents').select('id, student_id, class_name, summary, details, location, status, outcome, occurred_at, logged_by, created_at')
    .eq('id', id).eq('school_id', a.schoolId).eq('category', 'child_protection').maybeSingle();
  if (!i) return null;
  const { data: steps } = await db.from('safeguarding_log').select('id, kind, on_date, ref, details_cipher, by_user, created_at').eq('incident_id', id).order('on_date').order('created_at').limit(500);
  const ids = [...new Set([i.student_id, i.logged_by, ...(steps || []).map(s => s.by_user)].filter(Boolean) as string[])];
  // bounded: the student, the logger and whoever recorded this case's steps (at most 500)
  const { data: people } = ids.length ? await db.from('users').select('id, name').in('id', ids) : { data: [] };
  const name = new Map((people || []).map(p => [p.id, p.name || 'Someone']));
  await recordLook(db, a, id);
  return {
    id: i.id, student: i.student_id ? name.get(i.student_id) ?? null : null, className: i.class_name, summary: i.summary, details: i.details, location: i.location,
    open: i.status === 'open', outcome: i.outcome, occurredAt: i.occurred_at, loggedBy: i.logged_by ? name.get(i.logged_by) ?? null : null,
    steps: (steps || []).map(s => ({ id: s.id as string, kind: s.kind as CpStep, onDate: s.on_date as string, ref: s.ref as string | null, details: open(s.details_cipher), by: s.by_user ? name.get(s.by_user) ?? null : null })),
    ...cpState((steps || []) as { kind: CpStep }[]),
  };
}

/**
 * Records a step. Informing the parent marks the incident's parent notice as sent (the lead tells them directly; the
 * portal never announces a child-protection case). Closing closes the incident and settles its feed item.
 */
export async function addStep(db: Db, a: Actor & { name: string }, id: string, b: Record<string, unknown>): Promise<Result> {
  const s = checkCpStep(b, isoDay());
  if ('error' in s) return fail(s.error);
  if (s.details && !piiReady()) return fail('Details can’t be stored yet: the encryption key is not set on this server. Tell Sthara support.', 503);
  const { data: i } = await db.from('incidents').select('id, status, parent_notice').eq('id', id).eq('school_id', a.schoolId).eq('category', 'child_protection').maybeSingle();
  if (!i) return fail('Case not found.', 404);
  if (i.status === 'closed' && s.kind !== 'note') return fail('The case is closed; you can still add a note.', 409);
  const { error } = await db.from('safeguarding_log').insert({ school_id: a.schoolId, incident_id: id, kind: s.kind, on_date: s.on_date, ref: s.ref, details_cipher: s.details ? sealText(s.details) : null, by_user: a.id });
  if (error) return fail('Could not save.', 500);
  const now = new Date().toISOString();
  if (s.kind === 'parent_informed' && i.parent_notice !== 'sent') {
    await db.from('incidents').update({ parent_notice: 'sent', parent_notice_by: a.id, parent_notice_at: now }).eq('id', id);
  }
  if (s.kind === 'closed') {
    // The outcome on the incident stays general; what happened is in the encrypted step.
    await db.from('incidents').update({
      status: 'closed', outcome: 'Closed by the safeguarding lead.', closed_by: a.id, closed_at: now,
      ...(i.parent_notice === 'principal_decides' || i.parent_notice === 'awaiting_class_teacher' ? { parent_notice: 'declined', parent_notice_by: a.id, parent_notice_at: now } : {}),
    }).eq('id', id);
    await db.from('situations').update({ acknowledged: true, acknowledged_by: a.id, ack_by_name: a.name, acknowledged_at: now, ack_note: 'Closed by the safeguarding lead.' })
      .eq('school_id', a.schoolId).eq('dedupe_key', `incident:${id}`).is('acknowledged_at', null);
  }
  return { ok: true };
}
