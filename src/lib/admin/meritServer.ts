import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { GRADES } from '@/lib/students/register';
import { familyContacts, formOf, phoneKey } from './application';
import { assessmentOf, checkScore, meritList, meritOf, openSlots, slotWhen, type AssessmentRules } from './merit';

/**
 * The admission assessment and merit (admissions phase 4a), server side: slots, bookings (by the office or the
 * family), attendance and the score, and the merit list of a class with the sibling and staff-ward points.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
const STATUS: Record<string, number> = { P0002: 404, '22023': 400, SA409: 409 };
const rpcFail = (e: { code?: string; message?: string }, fallback: string) =>
  STATUS[e.code ?? ''] ? fail(e.message || fallback, STATUS[e.code!]) : (console.error('[assessment]', e.code, e.message), fail(fallback, 500));

export async function rulesOf(db: Db, schoolId: string): Promise<AssessmentRules> {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  return assessmentOf(data?.settings);
}

// ── Slots ───────────────────────────────────────────────────────────────────

export interface Slot { id: string; grade: number | null; starts_at: string; minutes: number; place: string | null; capacity: number; note: string | null; cancelled_at: string | null; booked: number; when: string }

export async function slotsOf(db: Db, schoolId: string, session: string): Promise<Slot[]> {
  const { data: slots } = await db.from('admission_slots').select('id, grade, starts_at, minutes, place, capacity, note, cancelled_at')
    .eq('school_id', schoolId).eq('session', session).order('starts_at').limit(500);
  const ids = (slots || []).map(s => s.id);
  const { data: bookings } = ids.length
    ? await db.from('admission_bookings').select('slot_id').in('slot_id', ids).eq('status', 'booked').limit(10000)
    : { data: [] as { slot_id: string }[] };
  const n = new Map<string, number>();
  for (const b of bookings || []) n.set(b.slot_id, (n.get(b.slot_id) ?? 0) + 1);
  return (slots || []).map(s => ({ ...s, booked: n.get(s.id) ?? 0, when: slotWhen(s) }));
}

export async function addSlot(db: Db, a: { id: string; schoolId: string }, session: string, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const startsAt = typeof b.startsAt === 'string' ? new Date(b.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return fail('Pick the day and time.');
  if (startsAt.getTime() < Date.now()) return fail('Pick a time that is still ahead.');
  const minutes = Number(b.minutes ?? 60), capacity = Number(b.capacity);
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 480) return fail('A slot lasts 10 to 480 minutes.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail('Up to 500 children in a slot.');
  const grade = b.grade === '' || b.grade == null ? null : Number(b.grade);
  if (grade !== null && !GRADES.includes(grade)) return fail('Pick the class, or every class.');
  const place = typeof b.place === 'string' ? b.place.trim().slice(0, 120) || null : null;
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  const { data, error } = await db.from('admission_slots').insert({ school_id: a.schoolId, session, grade, starts_at: startsAt.toISOString(), minutes, capacity, place, note, created_by: a.id })
    .select('id').single();
  if (error || !data) return fail('Could not add the slot.', 500);
  return { ok: true, id: data.id };
}

/** Cancels a slot; those booked into it are unbooked, and each one's record says so (the office tells them). */
export async function cancelSlot(db: Db, a: { id: string; schoolId: string }, slotId: string): Promise<Result<{ unbooked: number }>> {
  const { data: s } = await db.from('admission_slots').update({ cancelled_at: new Date().toISOString() }).eq('id', slotId).eq('school_id', a.schoolId).is('cancelled_at', null).select('id, starts_at, minutes').maybeSingle();
  if (!s) return fail('That slot is already cancelled.', 409);
  const { data: gone } = await db.from('admission_bookings').update({ status: 'cancelled' }).eq('slot_id', slotId).eq('status', 'booked').select('applicant_id');
  if (gone?.length) {
    await db.from('admission_contacts').insert(gone.map(g => ({ school_id: a.schoolId, applicant_id: g.applicant_id, kind: 'note', auto: true, actor_id: a.id,
      note: `Assessment slot ${slotWhen(s)} cancelled: book another and tell the family` })));
    await db.from('admission_applicants').update({ follow_up_on: isoDay(), assessment_on: null }).in('id', gone.map(g => g.applicant_id));
  }
  return { ok: true, unbooked: gone?.length ?? 0 };
}

// ── Bookings ────────────────────────────────────────────────────────────────

