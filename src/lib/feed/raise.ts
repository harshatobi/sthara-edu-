import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { whatsappStaff } from '@/lib/staff/notify';
import { normClass, teachingScope } from '@/lib/teacher/scope';
import { ROLES, type RoleKey } from '@/lib/admin/rbac';
import { escalateAt, higher, type Draft, type Severity } from './rules';

/** Office roles that receive escalations: whoever may decide on incidents. */
const PRINCIPAL_ROLES = (Object.keys(ROLES) as RoleKey[]).filter(r => ROLES[r].perms.includes('incidents.manage'));
/** Office roles that receive students' safety alerts: counsellor, principal, school admin. */
const SAFEGUARDING_ROLES = (Object.keys(ROLES) as RoleKey[]).filter(r => ROLES[r].perms.includes('safeguarding.read'));

/** Teachers of a class (class teacher or any subject in it). */
export async function teachersOf(db: SupabaseClient, schoolId: string, className: string | null | undefined): Promise<string[]> {
  const cls = normClass(className);
  if (!cls) return [];
  const { data } = await db.from('users').select('id, assignments, teacher_class, teacher_subject').eq('school_id', schoolId).eq('role', 'teacher');
  return (data || []).filter(t => teachingScope(t).some(e => normClass(e.cls) === cls)).map(t => t.id);
}

/** The class teacher(s) of a class: their users.teacher_class is that class. */
export async function classTeachersOf(db: SupabaseClient, schoolId: string, className: string | null | undefined): Promise<string[]> {
  const cls = normClass(className);
  if (!cls) return [];
  const { data } = await db.from('users').select('id, teacher_class').eq('school_id', schoolId).eq('role', 'teacher');
  return (data || []).filter(t => normClass(t.teacher_class) === cls).map(t => t.id);
}

/** Office staff who hold incidents.manage (principal, VP, school admin). */
export const principalsOf = (db: SupabaseClient, schoolId: string) => grantHolders(db, schoolId, PRINCIPAL_ROLES);

/** Office staff who hold safeguarding.read (counsellor, principal, school admin). */
export const safeguardingOf = (db: SupabaseClient, schoolId: string) => grantHolders(db, schoolId, SAFEGUARDING_ROLES);

async function grantHolders(db: SupabaseClient, schoolId: string, roles: RoleKey[]): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from('role_grants').select('user_id, expires_on, users!inner(role, school_id)')
    .eq('school_id', schoolId).is('revoked_at', null).in('role_key', roles);
  return [...new Set((data || [])
    .filter((g: any) => (!g.expires_on || g.expires_on >= today) && (Array.isArray(g.users) ? g.users[0] : g.users)?.role === 'admin')
    .map((g: any) => g.user_id as string))];
}

/** Who should hear about an item: the addressed teacher, else the student's/class's teachers; principal items go to principals. */
async function recipients(db: SupabaseClient, schoolId: string, row: any): Promise<string[]> {
  if (row.audience === 'principal') return principalsOf(db, schoolId);
  if (row.audience === 'safeguarding') return safeguardingOf(db, schoolId);
  if (row.teacher_id) return [row.teacher_id];
  return teachersOf(db, schoolId, row.class_name);
}

/**
 * Tells staff about feed items: an in-app notification always; WhatsApp too
 * for critical ones, to staff who linked a number (reply ACK to acknowledge).
 * Never throws.
 */
export async function alertStaff(db: SupabaseClient, schoolId: string, userIds: string[], n: { title: string; body: string; critical: boolean; situationId: string }) {
  try {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return;
    await db.from('notifications').insert(ids.map(uid => ({
      school_id: schoolId, user_id: uid, type: 'feed_alert', title: n.title, body: n.body, metadata: { situationId: n.situationId, critical: n.critical },
    })));
    if (!n.critical) return;
    await whatsappStaff(db, schoolId, ids, 'alerts',
      `*${n.title}*\n${n.body}\n\nReply *ACK* to acknowledge (add a note after it, e.g. ACK called the parent), or open the Situational Feed.`,
      { type: 'feed_alert', situationId: n.situationId });
  } catch (e: any) {
    console.warn('[feed] alertStaff failed:', e?.message);
  }
}

export interface RaiseResult { created: number; updated: number }

/**
 * Writes feed drafts. New dedupe keys are inserted (with their escalation
 * time); existing open items get the latest title, message and a raised
 * severity; acknowledged items are left alone. Critical new items alert
 * their recipients at once.
 */
