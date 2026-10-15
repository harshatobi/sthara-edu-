import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { MAX_FILE_BYTES, MAX_RUN_BYTES, QA_BUCKET, filePath, runStatus, type RunFile, type Stage } from '@/lib/qa/runs';
import { qaCaller } from '@/lib/qa/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/qa/runs/<id>/complete  (x-qa-token, the same token that started the run)
 * After the files are uploaded: checks they arrived, keeps their real sizes, and marks the run passed or failed.
 * Files that never arrived are dropped from the run's list (and reported back).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const db = createAdminClient();
  const caller = await qaCaller(req, db);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown run.' }, { status: 404 });
  const { data: run } = await db.from('qa_runs').select('id, token_id, status, stages, files').eq('id', id).maybeSingle();
  if (!run || run.token_id !== caller.id) return NextResponse.json({ error: 'Unknown run.' }, { status: 404 });
  if (run.status !== 'uploading') return NextResponse.json({ ok: true, status: run.status });
  const { data: listed } = await db.storage.from(QA_BUCKET).list(`qa/${id}`, { limit: 100 });
  const sizes = new Map((listed || []).map(o => [o.name, Number((o.metadata as { size?: number } | null)?.size ?? 0)]));
  // The signed upload URLs don't cap size: check what actually arrived, and remove anything over the limits.
  let files = (run.files as RunFile[]).filter(f => sizes.has(f.name)).map(f => ({ ...f, size: sizes.get(f.name) || f.size }));
  const tooBig = files.filter(f => f.size > MAX_FILE_BYTES);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_RUN_BYTES) tooBig.push(...files.filter(f => !tooBig.includes(f)));
  if (tooBig.length) {
    await db.storage.from(QA_BUCKET).remove(tooBig.map(f => filePath(id, f.name)));
    files = files.filter(f => !tooBig.includes(f));
  }
  const missing = (run.files as RunFile[]).filter(f => !files.some(x => x.name === f.name)).map(f => f.name);
  const status = runStatus(run.stages as Stage[]);
  const { error } = await db.from('qa_runs').update({ status, files }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not finish the run.' }, { status: 500 });
  return NextResponse.json({ ok: true, status, files: files.length, missing });
}