/** Books the applicant (actorId null: the family). The slot's rules and its last place are guarded in the database. */
export async function book(db: Db, schoolId: string, slotId: unknown, applicantId: string, actorId: string | null): Promise<Result<{ id: string }>> {
  if (typeof slotId !== 'string' || !/^[0-9a-f-]{36}$/.test(slotId)) return fail('Pick a slot.');
  const { data, error } = await db.rpc('admission_book', { p_school: schoolId, p_slot: slotId, p_applicant: applicantId, p_actor: actorId });
  if (error) return rpcFail(error, 'Could not book the slot.');
  const { data: s } = await db.from('admission_slots').select('starts_at, minutes, place').eq('id', slotId).maybeSingle();
  await db.from('admission_contacts').insert({ school_id: schoolId, applicant_id: applicantId, kind: 'note', auto: !actorId, actor_id: actorId, direction: actorId ? null : 'in',
    note: `${actorId ? 'Booked for' : 'The family booked'} the assessment: ${s ? slotWhen(s) : ''}${s?.place ? `, ${s.place}` : ''}` });
  return { ok: true, id: data as string };
}

export async function cancelBooking(db: Db, schoolId: string, applicantId: string, actorId: string | null): Promise<Result> {
  const { data } = await db.from('admission_bookings').update({ status: 'cancelled' }).eq('applicant_id', applicantId).eq('school_id', schoolId).eq('status', 'booked').select('id');
  if (!data?.length) return fail('There is no booking to cancel.', 404);
  await db.from('admission_applicants').update({ assessment_on: null }).eq('id', applicantId);
  await db.from('admission_contacts').insert({ school_id: schoolId, applicant_id: applicantId, kind: 'note', auto: !actorId, actor_id: actorId,
    note: actorId ? 'Assessment booking cancelled' : 'The family cancelled their assessment booking' });
  return { ok: true };
}

