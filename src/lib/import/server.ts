import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pageAll, byIds } from '@/lib/ops/page';
import { normClass } from '@/lib/teacher/scope';
import { currentSession } from '@/lib/students/register';
import { piiReady, sealAadhaar } from '@/lib/students/pii';
import { admKey, datasetOf, fileKey, sheetKey, type Dataset, type Lookups, type Problem } from './datasets';
import { cleanFileName } from '@/lib/students/documents';
import { DOC_BUCKET } from '@/lib/students/documentsServer';
import { CHUNK, checkTable, chunks, payload, PROBLEM_CAP, receiptFloors } from './engine';
import { kindOf, readTable } from './parse';

/**
 * Bulk imports, server side. A job moves:
 *
 *   uploading -> checking -> rejected | checked -> committing -> committed -> undoing -> undone
 *                                                       \-> (a write fails) undoing -> failed
 *
 * The browser creates the job, uploads the file straight to the private 'imports' bucket (so the 4.5 MB request cap
 * never applies), and says it has arrived. From then on the worker does the work in steps of about 40 seconds: every
 * row is checked in code, then dry-run against the database chunk by chunk; nothing is written until the whole file
 * is clean and someone commits. A commit that fails partway rolls itself back. The job row is the audit record.
 *
 * The worker runs right after each request that starts work (after()), again whenever someone looking at a job
 * finds it waiting, and once a minute from pg_cron while any job waits.
 */

type Db = SupabaseClient;
export const BUCKET = 'imports';
export const UNDO_DAYS = 30;
const STEP_MS = 40_000;
const UNDO_BATCH = 5000;

export type Actor =
  | { kind: 'admin'; id: string; name: string; schoolId: string }
  | { kind: 'operator'; id: string; name: string; schoolId: string; grantId: string };

export interface Job {
  id: string; school_id: string; dataset: string; status: string; phase_cursor: number; file_path: string | null; file_name: string;
  file_kind: 'csv' | 'xlsx'; file_bytes: number | null; file_sha256: string | null; total_rows: number | null; added: number; updated: number;
  unchanged: number; kept: number; problem_count: number; problems: Problem[]; summary: Record<string, unknown>; by_user: string | null;
  by_kind: 'admin' | 'operator'; by_name: string; grant_id: string | null; attempts: number; last_error: string | null; created_at: string;
  checked_at: string | null; committed_at: string | null; committed_by: string | null; undone_at: string | null; undone_by: string | null; updated_at: string;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

const COLS = 'id, school_id, dataset, status, phase_cursor, file_path, file_name, file_kind, file_bytes, file_sha256, total_rows, added, updated, unchanged, kept, problem_count, problems, summary, by_user, by_kind, by_name, grant_id, attempts, last_error, created_at, checked_at, committed_at, committed_by, undone_at, undone_by, updated_at';
/** The history list leaves the problem list out; one job's page has it. */
const LIST_COLS = COLS.replace(' problems,', '');

const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-120) || 'file';

// ── Lookups ─────────────────────────────────────────────────────────────────

