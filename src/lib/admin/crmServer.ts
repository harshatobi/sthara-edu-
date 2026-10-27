import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activeGrants, Access, type Perm } from '@/lib/admin/rbac';
import { indiaDay, nextSession, sessionOf } from '@/lib/admin/format';
import { toE164 } from '@/lib/whatsapp/config';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { GRADES } from '@/lib/students/register';
import { phoneKey } from './application';
import { checkContact, duplicatesOf, OPT_OUT_LINE, type DupMatch } from './crm';
import type { ApplySchool } from './familyServer';

/**
 * Working enquiries (admissions phase 3), server side: who can own an applicant, the contact log, follow-ups, the
 * family's WhatsApp opt-out, sending the stage messages the database queued (admission_messages), enquiries from
 * the apply page, and STOP / START from a family's phone.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }

async function applicant(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('admission_applicants').select('id, name, stage, owner_id, whatsapp_opt_out, guardian_phone, family_phone')
    .eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data;
}

// ── Counsellors ─────────────────────────────────────────────────────────────

/** Office accounts that can work applicants (admissions.manage): who an applicant can be given to. */
export async function counsellors(db: Db, schoolId: string): Promise<{ id: string; name: string }[]> {
  const [{ data: users }, { data: grants }] = await Promise.all([
    // bounded: one school's office accounts
    db.from('users').select('id, name').eq('school_id', schoolId).eq('role', 'admin').limit(500),
    db.from('role_grants').select('*').eq('school_id', schoolId).is('revoked_at', null).limit(2000),
  ]);
  const active = activeGrants(grants || [], indiaDay());
  const can = (id: string, p: Perm) => new Access(active.filter(g => g.userId === id).map(g => g.role)).can(p);
  return (users || []).filter(u => can(u.id, 'admissions.manage')).map(u => ({ id: u.id, name: u.name || 'Office' })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── The record: contacts and messages ───────────────────────────────────────

export async function crmRecord(db: Db, schoolId: string, applicantId: string) {
  const [{ data: contacts }, { data: messages }] = await Promise.all([
    db.from('admission_contacts').select('id, kind, direction, outcome, note, follow_up_on, auto, actor_id, at').eq('applicant_id', applicantId).eq('school_id', schoolId)
      .order('at', { ascending: false }).limit(200),
    db.from('admission_messages').select('id, stage, body, status, error, created_at, sent_at').eq('applicant_id', applicantId).eq('school_id', schoolId)
      .order('created_at', { ascending: false }).limit(50),
  ]);
  const ids = [...new Set((contacts || []).map(c => c.actor_id).filter(Boolean))] as string[];
  const { data: who } = ids.length ? await db.from('users').select('id, name').in('id', ids).limit(ids.length) : { data: [] as { id: string; name: string }[] };
  const names = new Map((who || []).map(u => [u.id, u.name || 'Office']));
  return {
    contacts: (contacts || []).map(c => ({ ...c, by: c.auto ? 'Sthara' : c.actor_id ? names.get(c.actor_id) ?? 'Office' : 'The family' })),
    messages: messages || [],
  };
}

/** Logs a call, visit or note; a follow-up date given with it becomes the applicant's next follow-up. */
export async function logContact(db: Db, a: Actor, applicantId: string, raw: unknown): Promise<Result> {
  const ap = await applicant(db, a.schoolId, applicantId);
  if (!ap) return fail('Applicant not found.', 404);
  const c = checkContact(raw, indiaDay());
  if ('error' in c) return fail(c.error);
  const { error } = await db.from('admission_contacts').insert({ ...c.value, school_id: a.schoolId, applicant_id: applicantId, actor_id: a.id });
  if (error) return fail('Could not save.', 500);
  // A follow-up given with it is the next one; reaching the family without giving one means the follow-up is done.
  // A note to colleagues leaves the date alone.
  if (c.value.follow_up_on || c.value.kind !== 'note') await db.from('admission_applicants').update({ follow_up_on: c.value.follow_up_on }).eq('id', applicantId);
  return { ok: true };
}

export async function setFollowUp(db: Db, a: Actor, applicantId: string, on: unknown): Promise<Result> {
  const date = typeof on === 'string' && on ? on : null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < indiaDay())) return fail('Pick today or a later day.');
  const { data, error } = await db.from('admission_applicants').update({ follow_up_on: date }).eq('id', applicantId).eq('school_id', a.schoolId).select('id');
  if (error) return fail('Could not save.', 500);
  return data?.length ? { ok: true } : fail('Applicant not found.', 404);
}

