import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { DOC_BUCKET } from '@/lib/students/documentsServer';
import {
  checklistOf, isMedical, checkMeta, cleanFileName, DOC_MAX_BYTES, docLabel, inlineType, type DocStatus,
} from '@/lib/students/documents';
import {
  ageRulesOf, assembleChecks, completeness, familyContacts, formOf, gateError, phoneKey, type Checks, type Match,
} from './application';

/**
 * The admission application, server side: the applicant with their form, documents and checks; documents with the
 * application (same private bucket as the student record, under <school>/applicants/<applicant>/); the gate a stage
 * puts on leaving it; and the move of documents to the student record at admission. The caller has authorised the
 * office user; `can` says what they may see (medical kinds need health.read, as on the record).
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export interface Actor { id: string; schoolId: string }
export interface AppCan { see: boolean; manage: boolean; health: boolean; manageHealth: boolean }
// Medical kinds (disability certificate, medical certificate, vaccination record) are the health roles' alone on an
// application, to see and to handle: the admissions office never holds them.
const maySee = (kind: string, c: AppCan) => (isMedical(kind) ? c.health : c.see);
const mayManage = (kind: string, c: AppCan) => (isMedical(kind) ? c.manageHealth : c.manage);

const DCOLS = 'id, applicant_id, kind, title, document_no, issued_on, valid_until, file_name, size_bytes, status, source, uploaded_by, verified_by, verified_at, reject_note, moved_to, moved_at, created_at';
export interface AppDoc {
  id: string; applicant_id: string; kind: string; title: string; document_no: string | null; issued_on: string | null; valid_until: string | null;
  file_name: string; size_bytes: number | null; status: DocStatus; source: 'office' | 'family'; uploaded_by: string | null;
  verified_by: string | null; verified_at: string | null; reject_note: string | null; moved_to: string | null; moved_at: string | null; created_at: string;
}

async function audit(db: Db, a: Actor, action: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action, table_name: 'admission_documents', row_id: rowId, school_id: a.schoolId, new_values: values });
  if (error) console.warn('[application audit]', error.message);
}

async function applicantOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('admission_applicants')
    .select('id, school_id, session, name, grade, stage, date_of_birth, guardian_name, guardian_phone, guardian_email, previous_school, parent_id, student_id, form, applied_on, channel')
    .eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data as null | {
    id: string; school_id: string; session: string; name: string; grade: number; stage: string; date_of_birth: string | null; guardian_name: string | null;
    guardian_phone: string | null; guardian_email: string | null; previous_school: string | null; parent_id: string | null; student_id: string | null;
    form: unknown; applied_on: string | null; channel: string;
  };
}

async function names(db: Db, ids: (string | null)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await db.from('users').select('id, name').in('id', want).limit(want.length);
  return new Map((data || []).map(u => [u.id as string, (u.name as string) || 'Someone']));
}

/**
 * Children already at the school from the same family (a phone or email in common with a family member on their
 * record, or the applying parent's own children), and staff the family's phones belong to.
 */
async function matches(db: Db, schoolId: string, a: NonNullable<Awaited<ReturnType<typeof applicantOf>>>) {
  const { phones, emails } = familyContacts(formOf(a.form), { phone: a.guardian_phone, email: a.guardian_email });
  const studentIds = new Map<string, string>();
  if (phones.length || emails.length) {
    const [byPhone, byEmail] = await Promise.all([
      phones.length ? db.from('family_members').select('student_id, relation').eq('school_id', schoolId).in('phone', phones).limit(50) : Promise.resolve({ data: [] as any[] }),
      emails.length ? db.from('family_members').select('student_id, relation').eq('school_id', schoolId).in('email', emails).limit(50) : Promise.resolve({ data: [] as any[] }),
    ]);
    for (const r of [...(byPhone.data || []), ...(byEmail.data || [])]) studentIds.set(r.student_id, 'Same family contact');
  }
  if (a.parent_id) {
    const { data: kids } = await db.from('guardians').select('student_id').eq('parent_id', a.parent_id).limit(20);
    const userIds = (kids || []).map(k => k.student_id as string);
    if (userIds.length) {
      const { data: st } = await db.from('students').select('id').eq('school_id', schoolId).in('user_id', userIds).limit(20);
      for (const s of st || []) studentIds.set(s.id, 'Applied from their parent account');
    }
  }
  let siblings: Match[] = [];
  if (studentIds.size) {
    const { data: st } = await db.from('students').select('id, full_name, status, admission_no').eq('school_id', schoolId).eq('status', 'active')
      .in('id', [...studentIds.keys()]).limit(20);
    const ids = (st || []).map(s => s.id as string);
    const { data: cls } = ids.length
      ? await db.from('enrolments').select('student_id, class_name').in('student_id', ids).is('ends_on', null).limit(40)
      : { data: [] as any[] };
    const classOf = new Map((cls || []).map(c => [c.student_id as string, c.class_name as string]));
    siblings = (st || []).map(s => ({ id: s.id, name: s.full_name, detail: [classOf.get(s.id), `adm. ${s.admission_no}`, studentIds.get(s.id)].filter(Boolean).join(' · ') }));
  }
  let staff: Match[] = [];
  if (phones.length) {
    const { data } = await db.from('staff_members').select('id, name, designation, phone_e164').eq('school_id', schoolId).eq('active', true)
      .in('phone_e164', phones.map(p => `+91${p}`)).limit(10);
    staff = (data || []).filter(s => phoneKey(s.phone_e164)).map(s => ({ id: s.id, name: s.name, detail: s.designation || 'Staff' }));
  }
  return { siblings, staff };
}

