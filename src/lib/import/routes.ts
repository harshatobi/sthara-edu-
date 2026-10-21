import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelJob, createJob, getJob, kick, listJobs, startCheck, startCommit, startUndo, undoBlock, type Actor, type Job } from './server';

/**
 * The request handling the school's admin routes and the ops console share. The caller has already been
 * authorised and the school comes from that check, never from the request.
 */

type Db = SupabaseClient;
const UUID = /^[0-9a-f-]{36}$/i;
const WAITING = ['checking', 'committing', 'undoing'];

/** GET: the school's import history. */
export async function listResponse(db: Db, schoolId: string) {
  try {
    const jobs = await listJobs(db, schoolId);
    // Someone is looking and work is waiting: make sure the worker is on it.
    if (jobs.some(j => WAITING.includes(j.status))) kick(db);
    return NextResponse.json({ jobs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load imports.' }, { status: 500 });
  }
}

/** POST: start an import; the answer carries the upload URL. */
export async function createResponse(db: Db, actor: Actor, body: unknown) {
  const out = await createJob(db, actor, (body || {}) as Record<string, unknown>);
  return out.ok ? NextResponse.json({ job: out.job, upload: out.upload }) : NextResponse.json({ error: out.error }, { status: out.status });
}

/** GET one job, with whether it can be undone. */
export async function jobResponse(db: Db, schoolId: string, id: string) {
  if (!UUID.test(id)) return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  const job = await getJob(db, schoolId, id);
  if (!job) return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  if (WAITING.includes(job.status)) kick(db);
  return NextResponse.json({ job, undo: job.status === 'committed' ? { blocked: await undoBlock(db, job) } : null });
}

/** POST one job: { action: 'uploaded' | 'commit' | 'undo' | 'cancel' }. */
export async function actionResponse(db: Db, actor: Actor, id: string, body: unknown) {
  if (!UUID.test(id)) return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  const job: Job | null = await getJob(db, actor.schoolId, id);
  if (!job) return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  const action = (body as { action?: unknown } | null)?.action;
  const out = action === 'uploaded' ? await startCheck(db, job)
    : action === 'commit' ? await startCommit(db, actor, job)
      : action === 'undo' ? await startUndo(db, actor, job)
        : action === 'cancel' ? await cancelJob(db, job)
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  if (action !== 'cancel') kick(db);
  return NextResponse.json({ ok: true });
}