export async function raise(db: SupabaseClient, schoolId: string, drafts: Draft[], opts: { now?: Date; dayEnd?: string } = {}): Promise<RaiseResult> {
  const now = opts.now ?? new Date();
  const uniq = [...new Map(drafts.map(d => [d.dedupeKey, d])).values()];
  if (!uniq.length) return { created: 0, updated: 0 };
  const existing = new Map<string, any>();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from('situations').select('id, dedupe_key, title, message, severity, acknowledged_at, escalate_at, created_at')
      .eq('school_id', schoolId).in('dedupe_key', uniq.slice(i, i + 200).map(d => d.dedupeKey));
    if (error) throw error;
    for (const r of data || []) existing.set(r.dedupe_key, r);
  }
  const fresh = uniq.filter(d => !existing.has(d.dedupeKey));
  let created = 0, updated = 0;
  if (fresh.length) {
    const rows = fresh.map(d => ({
      school_id: schoolId, teacher_id: d.teacherId ?? null, type: d.kind, category: d.category, severity: d.severity,
      title: d.title.slice(0, 200), message: d.message.slice(0, 1000), student_id: d.studentId ?? null, student_name: d.studentName ?? null,
      class_name: d.className ?? null, subject: d.subject ?? null, audience: d.audience ?? 'staff',
      source_table: d.sourceTable ?? null, source_id: d.sourceId ?? null, dedupe_key: d.dedupeKey, metadata: d.metadata ?? {},
      acknowledged: false, escalate_at: escalateAt(d.severity, now, opts.dayEnd)?.toISOString() ?? null,
    }));
    const { data, error } = await db.from('situations').upsert(rows, { onConflict: 'school_id,dedupe_key', ignoreDuplicates: true }).select('*');
    if (error) throw error;
    created = data?.length ?? 0;
    for (const row of data || []) {
      if (row.severity !== 'critical') continue;
      await alertStaff(db, schoolId, await recipients(db, schoolId, row), { title: row.title, body: row.message, critical: true, situationId: row.id });
    }
  }
  for (const d of uniq) {
    const cur = existing.get(d.dedupeKey);
    if (!cur || cur.acknowledged_at) continue;
    const sev: Severity = higher(cur.severity, d.severity);
    if (cur.title === d.title && cur.message === d.message && sev === cur.severity) continue;
    const patch: Record<string, unknown> = { title: d.title.slice(0, 200), message: d.message.slice(0, 1000), metadata: d.metadata ?? {} };
    if (sev !== cur.severity) {
      patch.severity = sev;
      patch.escalate_at = escalateAt(sev, new Date(cur.created_at), opts.dayEnd)?.toISOString() ?? null;
    }
    const { error } = await db.from('situations').update(patch).eq('id', cur.id);
    if (!error) updated++;
  }
  return { created, updated };
}

/**
 * Sends the principal the items that passed their escalation time unacknowledged.
 * Escalation itself is derived from escalate_at (the feed shows it without this
 * running); this only stamps escalated_at once and sends the alert.
 */
export async function escalate(db: SupabaseClient, schoolId: string, now = new Date()): Promise<number> {
  const { data, error } = await db.from('situations').select('id, title, message, severity, student_name, class_name, audience')
    .eq('school_id', schoolId).is('acknowledged_at', null).is('escalated_at', null).lte('escalate_at', now.toISOString()).limit(100);
  if (error || !data?.length) return 0;
  const ids = data.map(r => r.id);
  // Stamp first so a concurrent run can't alert twice.
  const { data: stamped } = await db.from('situations').update({ escalated_at: now.toISOString() })
    .in('id', ids).is('escalated_at', null).select('id');
  const won = new Set((stamped || []).map(r => r.id));
  const principals = await principalsOf(db, schoolId);
  // A safety disclosure escalates within the safeguarding circle, never wider.
  const safeguarding = data.some(r => r.audience === 'safeguarding') ? await safeguardingOf(db, schoolId) : [];
  for (const r of data) {
    if (!won.has(r.id)) continue;
    await alertStaff(db, schoolId, r.audience === 'safeguarding' ? safeguarding : principals, {
      title: `Escalated: ${r.title}`, body: `${r.message} Not acknowledged in time.`, critical: true, situationId: r.id,
    });
  }
  return won.size;
}