async function rulesOf(db: Db, schoolId: string) {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  return { checklist: checklistOf(data?.settings), age: ageRulesOf(data?.settings) };
}

async function checksFor(db: Db, a: NonNullable<Awaited<ReturnType<typeof applicantOf>>>, docs: AppDoc[]): Promise<Checks> {
  const [{ checklist, age }, m] = await Promise.all([rulesOf(db, a.school_id), matches(db, a.school_id, a)]);
  return assembleChecks({ grade: a.grade, session: a.session, dob: a.date_of_birth }, age, checklist,
    docs.filter(d => !d.moved_to).map(d => ({ kind: d.kind, status: d.status, valid_until: d.valid_until })), isoDay(), m.siblings, m.staff);
}

async function docsOf(db: Db, schoolId: string, applicantId: string) {
  const { data, error } = await db.from('admission_documents').select(DCOLS).eq('applicant_id', applicantId).eq('school_id', schoolId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as AppDoc[];
}

/** One application for the office: the form, the documents they may see, the checks and how complete it is. */
export async function loadApplication(db: Db, schoolId: string, id: string, can: AppCan) {
  const a = await applicantOf(db, schoolId, id);
  if (!a) return null;
  const all = await docsOf(db, schoolId, id);
  const checks = await checksFor(db, a, all);
  const shown = all.filter(d => maySee(d.kind, can));
  const who = await names(db, shown.flatMap(d => [d.uploaded_by, d.verified_by]));
  const form = formOf(a.form);
  return {
    form, appliedOn: a.applied_on, channel: a.channel,
    completeness: completeness(form, a.date_of_birth),
    docs: shown.map(d => ({ ...d, label: docLabel(d.kind), uploadedBy: d.uploaded_by ? who.get(d.uploaded_by) ?? null : (d.source === 'family' ? 'The family' : null),
      verifiedBy: d.verified_by ? who.get(d.verified_by) ?? null : null, canManage: mayManage(d.kind, can) && !d.moved_to })),
    // Medical kinds stay off the checklist for someone who can't see them.
    checks: { ...checks, documents: checks.documents.filter(c => maySee(c.kind, can)) },
    hidden: all.length - shown.length,
  };
}

/** Why the applicant can't leave this stage yet (its required checks), or null. */
export async function stageGate(db: Db, schoolId: string, applicantId: string, stageKey: string): Promise<string | null> {
  const { data: st } = await db.from('admission_stages').select('label, requires').eq('school_id', schoolId).eq('key', stageKey).maybeSingle();
  const requires = (st?.requires as string[] | null) ?? [];
  if (!requires.length) return null;
  const a = await applicantOf(db, schoolId, applicantId);
  if (!a) return null;
  const checks = await checksFor(db, a, await docsOf(db, schoolId, applicantId));
  return gateError(requires, checks, st!.label as string);
}

// ── Documents with the application ──────────────────────────────────────────

const folderOf = (schoolId: string, applicantId: string) => `${schoolId}/applicants/${applicantId}`;

export async function uploadUrl(db: Db, a: Actor, applicantId: string, b: { kind?: unknown; fileName?: unknown; fileBytes?: unknown }, can: AppCan): Promise<Result<{ url: string; path: string }>> {
  const ap = await applicantOf(db, a.schoolId, applicantId);
  if (!ap) return fail('Applicant not found.', 404);
  if (ap.student_id) return fail('This applicant is admitted: add documents on the student record.', 409);
  if (typeof b.kind !== 'string' || !mayManage(b.kind, can)) return fail('Pick a kind of document you can add.', 403);
  if (!cleanFileName(b.fileName)) return fail('Choose a file.');
  const bytes = Number(b.fileBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return fail('That file is empty.');
  if (bytes > DOC_MAX_BYTES) return fail('Files can be up to 25 MB. Scan at a lower resolution or split it.');
  const path = `${folderOf(a.schoolId, applicantId)}/${randomUUID()}`;
  const up = await db.storage.from(DOC_BUCKET).createSignedUploadUrl(path);
  if (up.error || !up.data) return fail('Could not prepare the upload.', 500);
  return { ok: true, url: up.data.signedUrl, path };
}

/** The file is in storage: check it, then put it on the application (verified straight away if the office says so). */
export async function finishUpload(db: Db, a: Actor, applicantId: string, b: Record<string, unknown>, can: AppCan): Promise<Result<{ id: string }>> {
  const ap = await applicantOf(db, a.schoolId, applicantId);
  if (!ap) return fail('Applicant not found.', 404);
  const m = checkMeta(b, isoDay());
  if ('error' in m) return fail(m.error);
  if (!mayManage(m.value.kind, can)) return fail('You can’t add this kind of document.', 403);
  const fileName = cleanFileName(b.fileName);
  if (!fileName) return fail('Choose a file.');
  const path = typeof b.path === 'string' ? b.path : '';
  const folder = folderOf(a.schoolId, applicantId);
  const key = path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : '';
  if (!/^[0-9a-f-]{36}$/.test(key)) return fail('That upload isn’t for this applicant.', 400);
  const { data: found } = await db.storage.from(DOC_BUCKET).list(folder, { search: key, limit: 2 });
  const obj = found?.find(f => f.name === key);
  if (!obj) return fail('The file hasn’t arrived yet. Try the upload again.', 409);
  const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  if (size > DOC_MAX_BYTES) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    return fail('Files can be up to 25 MB. Scan at a lower resolution or split it.');
  }
  const verified = b.verified === true;
  const { data, error } = await db.from('admission_documents').insert({
    school_id: a.schoolId, applicant_id: applicantId, ...m.value, storage_path: path, file_name: fileName, size_bytes: size || null,
    status: verified ? 'verified' : 'awaiting', source: 'office', uploaded_by: a.id,
    verified_by: verified ? a.id : null, verified_at: verified ? new Date().toISOString() : null,
  }).select('id').single();
  if (error || !data) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    return fail(error?.code === '23505' ? 'That file is already on the application.' : 'Could not save the document.', error?.code === '23505' ? 409 : 500);
  }
  await audit(db, a, 'admission_document.added', data.id, { kind: m.value.kind, applicant: applicantId, verified });
  return { ok: true, id: data.id };
}

