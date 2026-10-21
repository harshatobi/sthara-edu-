import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { normClass } from '@/lib/ops/people';
import { alertOf, checkCare, checkEvent, checkUdise, type HealthCard } from './health';
import { currentSession } from './register';

/**
 * The health record on the server (brief 03). The caller has checked the permission (health.read / health.manage,
 * or students.read for the UDISE+ part) and passes the school. The database refuses the consented part without
 * consent; these functions say so in plain words first.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

const UDISE = 'blood_group, height_cm, weight_kg, measured_on, cwsn, impairments, disability_certificate, disability_percent, screening';
const CARE = 'allergies, conditions, medication';
const NO_CONSENT = 'This needs the parent’s health consent, which they give on the parent portal (WhatsApp & Privacy).';

async function onRegister(db: Db, schoolId: string, studentId: string) {
  const { data } = await db.from('students').select('id, status, user_id, full_name').eq('id', studentId).eq('school_id', schoolId).maybeSingle();
  return data;
}

export async function consented(db: Db, schoolId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await db.rpc('health_consented', { p_school: schoolId, p_students: ids.slice(i, i + 500) });
    if (error) throw new Error(error.message);
    for (const id of (data as string[]) || []) out.add(id);
  }
  return out;
}

/** The record for one student: the UDISE+ part for anyone allowed here, the rest (and the timeline) for health.read. */
export async function getHealth(db: Db, a: Actor, studentId: string, full: boolean) {
  const st = await onRegister(db, a.schoolId, studentId);
  if (!st) return null;
  const [card, consent] = await Promise.all([
    db.from('student_health').select(`id, ${UDISE}${full ? `, ${CARE}, keep_after_leaving, legal_hold, erased_at, erased_reason` : ''}, updated_at`).eq('student_id', studentId).maybeSingle(),
    consented(db, a.schoolId, [studentId]),
  ]);
  const events = full ? (await db.from('health_events').select('id, kind, on_date, data, note, created_at').eq('student_id', studentId).order('on_date', { ascending: false }).limit(200)).data ?? [] : [];
  if (full) await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action: 'health.viewed', table_name: 'student_health', row_id: studentId, school_id: a.schoolId, new_values: {} });
  return { card: card.data ?? null, consent: consent.has(studentId), events, full, hasLogin: !!st.user_id };
}

/** Saves the UDISE+ part (and, with consent, the consented part) of the card. */
export async function saveCard(db: Db, a: Actor, studentId: string, input: Record<string, unknown>): Promise<Result> {
  const st = await onRegister(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  if (st.status === 'cancelled') return fail('This entry is cancelled.', 409);
  const u = checkUdise(input);
  if ('error' in u) return fail(u.error);
  const c = checkCare(input);
  if ('error' in c) return fail(c.error);
  const care = c.value;
  if (Object.values(care).some(v => Array.isArray(v) && v.length) && !(await consented(db, a.schoolId, [studentId])).has(studentId)) return fail(NO_CONSENT, 409);
  const patch = { ...u.value, ...care, updated_by: a.id };
  const { data: had } = await db.from('student_health').select('id').eq('student_id', studentId).maybeSingle();
  const { error } = had
    ? await db.from('student_health').update(patch).eq('id', had.id)
    : await db.from('student_health').insert({ ...patch, student_id: studentId, school_id: a.schoolId });
  if (error) return fail(error.code === '42501' ? NO_CONSENT : 'Could not save the health record.', error.code === '42501' ? 409 : 500);
  return { ok: true };
}

export async function addEvent(db: Db, a: Actor, studentId: string, input: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const st = await onRegister(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  const e = checkEvent(input);
  if ('error' in e) return fail(e.error);
  if (!(await consented(db, a.schoolId, [studentId])).has(studentId)) return fail(NO_CONSENT, 409);
  const { data, error } = await db.from('health_events').insert({ ...e.value, school_id: a.schoolId, student_id: studentId, recorded_by: a.id }).select('id').single();
  return error || !data ? fail(error?.code === '42501' ? NO_CONSENT : 'Could not save.', error?.code === '42501' ? 409 : 500) : { ok: true, id: data.id };
}

export async function removeEvent(db: Db, a: Actor, studentId: string, eventId: string): Promise<Result> {
  const { error, count } = await db.from('health_events').delete({ count: 'exact' }).eq('id', eventId).eq('student_id', studentId).eq('school_id', a.schoolId);
  return error ? fail('Could not remove.', 500) : count ? { ok: true } : fail('Entry not found.', 404);
}

/** Keep after leaving (the parent asked) and legal hold: both stop the retention erasure. */
export async function setFlags(db: Db, a: Actor, studentId: string, flags: { keep?: unknown; hold?: unknown }): Promise<Result> {
  const patch: Record<string, boolean> = {};
  if (typeof flags.keep === 'boolean') patch.keep_after_leaving = flags.keep;
  if (typeof flags.hold === 'boolean') patch.legal_hold = flags.hold;
  if (!Object.keys(patch).length) return fail('Nothing to change.');
  const { data: had } = await db.from('student_health').select('id').eq('student_id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!had) return fail('There is no health card for this student yet.', 404);
  const { error } = await db.from('student_health').update(patch).eq('id', had.id);
  return error ? fail('Could not save.', 500) : { ok: true };
}

export async function healthSettings(db: Db, schoolId: string) {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  const d = Number((data?.settings as any)?.health?.retentionDays);
  return { retentionDays: Number.isInteger(d) && d >= 0 && d <= 3650 ? d : 365 };
}
export async function saveRetention(db: Db, a: Actor, days: unknown): Promise<Result> {
  const d = Number(days);
  if (!Number.isInteger(d) || d < 30 || d > 3650) return fail('Keep it between 30 days and 10 years.');
  const { data } = await db.from('schools').select('settings').eq('id', a.schoolId).maybeSingle();
  const s = (data?.settings as Record<string, any>) || {};
  const { error } = await db.from('schools').update({ settings: { ...s, health: { ...(s.health || {}), retentionDays: d } } }).eq('id', a.schoolId);
  if (error) return fail('Could not save.', 500);
  await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action: 'health.retention_changed', table_name: 'schools', row_id: a.schoolId, school_id: a.schoolId, new_values: { retentionDays: d } });
  return { ok: true };
}

/** The health officer's view of the school: who has alerts, special needs, consent, and what is missing. */
export async function healthBoard(db: Db, schoolId: string, settings: unknown) {
  const session = currentSession(settings);
  const [st, cards, en] = await Promise.all([
    pageAll<any>((f, t) => db.from('students').select('id, full_name, admission_no, user_id').eq('school_id', schoolId).eq('status', 'active').order('id').range(f, t), 100_000),
    pageAll<any>((f, t) => db.from('student_health').select(`student_id, ${UDISE}, ${CARE}`).eq('school_id', schoolId).order('id').range(f, t), 100_000),
    pageAll<any>((f, t) => db.from('enrolments').select('student_id, class_name, starts_on').eq('school_id', schoolId).eq('session', session).order('id').range(f, t), 200_000),
  ]);
  if (st.error || cards.error || en.error) throw new Error((st.error || cards.error || en.error)!.message);
  const consent = await consented(db, schoolId, st.data.map(s => s.id));
  const card = new Map(cards.data.map(c => [c.student_id, c]));
  const cls = new Map<string, any>();
  for (const e of en.data) { const p = cls.get(e.student_id); if (!p || e.starts_on > p.starts_on) cls.set(e.student_id, e); }
  const rows = st.data.map(s => {
    const c = card.get(s.id);
    return {
      id: s.id, name: s.full_name, admissionNo: s.admission_no, className: cls.get(s.id)?.class_name ?? null, consent: consent.has(s.id), hasLogin: !!s.user_id,
      bloodGroup: c?.blood_group ?? null, cwsn: !!c?.cwsn, alert: c ? alertOf(c) : null, medicines: c ? (c.medication as unknown[]).length : 0,
    };
  }).sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '', 'en', { numeric: true }) || a.name.localeCompare(b.name));
  return {
    session, rows,
    counts: { students: rows.length, consent: rows.filter(r => r.consent).length, alerts: rows.filter(r => r.alert).length, cwsn: rows.filter(r => r.cwsn).length,
      noBloodGroup: rows.filter(r => !r.bloodGroup).length, schoolGives: cards.data.filter(c => (c.medication as { schoolGives?: boolean }[]).some(m => m.schoolGives)).length },
  };
}

