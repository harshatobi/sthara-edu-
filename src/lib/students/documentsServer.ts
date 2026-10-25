import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { pageAll } from '@/lib/ops/page';
import {
  canManageKind, canSeeKind, checkChecklist, checkMeta, checklistFor, checklistOf, cleanFileName, DOC_MAX_BYTES, docLabel, inlineType,
  type DocStatus,
} from './documents';

/**
 * Documents on the student record, server side (brief 04). The caller has been authorised; it passes the school and
 * what the viewer may do. Files go straight from the browser to the private bucket through a one-time upload link
 * (the 4.5 MB request cap never applies); the server then checks the file arrived before the record is written.
 * Every open is a short-lived link, and recorded.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export const DOC_BUCKET = 'student-docs';
/** What the viewer may do: see/manage register documents (students.*), medical ones (health.*). */
export interface DocCan { students: boolean; health: boolean; manageStudents: boolean; manageHealth: boolean }
export interface Actor { id: string; schoolId: string; role: 'admin' | 'parent' }

const DCOLS = 'id, student_id, kind, title, document_no, issued_on, valid_until, file_name, size_bytes, status, source, uploaded_by, verified_by, verified_at, reject_note, created_at';
export interface DocRow {
  id: string; student_id: string; kind: string; title: string; document_no: string | null; issued_on: string | null; valid_until: string | null;
  file_name: string; size_bytes: number | null; status: DocStatus; source: 'office' | 'parent' | 'import'; uploaded_by: string | null;
  verified_by: string | null; verified_at: string | null; reject_note: string | null; created_at: string;
}

const seeing = (c: DocCan) => ({ students: c.students, health: c.health });
const managing = (c: DocCan) => ({ students: c.manageStudents, health: c.manageHealth });

async function audit(db: Db, a: Actor, action: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: a.id, actor_role: a.role, action, table_name: 'student_documents', row_id: rowId, school_id: a.schoolId, new_values: values });
  if (error) console.warn('[documents audit]', error.message);
}

async function studentOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('students').select('id, status, admitted_grade, user_id').eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data;
}

/** The grade the checklist goes by: the class admitted to, else the current class. */
async function gradeOf(db: Db, st: { id: string; admitted_grade: number | null }) {
  if (st.admitted_grade != null) return st.admitted_grade;
  const { data } = await db.from('enrolments').select('grade').eq('student_id', st.id).is('ends_on', null).order('starts_on', { ascending: false }).limit(1).maybeSingle();
  return (data?.grade as number | null | undefined) ?? null;
}

async function names(db: Db, ids: (string | null)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await db.from('users').select('id, name').in('id', want).limit(want.length);
  return new Map((data || []).map(u => [u.id as string, (u.name as string) || 'Someone']));
}

/** One student's documents the viewer may see, the checklist for their grade, and whether some were left out. */
export async function listDocs(db: Db, schoolId: string, studentId: string, can: DocCan) {
  const st = await studentOf(db, schoolId, studentId);
  if (!st) return null;
  const [docs, settings, grade] = await Promise.all([
    db.from('student_documents').select(DCOLS).eq('student_id', studentId).eq('school_id', schoolId).order('created_at', { ascending: false }).limit(200),
    db.from('schools').select('settings').eq('id', schoolId).maybeSingle(),
    gradeOf(db, st),
  ]);
  if (docs.error) throw new Error(docs.error.message);
  const all = (docs.data || []) as DocRow[];
  const shown = all.filter(d => canSeeKind(d.kind, seeing(can)));
  const who = await names(db, shown.flatMap(d => [d.uploaded_by, d.verified_by]));
  return {
    grade,
    docs: shown.map(d => ({ ...d, uploadedBy: d.uploaded_by ? who.get(d.uploaded_by) ?? null : null, verifiedBy: d.verified_by ? who.get(d.verified_by) ?? null : null,
      canManage: canManageKind(d.kind, managing(can)) })),
    // Medical kinds stay off the checklist for someone who can't see them, so it never says "missing" for what is there.
    checklist: checklistFor(checklistOf(settings.data?.settings), grade, all, isoDay()).filter(c => canSeeKind(c.kind, seeing(can))),
    hidden: all.length - shown.length,
    active: st.status !== 'cancelled',
  };
}