/** Gives the applicant to a counsellor (or to nobody), who is told. */
export async function assign(db: Db, a: Actor, applicantId: string, ownerId: unknown): Promise<Result> {
  const ap = await applicant(db, a.schoolId, applicantId);
  if (!ap) return fail('Applicant not found.', 404);
  const to = typeof ownerId === 'string' && ownerId ? ownerId : null;
  if (to && !(await counsellors(db, a.schoolId)).some(c => c.id === to)) return fail('Pick someone in the office who works admissions.');
  const { error } = await db.from('admission_applicants').update({ owner_id: to }).eq('id', applicantId);
  if (error) return fail('Could not save.', 500);
  if (to && to !== a.id) {
    await db.from('notifications').insert({ school_id: a.schoolId, user_id: to, type: 'admissions', title: `${ap.name} is yours to follow up`,
      body: 'An admissions enquiry was given to you. Open it to call the family and set the next follow-up.', metadata: { applicantId } });
  }
  await db.from('admission_contacts').insert({ school_id: a.schoolId, applicant_id: applicantId, kind: 'note', note: to ? 'Counsellor changed' : 'Counsellor removed', actor_id: a.id, auto: true });
  return { ok: true };
}

export async function setOptOut(db: Db, a: Actor, applicantId: string, out: boolean): Promise<Result> {
  const { data, error } = await db.from('admission_applicants').update({ whatsapp_opt_out: out }).eq('id', applicantId).eq('school_id', a.schoolId).select('id');
  if (error) return fail('Could not save.', 500);
  if (!data?.length) return fail('Applicant not found.', 404);
  if (out) await db.from('admission_messages').update({ status: 'skipped', error: 'Family opted out' }).eq('applicant_id', applicantId).eq('status', 'queued');
  await db.from('admission_contacts').insert({ school_id: a.schoolId, applicant_id: applicantId, kind: 'note', actor_id: a.id, auto: true,
    note: out ? 'WhatsApp messages stopped at the family’s request' : 'WhatsApp messages on again' });
  return { ok: true };
}

// ── Sending the stage messages ──────────────────────────────────────────────

/**
 * Sends what the database queued (oldest first, at most `limit`), for one school or all. Each row is claimed before
 * it is sent, so two callers never send the same message. A family that has since opted out is skipped.
 */
export async function flushOutbox(db: Db, schoolId: string | null, limit = 25) {
  let q = db.from('admission_messages').select('id, school_id, applicant_id, stage, phone_e164, body').eq('status', 'queued').order('created_at').limit(limit);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data: rows } = await q;
  let sent = 0;
  for (const m of rows || []) {
    const { data: claimed } = await db.from('admission_messages').update({ status: 'sending' }).eq('id', m.id).eq('status', 'queued').select('id');
    if (!claimed?.length) continue;
    const { data: ap } = await db.from('admission_applicants').select('whatsapp_opt_out').eq('id', m.applicant_id).maybeSingle();
    if (!ap || ap.whatsapp_opt_out) { await db.from('admission_messages').update({ status: 'skipped', error: 'Family opted out' }).eq('id', m.id); continue; }
    const r = await sendWhatsApp(db, { to: m.phone_e164, schoolId: m.school_id, kind: 'notify', body: `${m.body}\n\n${OPT_OUT_LINE}`, meta: { admissionApplicant: m.applicant_id, stage: m.stage } });
    const status = r.status === 'ignored' ? 'skipped' : r.status === 'failed' ? 'failed' : r.status;
    await db.from('admission_messages').update({ status, error: r.error ?? null, sent_at: new Date().toISOString() }).eq('id', m.id);
    if (status === 'sent' || status === 'simulated') {
      sent++;
      await db.from('admission_contacts').insert({ school_id: m.school_id, applicant_id: m.applicant_id, kind: 'whatsapp', direction: 'out', auto: true,
        note: `Stage message${status === 'simulated' ? ' (simulated: WhatsApp not connected)' : ''}: ${m.body.slice(0, 900)}` });
    }
  }
  return sent;
}