/** What a dataset's rows refer to, for one school only. Every read pages past the 1,000-row cap. */
export async function loadLookups(db: Db, schoolId: string, needs: Dataset['needs']): Promise<Lookups> {
  const look: Lookups = { students: new Map(), classes: new Map(), sheets: new Map(), ambiguous: new Set() };
  if (needs.includes('students')) {
    // The admission register (numbers are unique per school there); cancelled entries name nobody.
    const r = await pageAll<{ user_id: string | null; full_name: string; admission_no: string }>((from, to) =>
      db.from('students').select('user_id, full_name, admission_no').eq('school_id', schoolId).neq('status', 'cancelled').order('id').range(from, to), 200_000);
    if (r.error) throw new Error(r.error.message);
    for (const st of r.data) {
      const k = admKey(st.admission_no);
      if (look.students.has(k)) look.ambiguous!.add(k);
      look.students.set(k, { id: st.user_id, name: st.full_name });
    }
  }
  if (needs.includes('classes') || needs.includes('sheets')) {
    const r = await pageAll<{ id: string; name: string | null }>((from, to) => db.from('classes').select('id, name').eq('school_id', schoolId).order('id').range(from, to));
    if (r.error) throw new Error(r.error.message);
    for (const c of r.data) if (c.name) look.classes.set(normClass(c.name), c.name);
    if (needs.includes('sheets')) {
      const className = new Map(r.data.map(c => [c.id, c.name || '']));
      // This session's schemes only (the school's own session), so last year's "PT1" never catches this year's marks.
      const { data: school } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
      const { data: schemes, error } = await db.from('exam_schemes').select('id').eq('school_id', schoolId).eq('session', currentSession(school?.settings)).limit(200);
      if (error) throw new Error(error.message);
      const assessments = await byIds<{ id: string; code: string; name: string }>((schemes || []).map(x => x.id), (ids, from, to) =>
        db.from('exam_assessments').select('id, code, name').in('scheme_id', ids).order('id').range(from, to));
      if (assessments.error) throw new Error(assessments.error.message);
      const sheets = await byIds<{ id: string; assessment_id: string; class_subject_id: string; class_id: string; status: string; max_marks: number }>(
        assessments.data.map(a => a.id), (ids, from, to) =>
          db.from('exam_sheets').select('id, assessment_id, class_subject_id, class_id, status, max_marks').eq('school_id', schoolId).in('assessment_id', ids).order('id').range(from, to));
      if (sheets.error) throw new Error(sheets.error.message);
      const subjects = await byIds<{ id: string; subject_name: string }>([...new Set(sheets.data.map(x => x.class_subject_id))], (ids, from, to) =>
        db.from('class_subjects').select('id, subject_name').in('id', ids).order('id').range(from, to));
      if (subjects.error) throw new Error(subjects.error.message);
      const subjectName = new Map(subjects.data.map(x => [x.id, x.subject_name]));
      const assessment = new Map(assessments.data.map(a => [a.id, a]));
      for (const sh of sheets.data) {
        const a = assessment.get(sh.assessment_id), cls = className.get(sh.class_id), subj = subjectName.get(sh.class_subject_id);
        if (!a || !cls || !subj) continue;
        const v = { id: sh.id, max: Number(sh.max_marks), status: sh.status };
        look.sheets.set(sheetKey(a.code, cls, subj), v);
        look.sheets.set(sheetKey(a.name, cls, subj), v);
      }
    }
  }
  return look;
}

// ── Files that come with a manifest (documents) ─────────────────────────────
// They go straight into the private documents bucket, in the job's own folder, named by a hash of the file name (so
// the manifest's name finds it) plus a readable part. What no row uses is removed: after the check (files nobody
// listed), and after a commit or undo (copies the record already had, rows undone).

const MAX_FILES = 5000;
const docFolder = (job: Pick<Job, 'id' | 'school_id'>) => `${job.school_id}/import/${job.id}`;
const objectKey = (name: string) => `${createHash('sha256').update(fileKey(name)).digest('hex').slice(0, 16)}-${safeName(cleanFileName(name) ?? 'file')}`;

async function listFolder(db: Db, folder: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(DOC_BUCKET).list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(error.message);
    for (const f of data || []) if (f.id) out.set(f.name, Number((f.metadata as { size?: number } | null)?.size ?? 0));
    if (!data || data.length < 1000) return out;
  }
}

/** Removes the job's files that `keep` doesn't want; returns the names removed. */
async function sweepFiles(db: Db, job: Pick<Job, 'id' | 'school_id' | 'dataset'>, keep: (path: string) => boolean = () => false): Promise<string[]> {
  if (!datasetOf(job.dataset)?.files) return [];
  const folder = docFolder(job);
  const gone = [...(await listFolder(db, folder)).keys()].filter(k => !keep(`${folder}/${k}`));
  for (let i = 0; i < gone.length; i += 500) {
    const { error } = await db.storage.from(DOC_BUCKET).remove(gone.slice(i, i + 500).map(k => `${folder}/${k}`));
    if (error) console.warn('[import files]', error.message);
  }
  return gone;
}

/** Files the job's rows still point at, after a commit or an undo. */
async function referenced(db: Db, job: Pick<Job, 'id' | 'school_id'>): Promise<Set<string>> {
  const r = await pageAll<{ storage_path: string }>((from, to) => db.from('student_documents').select('storage_path').eq('school_id', job.school_id)
    .like('storage_path', `${docFolder(job)}/%`).order('id').range(from, to), MAX_FILES * 2);
  if (r.error) throw new Error(r.error.message);
  return new Set(r.data.map(x => x.storage_path));
}