/** Where the browser uploads one file; the record is written by finishUpload once the file is there. */
export async function uploadUrl(db: Db, a: Actor, studentId: string, b: { kind?: unknown; fileName?: unknown; fileBytes?: unknown }, mayManage: (kind: string) => boolean): Promise<Result<{ url: string; path: string }>> {
  const st = await studentOf(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  if (st.status === 'cancelled') return fail('This entry is cancelled.', 409);
  if (typeof b.kind !== 'string' || !mayManage(b.kind)) return fail('Pick a kind of document you can add.', 403);
  if (!cleanFileName(b.fileName)) return fail('Choose a file.');
  const bytes = Number(b.fileBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return fail('That file is empty.');
  if (bytes > DOC_MAX_BYTES) return fail('Files can be up to 25 MB. Scan at a lower resolution or split it.');
  const path = `${a.schoolId}/${studentId}/${randomUUID()}`;
  const up = await db.storage.from(DOC_BUCKET).createSignedUploadUrl(path);
  if (up.error || !up.data) return fail('Could not prepare the upload.', 500);
  return { ok: true, url: up.data.signedUrl, path };
}

/** The file is in storage: check it, then put it on the record. A parent's upload waits for the registrar's check. */
export async function finishUpload(db: Db, a: Actor, studentId: string, b: Record<string, unknown>, mayManage: (kind: string) => boolean, source: 'office' | 'parent'): Promise<Result<{ id: string }>> {
  const st = await studentOf(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  const m = checkMeta(b, isoDay());
  if ('error' in m) return fail(m.error);
  if (!mayManage(m.value.kind)) return fail('You can’t add this kind of document.', 403);
  const fileName = cleanFileName(b.fileName);
  if (!fileName) return fail('Choose a file.');
  const path = typeof b.path === 'string' ? b.path : '';
  const folder = `${a.schoolId}/${studentId}`;
  const key = path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : '';
  if (!/^[0-9a-f-]{36}$/.test(key)) return fail('That upload isn’t for this student.', 400);
  const { data: found } = await db.storage.from(DOC_BUCKET).list(folder, { search: key, limit: 2 });
  const obj = found?.find(f => f.name === key);
  if (!obj) return fail('The file hasn’t arrived yet. Try the upload again.', 409);
  const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  if (size > DOC_MAX_BYTES) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    return fail('Files can be up to 25 MB. Scan at a lower resolution or split it.');
  }
  const verified = source === 'office' && b.verified === true;
  const { data, error } = await db.from('student_documents').insert({
    school_id: a.schoolId, student_id: studentId, ...m.value, storage_path: path, file_name: fileName, size_bytes: size || null,
    status: verified ? 'verified' : 'awaiting', source, uploaded_by: a.id, verified_by: verified ? a.id : null, verified_at: verified ? new Date().toISOString() : null,
  }).select('id').single();
  if (error || !data) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    return fail(error?.code === '23505' ? 'That file is already on the record.' : 'Could not save the document.', error?.code === '23505' ? 409 : 500);
  }
  return { ok: true, id: data.id };
}

async function docOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('student_documents').select(`${DCOLS}, storage_path, inline_type`).eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data as (DocRow & { storage_path: string; inline_type: string | null }) | null;
}

/**
 * A two-minute link to the file, recorded. PDFs and images (by their first bytes, looked at once and remembered)
 * open in the browser; everything else downloads.
 */