/**
 * Runs the outbox once the response has gone (next/server after(), which keeps the function alive for it); errors
 * are logged, never shown to the office. Outside a request (scripts), it runs straight away.
 */
export function flushSoon(db: Db, schoolId: string | null) {
  const run = () => flushOutbox(db, schoolId).then(() => undefined, e => console.error('[admissions outbox]', e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}

// ── Duplicates ──────────────────────────────────────────────────────────────

/** Applicants already in this admission year who are likely the same child. */
export async function findDuplicates(db: Db, schoolId: string, session: string, x: { name: string; dob: string | null; phone: string | null; email: string | null }): Promise<(DupMatch & { name: string; stage: string })[]> {
  const { data } = await db.from('admission_applicants').select('id, name, date_of_birth, guardian_phone, guardian_email, stage')
    .eq('school_id', schoolId).eq('session', session).ilike('name', x.name.trim().replace(/[%_]/g, '').split(/\s+/)[0] + '%').limit(200);
  const list = (data || []).map(r => ({ id: r.id, name: r.name, dob: r.date_of_birth, guardianPhone: r.guardian_phone, guardianEmail: r.guardian_email, stage: r.stage }));
  const found = duplicatesOf({ id: '', name: x.name, dob: x.dob, guardianPhone: x.phone, guardianEmail: x.email }, list);
  return found.map(m => { const r = list.find(l => l.id === m.id)!; return { ...m, name: r.name, stage: r.stage }; });
}

// ── Enquiries from the apply page ───────────────────────────────────────────

/**
 * Someone asks about admission without signing in. A likely duplicate of an open applicant adds to that record
 * instead of making a new one (the answer is the same, so the form reveals nothing about who has applied).
 */
export async function enquire(db: Db, school: ApplySchool, b: Record<string, unknown>): Promise<Result> {
  if (!school.enquiries) return fail('The school isn’t taking enquiries online at the moment. Contact the school office.', 409);
  // A field people never see: a filled one is a bot. Answer as if it worked.
  if (typeof b.website === 'string' && b.website.trim()) return { ok: true };
  if (b.consent !== true) return fail('Tick the box so the school can contact you about admission.');
  const parent = typeof b.parentName === 'string' ? b.parentName.trim().replace(/\s+/g, ' ') : '';
  const child = typeof b.childName === 'string' ? b.childName.trim().replace(/\s+/g, ' ') : '';
  if (!parent || parent.length > 120) return fail('Enter your name.');
  if (!child || child.length > 120) return fail('Enter your child’s name.');
  const phone = toE164(b.phone);
  if (!phone) return fail('Enter a valid mobile number, e.g. 98765 43210.');
  const grade = Number(b.grade);
  if (!GRADES.includes(grade)) return fail('Pick the class.');
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : '';
  const source = b.source === 'qr' ? 'qr' : 'website';
  const session = nextSession(sessionOf());

  const dups = await findDuplicates(db, school.id, session, { name: child, dob: null, phone, email: null });
  const open = dups.find(d => !['rejected', 'withdrawn'].includes(d.stage));
  if (open) {
    await db.from('admission_contacts').insert({ school_id: school.id, applicant_id: open.id, kind: 'note', direction: 'in', auto: true,
      note: `Enquired again on the ${source === 'qr' ? 'QR poster' : 'apply page'}${message ? `: ${message}` : ''}` });
    await db.from('admission_applicants').update({ follow_up_on: indiaDay() }).eq('id', open.id);
    return { ok: true };
  }
  await db.rpc('admission_ensure_stages', { p_school: school.id });
  const { data: first } = await db.from('admission_stages').select('key').eq('school_id', school.id).is('system', null).eq('active', true).order('position').limit(1).maybeSingle();
  if (!first) return fail('The school isn’t taking enquiries online at the moment. Contact the school office.', 409);
  const now = new Date().toISOString();
  const { data, error } = await db.from('admission_applicants').insert({
    school_id: school.id, session, name: child, grade, stage: first.key, furthest_stage: first.key, source, channel: 'online',
    guardian_name: parent, guardian_phone: phone, notes: message || null, submitted_at: now, follow_up_on: indiaDay(),
  }).select('id').single();
  if (error || !data) { console.error('[enquiry]', error?.message); return fail('Could not send. Try again.', 500); }
  await db.from('admission_events').insert({ applicant_id: data.id, school_id: school.id, from_stage: null, to_stage: first.key, actor_id: null,
    note: `Enquiry from the ${source === 'qr' ? 'QR poster' : 'apply page'}` });
  flushSoon(db, school.id);
  return { ok: true };
}

// ── STOP and START from a family ────────────────────────────────────────────

/**
 * A WhatsApp message from a number on open applications (and no Sthara account): STOP or START turns their stage
 * messages off or on. Returns how many applications it changed, or null when the number has none.
 */
/** Applications this phone belongs to (the verified phone of an online one, or the guardian's on any). */
async function applicationsOfPhone(db: Db, phone: string, openOnly: boolean) {
  const k = phoneKey(phone);
  const variants = [...new Set([phone, ...(k ? [k, `0${k}`, `+91${k}`, `91${k}`] : [])])];
  const base = () => {
    // bounded: each caller adds .limit(50)
    const x = db.from('admission_applicants').select('id, school_id');
    return openOnly ? x.not('stage', 'in', '(rejected,withdrawn)').is('student_id', null) : x;
  };
  const [byFamily, byGuardian] = await Promise.all([
    base().eq('family_phone', phone).limit(50),
    base().in('guardian_phone', variants).limit(50),
  ]);
  const rows = [...(byFamily.data || []), ...(byGuardian.data || [])] as { id: string; school_id: string }[];
  return rows.filter((r, i) => rows.findIndex(x => x.id === r.id) === i);
}

/** Any other message from a family about an open application: kept on the application for the office. */
export async function logApplicantMessage(db: Db, phone: string, text: string): Promise<boolean> {
  const rows = await applicationsOfPhone(db, phone, true);
  if (!rows.length) return false;
  await db.from('admission_contacts').insert(rows.map(r => ({ school_id: r.school_id, applicant_id: r.id, kind: 'whatsapp', direction: 'in', auto: true,
    note: text.slice(0, 1000) || '(a message with no text)' })));
  await db.from('admission_applicants').update({ follow_up_on: indiaDay() }).in('id', rows.map(r => r.id)).is('follow_up_on', null);
  return true;
}

export async function familyOpt(db: Db, phone: string, cmd: 'stop' | 'start'): Promise<number | null> {
  const rows = await applicationsOfPhone(db, phone, false);
  if (!rows.length) return null;
  const ids = [...new Set(rows.map(r => r.id))];
  await db.from('admission_applicants').update({ whatsapp_opt_out: cmd === 'stop' }).in('id', ids);
  if (cmd === 'stop') await db.from('admission_messages').update({ status: 'skipped', error: 'Family opted out' }).in('applicant_id', ids).eq('status', 'queued');
  await db.from('admission_contacts').insert(rows.map(r => ({
    school_id: r.school_id, applicant_id: r.id, kind: 'whatsapp', direction: 'in', auto: true,
    note: cmd === 'stop' ? 'The family replied STOP: no more WhatsApp messages about this application' : 'The family replied START: WhatsApp messages on again',
  })));
  return ids.length;
}