/** One-time upload links for files that come with the manifest, up to 200 per call. */
export async function fileUrls(db: Db, job: Job, names: unknown): Promise<Result<{ files: { name: string; url: string }[] }>> {
  if (!datasetOf(job.dataset)?.files) return fail('This import takes one file.');
  if (job.status !== 'uploading') return fail('Files can only be added before the check starts.', 409);
  if (!Array.isArray(names) || !names.length || names.length > 200) return fail('Send between 1 and 200 file names at a time.');
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of names) {
    const name = cleanFileName(raw);
    if (!name) return fail('A file has no name.');
    if (seen.has(fileKey(name))) return fail(`Two files are called "${name}". Rename one.`);
    seen.add(fileKey(name));
    clean.push(name);
  }
  const files: { name: string; url: string }[] = [];
  for (let i = 0; i < clean.length; i += 20) {
    const part = await Promise.all(clean.slice(i, i + 20).map(async name => {
      const up = await db.storage.from(DOC_BUCKET).createSignedUploadUrl(`${docFolder(job)}/${objectKey(name)}`, { upsert: true });
      return up.error || !up.data ? null : { name, url: up.data.signedUrl };
    }));
    if (part.some(x => !x)) return fail('Could not prepare the uploads. Try again.', 500);
    files.push(...(part as { name: string; url: string }[]));
  }
  return { ok: true, files };
}

// ── Reading jobs ────────────────────────────────────────────────────────────