export async function openDoc(db: Db, a: Actor, id: string, maySee: (d: DocRow) => boolean): Promise<Result<{ url: string; inline: boolean }>> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !maySee(d)) return fail('Document not found.', 404);
  let type = d.inline_type;
  if (!type) {
    const peek = await db.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 60);
    if (peek.data?.signedUrl) {
      const res = await fetch(peek.data.signedUrl, { headers: { Range: 'bytes=0-15' } }).catch(() => null);
      const head = res?.ok ? new Uint8Array(await res.arrayBuffer()).subarray(0, 16) : null;
      if (head) {
        type = inlineType(head) ?? 'none';
        await db.from('student_documents').update({ inline_type: type }).eq('id', d.id);
      }
    }
  }
  const inline = !!type && type !== 'none';
  const signed = await db.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 120, inline ? undefined : { download: d.file_name });
  if (signed.error || !signed.data?.signedUrl) return fail('Could not open the document.', 500);
  await audit(db, a, 'document.viewed', d.id, { kind: d.kind, student: d.student_id });
  return { ok: true, url: signed.data.signedUrl, inline };
}

/** The registrar's check against the original: verified, or rejected with a note the parent sees. */
export async function decideDoc(db: Db, a: Actor, id: string, verify: boolean, note: string, mayManage: (kind: string) => boolean): Promise<Result> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !mayManage(d.kind)) return fail('Document not found.', 404);
  if (!verify && note.trim().length < 3) return fail('Say what is wrong, so the parent knows what to send.');
  const { error } = await db.from('student_documents').update(verify
    ? { status: 'verified', verified_by: a.id, verified_at: new Date().toISOString(), reject_note: null }
    : { status: 'rejected', reject_note: note.trim().slice(0, 300), verified_by: null, verified_at: null }).eq('id', d.id);
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** Deletes the record and its file (an upload made by mistake, or an approved erasure). */
async function erase(db: Db, a: Actor, d: DocRow & { storage_path: string }, action: string, reason: string): Promise<Result> {
  const { error } = await db.from('student_documents').delete().eq('id', d.id);
  if (error) return fail('Could not remove the document.', 500);
  const rm = await db.storage.from(DOC_BUCKET).remove([d.storage_path]);
  if (rm.error) console.error('[documents] file not removed:', d.storage_path, rm.error.message);
  await audit(db, a, action, d.id, { kind: d.kind, student: d.student_id, file: d.file_name, reason });
  return { ok: true };
}

export async function removeDoc(db: Db, a: Actor, id: string, reason: string, mayManage: (kind: string) => boolean): Promise<Result> {
  const d = await docOf(db, a.schoolId, id);
  if (!d || !mayManage(d.kind)) return fail('Document not found.', 404);
  if (reason.trim().length < 3) return fail('Say why it is being removed.');
  return erase(db, a, d, 'document.removed', reason.trim().slice(0, 300));
}

/** The registrar's queue: documents parents (or an import) sent that nobody has checked yet. */
export async function awaitingDocs(db: Db, schoolId: string, can: DocCan) {
  const { data, error } = await pageAll<any>((f, t) => db.from('student_documents')
    .select('id, student_id, kind, title, file_name, source, created_at, students!inner(full_name, admission_no)')
    .eq('school_id', schoolId).eq('status', 'awaiting').order('created_at').order('id').range(f, t), 5_000);
  if (error) throw new Error(error.message);
  return data.filter(d => canSeeKind(d.kind, seeing(can))).map(d => ({
    id: d.id as string, studentId: d.student_id as string, student: d.students.full_name as string, admissionNo: d.students.admission_no as string,
    kind: d.kind as string, label: docLabel(d.kind), title: d.title as string, fileName: d.file_name as string, source: d.source as string, createdAt: d.created_at as string,
    canManage: canManageKind(d.kind, managing(can)),
  }));
}

/** An approved erasure request: the document and its file are deleted, and the deletion is logged. */
export async function eraseForRequest(db: Db, a: Actor, studentId: string, docId: string | null, why: string): Promise<Result> {
  const d = docId ? await docOf(db, a.schoolId, docId) : null;
  if (!d || d.student_id !== studentId) return { ok: true }; // already gone: nothing left to erase
  return erase(db, a, d, 'document.erased', why);
}

