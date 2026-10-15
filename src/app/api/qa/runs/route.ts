import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { CONTENT_TYPE, QA_BUCKET, filePath, parseUpload } from '@/lib/qa/runs';
import { purgeExpiredFiles, qaCaller } from '@/lib/qa/server';

export const dynamic = 'force-dynamic';

/**
 * The test pack (qa/) uploads a run here at the end of run-regression.sh.
 *   POST  x-qa-token: <upload token>
 *         { startedAt, finishedAt, machine, git: { commit, branch, dirty }, target, stages, totals, failures, files: [{ name, size }] }
 *   ->    { id, uploads: [{ name, url }] }  one signed upload URL per file (PUT the bytes there, valid two hours),
 *         then POST /api/qa/runs/<id>/complete.
 * The files go straight to private storage, so a run's size is not limited by this request.
 */
export async function POST(req: NextRequest) {
  const db = createAdminClient();
  const caller = await qaCaller(req, db);
  if (caller instanceof NextResponse) return caller;
  const p = parseUpload(await req.json().catch(() => null));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const r = p.run;
  const { data: run, error } = await db.from('qa_runs').insert({
    token_id: caller.id, status: 'uploading', started_at: r.startedAt, finished_at: r.finishedAt, machine: r.machine,
    git_commit: r.git.commit, git_branch: r.git.branch, git_dirty: r.git.dirty, target: r.target,
    stages: r.stages, totals: r.totals, failures: r.failures, files: r.files,
  }).select('id').single();
  if (error || !run) return NextResponse.json({ error: 'Could not record the run.' }, { status: 500 });
  const uploads: { name: string; url: string; contentType: string }[] = [];
  for (const f of r.files) {
    const { data, error: e } = await db.storage.from(QA_BUCKET).createSignedUploadUrl(filePath(run.id, f.name), { upsert: true });
    if (e || !data) return NextResponse.json({ error: `Could not prepare the upload of ${f.name}.` }, { status: 500 });
    uploads.push({ name: f.name, url: data.signedUrl, contentType: CONTENT_TYPE[f.kind] });
  }
  void purgeExpiredFiles(db).catch(() => {});
  return NextResponse.json({ id: run.id, uploads });
}