async function docOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('admission_documents').select(`${DCOLS}, storage_path, inline_type`).eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data as (AppDoc & { storage_path: string; inline_type: string | null }) | null;
}

/** A two-minute link to the file, recorded; PDFs and images open in the browser, anything else downloads. */
export async function openDoc(db: Db, a: Actor, id: string, can: AppCan): Promise<Result<{ url: string; inline: boolean }>> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !maySee(d.kind, can)) return fail('Document not found.', 404);
  if (d.moved_to) return fail('This document moved to the student record when they were admitted. Open it there.', 409);
  let type = d.inline_type;
  if (!type) {
    const peek = await db.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 60);
    if (peek.data?.signedUrl) {
      const res = await fetch(peek.data.signedUrl, { headers: { Range: 'bytes=0-15' } }).catch(() => null);
      const head = res?.ok ? new Uint8Array(await res.arrayBuffer()).subarray(0, 16) : null;
      if (head) {
        type = inlineType(head) ?? 'none';
        await db.from('admission_documents').update({ inline_type: type }).eq('id', d.id);
      }
    }
  }
  const inline = !!type && type !== 'none';
  const signed = await db.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 120, inline ? undefined : { download: d.file_name });
  if (signed.error || !signed.data?.signedUrl) return fail('Could not open the document.', 500);
  await audit(db, a, 'admission_document.viewed', d.id, { kind: d.kind, applicant: d.applicant_id });
  return { ok: true, url: signed.data.signedUrl, inline };
}