/** Alerts for one class, for its teachers: student login id and the alert line. Nothing else of the record. */
export async function classAlerts(db: Db, schoolId: string, cls: string) {
  const { data: school } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  const session = currentSession(school?.settings);
  const { data: en } = await pageAll<any>((f, t) => db.from('enrolments').select('student_id, class_name').eq('school_id', schoolId).eq('session', session).is('ends_on', null).order('id').range(f, t), 200_000);
  const ids = [...new Set(en.filter(e => normClass(e.class_name ?? '') === normClass(cls)).map(e => e.student_id))];
  if (!ids.length) return [];
  const [cards, st] = await Promise.all([
    byIds<any>(ids, (chunk, f, t) => db.from('student_health').select('student_id, allergies, conditions').in('student_id', chunk).order('student_id').range(f, t)),
    byIds<any>(ids, (chunk, f, t) => db.from('students').select('id, user_id').in('id', chunk).order('id').range(f, t)),
  ]);
  const login = new Map(st.data.map(s => [s.id, s.user_id]));
  return cards.data.map(c => ({ studentId: login.get(c.student_id) as string | null, alert: alertOf(c) })).filter(x => x.studentId && x.alert) as { studentId: string; alert: string }[];
}

/** A parent sees their child's card (UDISE+ part always, the rest with consent) and whether consent is given. */
export async function parentHealth(db: Db, parentId: string, studentUserId: string) {
  const { data: g } = await db.from('guardians').select('id').eq('parent_id', parentId).eq('student_id', studentUserId).eq('verified', true).maybeSingle();
  if (!g) return null;
  const { data: st } = await db.from('students').select('id, school_id').eq('user_id', studentUserId).maybeSingle();
  if (!st) return null;
  const consent = (await consented(db, st.school_id, [st.id])).has(st.id);
  const { data: card } = await db.from('student_health').select(`${UDISE}${consent ? `, ${CARE}` : ''}`).eq('student_id', st.id).maybeSingle();
  const events = consent ? (await db.from('health_events').select('kind, on_date, data').eq('student_id', st.id).order('on_date', { ascending: false }).limit(50)).data ?? [] : [];
  const { data: reqs } = await db.from('student_change_requests').select('id, status, decision_note, created_at').eq('student_id', st.id).eq('requested_by', parentId).eq('kind', 'health').order('created_at', { ascending: false }).limit(10);
  return { consent, card: (card as Partial<HealthCard> | null) ?? null, events, requests: reqs ?? [] };
}