export async function listJobs(db: Db, schoolId: string, limit = 100): Promise<Omit<Job, 'problems'>[]> {
  const { data, error } = await db.from('import_jobs').select(LIST_COLS).eq('school_id', schoolId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as Omit<Job, 'problems'>[];
}

/** One job of this school (never another school's: the school is part of the lookup). */
export async function getJob(db: Db, schoolId: string, id: string): Promise<Job | null> {
  const { data } = await db.from('import_jobs').select(COLS).eq('id', id).eq('school_id', schoolId).maybeSingle();
  return (data as Job | null) ?? null;
}

/** Whether an import can still be undone, and if not, why. */
export async function undoBlock(db: Db, job: Pick<Job, 'id' | 'school_id' | 'dataset' | 'status' | 'committed_at'>): Promise<string | null> {
  if (job.status !== 'committed' || !job.committed_at) return 'Only a committed import can be undone.';
  if (Date.now() - Date.parse(job.committed_at) > UNDO_DAYS * 86_400_000) return `Imports can be undone for ${UNDO_DAYS} days. Correct the records instead.`;
  const { data: later } = await db.from('import_jobs').select('id, file_name').eq('school_id', job.school_id).eq('dataset', job.dataset)
    .in('status', ['committed', 'undoing']).gt('committed_at', job.committed_at).neq('id', job.id).limit(1);
  if (later?.length) return `Undo the later import of this kind first (${later[0].file_name}).`;
  // A commit still writing has no committed_at yet, but it is newer than this one: undo would restore under it.
  const { data: busy } = await db.from('import_jobs').select('id, file_name').eq('school_id', job.school_id).eq('dataset', job.dataset)
    .eq('status', 'committing').neq('id', job.id).limit(1);
  if (busy?.length) return `Another import of this kind is being written (${busy[0].file_name}). Undo once it has finished.`;
  return null;
}

// ── Starting and moving jobs ────────────────────────────────────────────────

const MAX_BYTES = 50 * 1024 * 1024;

/** A new job and the one-time URL the browser uploads the file to. */
export async function createJob(db: Db, actor: Actor, b: { dataset?: unknown; fileName?: unknown; fileBytes?: unknown }): Promise<Result<{ job: Job; upload: { url: string; path: string } }>> {
  const d = datasetOf(b.dataset);
  if (!d) return fail('Pick what you are importing.');
  const fileName = typeof b.fileName === 'string' ? b.fileName.trim().slice(0, 200) : '';
  const kind = kindOf(fileName);
  if (!fileName || !kind) return fail('Choose a .csv or .xlsx file. Old .xls files: open them and save as .xlsx first.');
  const bytes = Number(b.fileBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return fail('That file is empty.');
  if (bytes > MAX_BYTES) return fail('Files can be up to 50 MB. Split it by year or by class.');
  const { data, error } = await db.from('import_jobs').insert({
    school_id: actor.schoolId, dataset: d.key, file_name: fileName, file_kind: kind, file_bytes: bytes,
    by_user: actor.id, by_kind: actor.kind, by_name: actor.name, grant_id: actor.kind === 'operator' ? actor.grantId : null,
  }).select(COLS).single();
  if (error || !data) return fail('Could not start the import.', 500);
  const path = `${actor.schoolId}/${data.id}/${safeName(fileName)}`;
  const up = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (up.error || !up.data) {
    await db.from('import_jobs').update({ status: 'cancelled', last_error: 'upload URL failed' }).eq('id', data.id);
    return fail('Could not prepare the upload.', 500);
  }
  await db.from('import_jobs').update({ file_path: path }).eq('id', data.id);
  return { ok: true, job: { ...(data as Job), file_path: path }, upload: { url: up.data.signedUrl, path } };
}

/** The browser says the file is in storage: start the check. */
export async function startCheck(db: Db, job: Job): Promise<Result> {
  if (job.status !== 'uploading') return fail('This import has already started.', 409);
  const { data } = await db.storage.from(BUCKET).list(`${job.school_id}/${job.id}`, { limit: 5 });
  if (!data?.some(f => `${job.school_id}/${job.id}/${f.name}` === job.file_path)) return fail('The file has not arrived yet. Try the upload again.', 409);
  const { error } = await db.from('import_jobs').update({ status: 'checking', phase_cursor: 0 }).eq('id', job.id).eq('status', 'uploading');
  return error ? fail(error.message, 500) : { ok: true };
}

export async function startCommit(db: Db, actor: Actor, job: Job): Promise<Result> {
  if (job.status !== 'checked') return fail(job.status === 'rejected' ? 'Fix the problems in the file and import it again.' : 'Only a checked import can be committed.', 409);
  // An undo of the same kind restores rows newest-first; writing on top of it would mix the two.
  const { data: undoing } = await db.from('import_jobs').select('file_name').eq('school_id', job.school_id).eq('dataset', job.dataset).eq('status', 'undoing').limit(1);
  if (undoing?.length) return fail(`An import of this kind is being undone (${undoing[0].file_name}). Commit once that has finished.`, 409);
  const { data, error } = await db.from('import_jobs').update({ status: 'committing', phase_cursor: 0, committed_by: actor.id, locked_until: null, summary: { ...job.summary, committedByKind: actor.kind } })
    .eq('id', job.id).eq('status', 'checked').select('id');
  if (error) return fail(error.message, 500);
  return data?.length ? { ok: true } : fail('Someone else has already committed this import.', 409);
}

export async function startUndo(db: Db, actor: Actor, job: Job): Promise<Result> {
  const block = await undoBlock(db, job);
  if (block) return fail(block, 409);
  const { data, error } = await db.from('import_jobs').update({ status: 'undoing', undone_by: actor.id, locked_until: null, summary: { ...job.summary, undoneByKind: actor.kind } }).eq('id', job.id).eq('status', 'committed').select('id');
  if (error) return fail(error.message, 500);
  if (!data?.length) return fail('This import is no longer committed.', 409);
  await audit(db, actor, job, 'import.undo_started', {});
  return { ok: true };
}

export async function cancelJob(db: Db, job: Job): Promise<Result> {
  if (!['uploading', 'checked', 'rejected'].includes(job.status)) return fail('This import can no longer be cancelled.', 409);
  const { error } = await db.from('import_jobs').update({ status: 'cancelled' }).eq('id', job.id).in('status', ['uploading', 'checked', 'rejected']);
  if (error) return fail(error.message, 500);
  await sweepFiles(db, job).catch(e => console.warn('[import files]', e instanceof Error ? e.message : e));
  return { ok: true };
}

async function audit(db: Db, actor: Pick<Actor, 'id' | 'kind'> | null, job: Pick<Job, 'id' | 'school_id' | 'dataset' | 'file_name'>, action: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({
    actor_id: actor?.id ?? null, actor_role: actor?.kind ?? 'server', action, table_name: 'import_jobs', row_id: job.id, school_id: job.school_id,
    new_values: { dataset: job.dataset, file: job.file_name, ...values },
  });
  if (error) console.warn('[import audit]', error.message);
}

// ── The worker ──────────────────────────────────────────────────────────────

/** Runs the worker after this response is sent. */
export function kick(db: Db) {
  after(() => runWorker(db).catch(e => console.warn('[import worker]', e instanceof Error ? e.message : e)));
}

/** Claims waiting jobs and moves each one step. Returns how many jobs it touched. */
export async function runWorker(db: Db, budgetMs = STEP_MS): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let touched = 0;
  // One job at a time, and a second only while half the time is left: each step downloads and parses its file first,
  // so a job claimed with no time left would do that for nothing.
  while (touched < 2 && (touched === 0 || deadline - Date.now() > budgetMs / 2)) {
    // bounded: import_claim returns at most p_limit rows
    const { data, error } = await db.rpc('import_claim', { p_limit: 1, p_seconds: Math.ceil((deadline - Date.now()) / 1000) + 30 });
    if (error) throw new Error(error.message);
    const job = ((data || []) as Job[])[0];
    if (!job) break;
    touched++;
    try {
      if (job.status === 'checking') await check(db, job, deadline);
      else if (job.status === 'committing') await commit(db, job, deadline);
      else if (job.status === 'undoing') await undo(db, job, deadline);
    } catch (e) {
      await stepFailed(db, job, e instanceof Error ? e.message : String(e));
    }
  }
  return touched;
}

/** Tries at the same point before a check or commit gives up. */
const MAX_TRIES = 5;

/**
 * A step threw. Wait longer before each retry (30 s, 1, 2, 4 min); after MAX_TRIES at the same point a check fails
 * (nothing was written) and a commit rolls back what it wrote. An undo keeps trying, at most every 30 minutes,
 * because it has to finish.
 */
async function stepFailed(db: Db, job: Job, msg: string) {
  const at = `${job.status}:${job.phase_cursor}`;
  const prev = job.summary.retry as { at?: string; n?: number } | undefined;
  const n = prev?.at === at ? Number(prev.n ?? 0) + 1 : 1;
  const lastError = msg.slice(0, 2000);
  const summary = { ...job.summary, retry: { at, n } };
  if (n >= MAX_TRIES && job.status !== 'undoing') {
    const why = `Stopped after ${n} tries: ${lastError}`.slice(0, 2000);
    if (job.status === 'committing' && job.phase_cursor > 0) {
      await db.from('import_jobs').update({ status: 'undoing', committed_at: new Date().toISOString(), last_error: why, locked_until: null, summary: { ...summary, failure: why } }).eq('id', job.id);
      await audit(db, null, job, 'import.rolled_back', { why });
    } else {
      await db.from('import_jobs').update({ status: 'failed', last_error: why, locked_until: null, summary: { ...summary, failure: why } }).eq('id', job.id);
      await sweepFiles(db, job).catch(e => console.warn('[import files]', e instanceof Error ? e.message : e));
    }
    return;
  }
  const wait = Math.min(30 * 2 ** (n - 1), 1800);
  await db.from('import_jobs').update({ last_error: lastError, summary, locked_until: new Date(Date.now() + wait * 1000).toISOString() }).eq('id', job.id);
}

async function update(db: Db, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from('import_jobs').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The file, read and checked in code. Same answer every time for the same file and the same school data. */
async function readJob(db: Db, job: Job) {
  const d = datasetOf(job.dataset);
  if (!d) throw new Error(`unknown dataset ${job.dataset}`);
  const file = await db.storage.from(BUCKET).download(job.file_path || '');
  if (file.error || !file.data) return { d, missing: true as const };
  const bytes = await file.data.arrayBuffer();
  const sha = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  let table: string[][];
  try { table = await readTable(bytes, job.file_kind); } catch (e) {
    return { d, sha, unreadable: e instanceof Error ? e.message : 'We could not read that file.' };
  }
  const look = await loadLookups(db, job.school_id, d.needs);
  let unlisted: string[] = [];
  if (d.files) {
    const folder = docFolder(job);
    const objects = await listFolder(db, folder);
    if (objects.size > MAX_FILES) return { d, sha, unreadable: `Up to ${MAX_FILES.toLocaleString('en-IN')} files go with one manifest. Split it by class.` };
    const used = new Set<string>();
    look.file = name => {
      const k = objectKey(name);
      const size = objects.get(k);
      if (size == null) return null;
      used.add(k);
      return { path: `${folder}/${k}`, size };
    };
    const checked = checkTable(d, table, look, job.file_kind === 'xlsx');
    unlisted = [...objects.keys()].filter(k => !used.has(k));
    return { d, sha, checked, unlisted };
  }
  return { d, sha, checked: checkTable(d, table, look, job.file_kind === 'xlsx'), unlisted };
}

const mergeProblems = (a: Problem[], b: Problem[]) => [...a, ...b].slice(0, PROBLEM_CAP);

/** What the writer receives. Aadhaar numbers on the register are sealed here, on the server, never stored as typed. */
function writerRows(d: Dataset, part: { n: number; row: Record<string, unknown> }[]) {
  const rows = payload(part) as Record<string, unknown>[];
  if (d.key !== 'students') return rows;
  return rows.map(r => {
    if (typeof r.aadhaar !== 'string') return r;
    const { aadhaar, ...rest } = r;
    return { ...rest, ...sealAadhaar(aadhaar as string) };
  });
}

async function check(db: Db, job: Job, deadline: number) {
  const r = await readJob(db, job);
  if ('missing' in r) return update(db, job.id, { status: 'rejected', problem_count: 1, problems: [{ n: 0, error: 'The file never reached Sthara. Upload it again.' }], locked_until: null });
  if ('unreadable' in r) {
    await sweepFiles(db, job);
    return update(db, job.id, { status: 'rejected', file_sha256: r.sha, problem_count: 1, problems: [{ n: 0, error: r.unreadable }], locked_until: null });
  }
  const c = r.checked!;
  // Files nobody listed are reported and not kept (only on the first pass: later passes find them gone).
  if (job.phase_cursor === 0 && r.unlisted?.length) {
    const folder = docFolder(job);
    const drop = new Set(r.unlisted);
    await sweepFiles(db, job, p => !drop.has(p.slice(folder.length + 1)));
    job.summary = { ...job.summary, unlisted: { count: r.unlisted.length, names: r.unlisted.slice(0, 50).map(k => k.slice(17)) } };
  }
  if (c.fileProblems.length || c.problemCount) {
    // A rejected manifest is imported again as a new job, files and all.
    await sweepFiles(db, job);
    return update(db, job.id, {
      status: 'rejected', file_sha256: r.sha, total_rows: c.total, checked_at: new Date().toISOString(), locked_until: null,
      problem_count: c.fileProblems.length + c.problemCount, problems: mergeProblems(c.fileProblems.map(error => ({ n: 0, error })), c.problems),
      summary: { ...job.summary, skipped: c.skipped },
    });
  }
  if (r.d.key === 'students' && !piiReady() && c.rows.some(x => x.row.aadhaar)) {
    return update(db, job.id, { status: 'rejected', file_sha256: r.sha, total_rows: c.total, checked_at: new Date().toISOString(), locked_until: null,
      problem_count: 1, problems: [{ n: 0, error: 'Aadhaar numbers can\u2019t be stored yet: the encryption key isn\u2019t set up. Remove the aadhaar column, or ask Sthara support.' }] });
  }
  // The code found nothing: now ask the database, chunk by chunk, what would change and what it refuses.
  const parts = chunks(c.rows, CHUNK, r.d.group);
  let { phase_cursor: i, added, updated, unchanged, problem_count: pc } = job;
  let problems = i === 0 ? [] : job.problems;
  // Rows whose consented details were left out (health without the parent's consent): counted, never refused.
  let withheld = i === 0 ? 0 : Number(job.summary?.withheld ?? 0);
  if (i === 0) { added = updated = unchanged = pc = 0; }
  for (; i < parts.length && Date.now() < deadline; i++) {
    const { data, error } = await db.rpc(r.d.writer, { p_job: job.id, p_school: job.school_id, p_actor: null, p_rows: writerRows(r.d, parts[i]), p_dry: true });
    if (error) throw new Error(error.message);
    const o = data as { added: number; updated: number; unchanged: number; withheld?: number; problems: Problem[] };
    added += o.added; updated += o.updated; unchanged += o.unchanged; pc += o.problems.length; withheld += o.withheld ?? 0;
    problems = mergeProblems(problems, o.problems);
    await update(db, job.id, { phase_cursor: i + 1, added, updated, unchanged, problem_count: pc, problems, summary: { ...job.summary, withheld } });
  }
  if (i < parts.length) return update(db, job.id, { locked_until: null, file_sha256: r.sha, total_rows: c.total });
  if (pc) await sweepFiles(db, job);
  await update(db, job.id, {
    status: pc ? 'rejected' : 'checked', phase_cursor: 0, file_sha256: r.sha, total_rows: c.total, checked_at: new Date().toISOString(),
    summary: { ...(job.summary.unlisted ? { unlisted: job.summary.unlisted } : {}), skipped: c.skipped, chunks: parts.length, withheld }, locked_until: null,
  });
}

async function commit(db: Db, job: Job, deadline: number) {
  const r = await readJob(db, job);
  const stop = async (why: string) => {
    if (job.phase_cursor === 0) {
      // Nothing written yet: the import simply fails.
      await update(db, job.id, { status: 'failed', last_error: why, locked_until: null, summary: { ...job.summary, failure: why } });
      return void await sweepFiles(db, job);
    }
    await update(db, job.id, { status: 'undoing', committed_at: new Date().toISOString(), last_error: why, locked_until: null, summary: { ...job.summary, failure: why } });
    await audit(db, null, job, 'import.rolled_back', { why });
  };
  if ('missing' in r || 'unreadable' in r) return stop('The file can no longer be read.');
  if (r.sha !== job.file_sha256) return stop('The file changed after it was checked.');
  const c = r.checked!;
  if (c.fileProblems.length || c.problemCount) return stop('The school’s data changed since the check, and some rows no longer fit. Check the file again.');
  const parts = chunks(c.rows, CHUNK, r.d.group);
  let { phase_cursor: i, added, updated, unchanged } = job;
  if (i === 0) {
    added = updated = unchanged = 0;
    if (r.d.key === 'fee_payments') {
      const { error } = await db.rpc('import_receipt_floor', { p_school: job.school_id, p_floors: receiptFloors(c.rows) });
      if (error) throw new Error(error.message);
    }
  }
  // Rows record who wrote them only when that is a school user (an operator has no account in the school).
  const actor = job.summary.committedByKind === 'admin' ? job.committed_by : null;
  for (; i < parts.length && Date.now() < deadline; i++) {
    const { data, error } = await db.rpc(r.d.writer, { p_job: job.id, p_school: job.school_id, p_actor: actor, p_rows: writerRows(r.d, parts[i]), p_dry: false });
    // Thrown, not stopped: a timeout or dropped connection is retried with backoff, and only rolls back after MAX_TRIES.
    if (error) throw new Error(error.message);
    const o = data as { added: number; updated: number; unchanged: number; problems: Problem[] };
    if (o.problems.length) {
      await update(db, job.id, { problems: o.problems.slice(0, PROBLEM_CAP), problem_count: o.problems.length });
      return stop('Some rows were refused while writing (the school’s data changed since the check).');
    }
    added += o.added; updated += o.updated; unchanged += o.unchanged;
    await update(db, job.id, { phase_cursor: i + 1, added, updated, unchanged });
    job.phase_cursor = i + 1;
  }
  if (i < parts.length) return update(db, job.id, { locked_until: null });
  await update(db, job.id, { status: 'committed', phase_cursor: 0, committed_at: new Date().toISOString(), locked_until: null });
  // A row that matched a document already on the record kept that file: the copy uploaded with it goes.
  if (r.d.files) { const keep = await referenced(db, job); await sweepFiles(db, job, p => keep.has(p)); }
  await audit(db, job.committed_by ? { id: job.committed_by, kind: job.summary.committedByKind === 'operator' ? 'operator' : 'admin' } : null, job, 'import.committed', { added, updated, unchanged, rows: c.total });
}

async function undo(db: Db, job: Job, deadline: number) {
  let restored = Number(job.summary.restored ?? 0), removed = Number(job.summary.removed ?? 0);
  while (Date.now() < deadline) {
    const { data, error } = await db.rpc('import_undo', { p_job: job.id, p_limit: UNDO_BATCH });
    if (error) throw new Error(error.message);
    const o = data as { done: boolean; restored: number; removed: number };
    restored += o.restored; removed += o.removed;
    await update(db, job.id, { summary: { ...job.summary, restored, removed } });
    if (o.done) {
      const failed = !!job.summary.failure;
      // The files of removed rows go too; rows kept (changed since) keep theirs.
      if (datasetOf(job.dataset)?.files) { const keep = await referenced(db, job); await sweepFiles(db, job, p => keep.has(p)); }
      await update(db, job.id, { status: failed ? 'failed' : 'undone', undone_at: new Date().toISOString(), locked_until: null });
      if (!failed) await audit(db, job.undone_by ? { id: job.undone_by, kind: job.summary.undoneByKind === 'operator' ? 'operator' : 'admin' } : null, job, 'import.undone', { restored, removed });
      return;
    }
  }
  await update(db, job.id, { locked_until: null });
}