/** Checked against the original: verified, or rejected with a note saying what to send instead. */
export async function decideDoc(db: Db, a: Actor, id: string, verify: boolean, note: string, can: AppCan): Promise<Result> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !mayManage(d.kind, can)) return fail('Document not found.', 404);
  if (d.moved_to) return fail('This document moved to the student record. Check it there.', 409);
  if (!verify && note.trim().length < 3) return fail('Say what is wrong, so the family knows what to send.');
  const { error } = await db.from('admission_documents').update(verify
    ? { status: 'verified', verified_by: a.id, verified_at: new Date().toISOString(), reject_note: null }
    : { status: 'rejected', reject_note: note.trim().slice(0, 300), verified_by: null, verified_at: null }).eq('id', d.id);
  if (error) return fail('Could not save.', 500);
  await audit(db, a, verify ? 'admission_document.verified' : 'admission_document.rejected', d.id, { kind: d.kind, applicant: d.applicant_id });
  return { ok: true };
}

/** An upload made by mistake: the record and its file go. */
export async function removeDoc(db: Db, a: Actor, id: string, reason: string, can: AppCan): Promise<Result> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !mayManage(d.kind, can)) return fail('Document not found.', 404);
  if (d.moved_to) return fail('This document moved to the student record. Remove it there.', 409);
  if (reason.trim().length < 3) return fail('Say why it is being removed.');
  const { error } = await db.from('admission_documents').delete().eq('id', d.id);
  if (error) return fail('Could not remove the document.', 500);
  const rm = await db.storage.from(DOC_BUCKET).remove([d.storage_path]);
  if (rm.error) console.error('[application] file not removed:', d.storage_path, rm.error.message);
  await audit(db, a, 'admission_document.removed', d.id, { kind: d.kind, applicant: d.applicant_id, file: d.file_name, reason: reason.trim().slice(0, 300) });
  return { ok: true };
}

// ── At admission onto the register ──────────────────────────────────────────

/**
 * Moves the application's documents (all but rejected ones) to the student record, keeping who uploaded and who
 * verified them and when; unverified ones arrive awaiting the registrar. Each file moves within the bucket, so
 * nothing is copied or lost; a file that fails to move stays with the application and is reported.
 */
export async function moveDocsToStudent(db: Db, actorId: string, schoolId: string, applicantId: string, studentId: string) {
  const { data, error } = await db.from('admission_documents').select(`${DCOLS}, storage_path, inline_type`)
    .eq('applicant_id', applicantId).eq('school_id', schoolId).is('moved_to', null).neq('status', 'rejected').limit(100);
  if (error) return { moved: 0, failed: 0 };
  let moved = 0, failed = 0;
  for (const d of (data || []) as (AppDoc & { storage_path: string; inline_type: string | null })[]) {
    const to = `${schoolId}/${studentId}/${randomUUID()}`;
    const mv = await db.storage.from(DOC_BUCKET).move(d.storage_path, to);
    if (mv.error) { failed++; console.error('[application] move failed:', d.storage_path, mv.error.message); continue; }
    const { data: row, error: ins } = await db.from('student_documents').insert({
      school_id: schoolId, student_id: studentId, kind: d.kind, title: d.title, document_no: d.document_no, issued_on: d.issued_on, valid_until: d.valid_until,
      storage_path: to, file_name: d.file_name, size_bytes: d.size_bytes, inline_type: d.inline_type, status: d.status, source: 'admission',
      uploaded_by: d.uploaded_by, verified_by: d.verified_by, verified_at: d.verified_at,
    }).select('id').single();
    if (ins || !row) {
      // Put the file back so the application still has it.
      await db.storage.from(DOC_BUCKET).move(to, d.storage_path);
      failed++; console.error('[application] record not written:', ins?.message);
      continue;
    }
    await db.from('admission_documents').update({ moved_to: row.id, moved_at: new Date().toISOString(), storage_path: to }).eq('id', d.id);
    moved++;
  }
  if (moved) {
    await db.from('audit_log').insert({ actor_id: actorId, actor_role: 'admin', action: 'admission_documents.moved', table_name: 'students', row_id: studentId,
      school_id: schoolId, new_values: { applicant: applicantId, moved, failed } });
  }
  return { moved, failed };
}