// ── The checklist setting ───────────────────────────────────────────────────

export async function saveChecklist(db: Db, a: Actor, list: unknown): Promise<Result> {
  const c = checkChecklist(list);
  if ('error' in c) return fail(c.error);
  const { data } = await db.from('schools').select('settings').eq('id', a.schoolId).maybeSingle();
  const s = (data?.settings as Record<string, any>) || {};
  const { error } = await db.from('schools').update({ settings: { ...s, documents: { ...(s.documents || {}), checklist: c.value } } }).eq('id', a.schoolId);
  if (error) return fail('Could not save.', 500);
  await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action: 'documents.checklist_changed', table_name: 'schools', row_id: a.schoolId, school_id: a.schoolId, new_values: { checklist: c.value } });
  return { ok: true };
}

// ── Parents ─────────────────────────────────────────────────────────────────

/** A verified parent's child on the register, or null. */
export async function parentChild(db: Db, parentId: string, studentUserId: string) {
  const { data: g } = await db.from('guardians').select('id').eq('parent_id', parentId).eq('student_id', studentUserId).eq('verified', true).maybeSingle();
  if (!g) return null;
  const { data: st } = await db.from('students').select('id, school_id, status').eq('user_id', studentUserId).maybeSingle();
  return st as { id: string; school_id: string; status: string } | null;
}

/** What a parent sees: every document on their child's record, the checklist, and their erasure requests. */
export async function parentDocs(db: Db, parentId: string, studentUserId: string) {
  const st = await parentChild(db, parentId, studentUserId);
  if (!st) return null;
  const all = { students: true, health: true, manageStudents: false, manageHealth: false };
  const view = await listDocs(db, st.school_id, st.id, all);
  if (!view) return null;
  const { data: reqs } = await db.from('student_change_requests').select('id, target_id, status, decision_note, created_at')
    .eq('student_id', st.id).eq('requested_by', parentId).eq('kind', 'document_erasure').order('created_at', { ascending: false }).limit(20);
  return {
    checklist: view.checklist, active: view.active,
    docs: view.docs.map(d => ({ id: d.id, kind: d.kind, title: d.title, file_name: d.file_name, issued_on: d.issued_on, valid_until: d.valid_until,
      status: d.status, reject_note: d.reject_note, source: d.source, mine: d.uploaded_by === parentId, created_at: d.created_at })),
    erasures: reqs ?? [],
  };
}

/** A parent asks the school to erase one document (DPDP); the registrar or DPO decides. */
export async function requestErasure(db: Db, parentId: string, studentUserId: string, docId: unknown, note: unknown): Promise<Result<{ id: string }>> {
  const st = await parentChild(db, parentId, studentUserId);
  if (!st) return fail('Only a verified parent can ask for this.', 403);
  if (typeof docId !== 'string' || !/^[0-9a-f-]{36}$/i.test(docId)) return fail('Pick a document.');
  const { data: d } = await db.from('student_documents').select('id').eq('id', docId).eq('student_id', st.id).maybeSingle();
  if (!d) return fail('That document isn’t on your child’s record.', 404);
  const { count } = await db.from('student_change_requests').select('id', { count: 'exact', head: true })
    .eq('student_id', st.id).eq('kind', 'document_erasure').eq('target_id', d.id).eq('status', 'pending');
  if (count) return fail('You have already asked for this one. The school will decide.', 409);
  const { data, error } = await db.from('student_change_requests').insert({
    school_id: st.school_id, student_id: st.id, requested_by: parentId, kind: 'document_erasure', target_id: d.id, proposed: {},
    note: typeof note === 'string' ? note.trim().slice(0, 300) || null : null,
  }).select('id').single();
  return error || !data ? fail('Could not send the request.', 500) : { ok: true, id: data.id };
}