/** Attended with a score, or did not come. The applicant carries the latest score. */
export async function recordResult(db: Db, a: { id: string; schoolId: string }, b: Record<string, unknown>): Promise<Result> {
  if (typeof b.bookingId !== 'string') return fail('Pick the booking.');
  const { data: bk } = await db.from('admission_bookings').select('id, applicant_id, status').eq('id', b.bookingId).eq('school_id', a.schoolId).maybeSingle();
  if (!bk) return fail('Booking not found.', 404);
  if (bk.status === 'cancelled') return fail('That booking was cancelled.', 409);
  if (b.status === 'no_show') {
    await db.from('admission_bookings').update({ status: 'no_show', score: null, scored_by: a.id, scored_at: new Date().toISOString() }).eq('id', bk.id);
    await db.from('admission_contacts').insert({ school_id: a.schoolId, applicant_id: bk.applicant_id, kind: 'note', actor_id: a.id, auto: true, note: 'Did not come to the assessment' });
    await db.from('admission_applicants').update({ follow_up_on: isoDay() }).eq('id', bk.applicant_id);
    return { ok: true };
  }
  const rules = await rulesOf(db, a.schoolId);
  const s = checkScore(b.score, rules.maxScore);
  if ('error' in s) return fail(s.error);
  if (s.value == null) return fail('Enter the score.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) || null : null;
  const { error } = await db.from('admission_bookings').update({ status: 'attended', score: s.value, note, scored_by: a.id, scored_at: new Date().toISOString() }).eq('id', bk.id);
  if (error) return fail('Could not save the score.', 500);
  await db.from('admission_applicants').update({ assessment_score: s.value }).eq('id', bk.applicant_id);
  return { ok: true };
}

/** The applicant's bookings (latest first) and the slots open to them. */
export async function assessmentFor(db: Db, schoolId: string, applicantId: string) {
  const { data: ap } = await db.from('admission_applicants').select('id, grade, session, assessment_score').eq('id', applicantId).eq('school_id', schoolId).maybeSingle();
  if (!ap) return null;
  const [slots, { data: bookings }, rules] = await Promise.all([
    slotsOf(db, schoolId, ap.session),
    db.from('admission_bookings').select('id, slot_id, status, score, note, booked_by, booked_at, scored_at').eq('applicant_id', applicantId).order('booked_at', { ascending: false }).limit(20),
    rulesOf(db, schoolId),
  ]);
  const byId = new Map(slots.map(s => [s.id, s]));
  return {
    score: ap.assessment_score == null ? null : Number(ap.assessment_score), maxScore: rules.maxScore,
    bookings: (bookings || []).map(b => ({ ...b, score: b.score == null ? null : Number(b.score), slot: byId.get(b.slot_id) ?? null, byFamily: !b.booked_by })),
    open: openSlots(slots, ap.grade),
  };
}

// ── Merit ───────────────────────────────────────────────────────────────────

/**
 * Which of these applicants have a sibling at the school (a family phone or email on a current student's family
 * record, or the applying parent's children) or a parent on the staff (a family phone on the staff register),
 * worked out for the lot in a few queries.
 */
export async function priorities(db: Db, schoolId: string, rows: { id: string; form: unknown; guardian_phone: string | null; guardian_email: string | null; parent_id: string | null }[]) {
  const contacts = new Map(rows.map(r => [r.id, familyContacts(formOf(r.form), { phone: r.guardian_phone, email: r.guardian_email })]));
  const phones = [...new Set([...contacts.values()].flatMap(c => c.phones))];
  const emails = [...new Set([...contacts.values()].flatMap(c => c.emails))];
  const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const famPhones = new Set<string>(), famEmails = new Set<string>(), staffPhones = new Set<string>();
  for (const c of chunks(phones)) {
    const [{ data: fm }, { data: st }] = await Promise.all([
      db.from('family_members').select('phone, students!inner(status)').eq('school_id', schoolId).eq('students.status', 'active').in('phone', c).limit(2000),
      db.from('staff_members').select('phone_e164').eq('school_id', schoolId).eq('active', true).in('phone_e164', c.map(p => `+91${p}`)).limit(2000),
    ]);
    for (const r of fm || []) { const k = phoneKey(r.phone); if (k) famPhones.add(k); }
    for (const r of st || []) { const k = phoneKey(r.phone_e164); if (k) staffPhones.add(k); }
  }
  for (const c of chunks(emails)) {
    const { data: fm } = await db.from('family_members').select('email, students!inner(status)').eq('school_id', schoolId).eq('students.status', 'active').in('email', c).limit(2000);
    for (const r of fm || []) if (r.email) famEmails.add(String(r.email).toLowerCase());
  }
  const parents = [...new Set(rows.map(r => r.parent_id).filter(Boolean))] as string[];
  const parentsWithKids = new Set<string>();
  if (parents.length) {
    const { data } = await db.from('guardians').select('parent_id').in('parent_id', parents).eq('verified', true).limit(2000);
    for (const g of data || []) parentsWithKids.add(g.parent_id);
  }
  return new Map(rows.map(r => {
    const c = contacts.get(r.id)!;
    return [r.id, {
      sibling: c.phones.some(p => famPhones.has(p)) || c.emails.some(e => famEmails.has(e)) || (!!r.parent_id && parentsWithKids.has(r.parent_id)),
      staff: c.phones.some(p => staffPhones.has(p)),
    }];
  }));
}

const MCOLS = 'id, name, grade, stage, student_id, assessment_score, applied_on, created_at, form, guardian_phone, guardian_email, parent_id, channel, submitted_at';

/** The merit list of a class: open applicants (not yet at Offer), and where each stands. */
export async function meritFor(db: Db, schoolId: string, session: string, grade: number) {
  const [{ data }, rules] = await Promise.all([
    db.from('admission_applicants').select(MCOLS).eq('school_id', schoolId).eq('session', session).eq('grade', grade)
      .not('stage', 'in', '(rejected,withdrawn)').is('student_id', null).or('submitted_at.not.is.null,channel.in.(office,import)').limit(2000),
    rulesOf(db, schoolId),
  ]);
  const rows = data || [];
  const pri = await priorities(db, schoolId, rows);
  const list = meritList(rows.map(r => ({
    id: r.id, name: r.name, score: r.assessment_score == null ? null : Number(r.assessment_score), ...pri.get(r.id)!,
    appliedOn: r.applied_on, createdAt: r.created_at,
  })), rules);
  const stage = new Map(rows.map(r => [r.id, r.stage as string]));
  return { rules, lines: list.map(l => ({ ...l, stage: stage.get(l.id)! })) };
}

/** One applicant's merit, for the offer proposed for them (the waitlist fills in merit order). */
export async function meritOfApplicant(db: Db, schoolId: string, applicantId: string): Promise<number | null> {
  const { data: r } = await db.from('admission_applicants').select(MCOLS).eq('id', applicantId).eq('school_id', schoolId).maybeSingle();
  if (!r || r.assessment_score == null) return null;
  const [pri, rules] = await Promise.all([priorities(db, schoolId, [r]), rulesOf(db, schoolId)]);
  return meritOf({ score: Number(r.assessment_score), ...pri.get(r.id)! }, rules);
}
