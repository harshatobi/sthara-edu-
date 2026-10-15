import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { can } from '@/lib/ops/roles';
import { FILE_DAYS, QA_BUCKET, filePath, type RunFile } from '@/lib/qa/runs';
import { newToken, removeRunFiles } from '@/lib/qa/server';

export const dynamic = 'force-dynamic';

const LIST_COLS = 'id, status, started_at, finished_at, machine, git_commit, git_branch, git_dirty, target, stages, totals, pinned, pin_note, files_purged_at, files, token_id';

/**
 * Platform Manager > Quality: the test pack's runs.
 *   GET                  recent runs (newest first, 200), upload tokens (qa.manage), what the caller may do.
 *   GET ?run=<id>        one run with its failing tests and a download link per file (two minutes).
 *   POST { action } qa.manage:
 *     pin { id, note } | unpin { id } | delete { id }
 *     token { label } -> { token } shown once | revoke { id }
 * Operators only (404 for everyone else); qa.read to look, qa.manage to change.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'qa.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const id = req.nextUrl.searchParams.get('run');
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown run.' }, { status: 404 });
    const { data: run } = await db.from('qa_runs').select('*').eq('id', id).maybeSingle();
    if (!run) return NextResponse.json({ error: 'That run no longer exists.' }, { status: 404 });
    const files = run.files_purged_at ? (run.files as RunFile[]).map(f => ({ ...f, url: null })) : await Promise.all((run.files as RunFile[]).map(async f => {
      const { data } = await db.storage.from(QA_BUCKET).createSignedUrl(filePath(run.id, f.name), 120, { download: f.name });
      return { ...f, url: data?.signedUrl ?? null };
    }));
    const { data: tok } = run.token_id ? await db.from('qa_upload_tokens').select('label').eq('id', run.token_id).maybeSingle() : { data: null };
    return NextResponse.json({ run: { ...run, files, uploadedBy: tok?.label ?? null } });
  }
  const [{ data: runs, error }, tokens] = await Promise.all([
    db.from('qa_runs').select(LIST_COLS).order('started_at', { ascending: false }).limit(200),
    can(op.role, 'qa.manage')
      ? db.from('qa_upload_tokens').select('id, label, created_at, last_used_at, revoked_at').order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
  ]);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ error: 'Test runs aren\'t in this database yet. They arrive with the qa_runs migration.' }, { status: 503 });
    return NextResponse.json({ error: 'Could not load the runs.' }, { status: 500 });
  }
  const labels = new Map(((tokens as any).data || []).map((t: any) => [t.id, t.label]));
  return NextResponse.json({
    can: { manage: can(op.role, 'qa.manage') }, fileDays: FILE_DAYS,
    runs: (runs || []).map(r => ({ ...r, uploadedBy: labels.get(r.token_id) ?? null, fileCount: (r.files as RunFile[]).length, files: undefined })),
    tokens: (tokens as any).data ?? null,
  });
}

export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'qa.manage');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const b = await req.json().catch(() => ({}));
  const audit = (action: string, table: string, row: string, values: Record<string, unknown>) => db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action, table_name: table, row_id: row, school_id: null, new_values: values,
  });
  const runId = typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;

  if (b.action === 'pin' || b.action === 'unpin') {
    if (!runId) return NextResponse.json({ error: 'Unknown run.' }, { status: 400 });
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
    const { data: run } = await db.from('qa_runs').select('id, files_purged_at').eq('id', runId).maybeSingle();
    if (!run) return NextResponse.json({ error: 'That run no longer exists.' }, { status: 404 });
    if (b.action === 'pin' && run.files_purged_at) return NextResponse.json({ error: 'This run\'s files are already removed; pinning would keep only its results, which are kept anyway.' }, { status: 409 });
    const { error } = await db.from('qa_runs').update({ pinned: b.action === 'pin', pin_note: b.action === 'pin' ? note || null : null }).eq('id', runId);
    if (error) return NextResponse.json({ error: 'Could not change it.' }, { status: 500 });
    await audit(b.action.toUpperCase(), 'qa_runs', runId, { note });
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'delete') {
    if (!runId) return NextResponse.json({ error: 'Unknown run.' }, { status: 400 });
    const { data: run } = await db.from('qa_runs').select('id, files, pinned, started_at, status').eq('id', runId).maybeSingle();
    if (!run) return NextResponse.json({ error: 'That run no longer exists.' }, { status: 404 });
    if (run.pinned) return NextResponse.json({ error: 'Unpin the run first.' }, { status: 409 });
    await removeRunFiles(db, run.id, run.files as RunFile[]);
    const { error } = await db.from('qa_runs').delete().eq('id', runId);
    if (error) return NextResponse.json({ error: 'Could not delete it.' }, { status: 500 });
    await audit('DELETE', 'qa_runs', runId, { started_at: run.started_at, status: run.status });
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'token') {
    const label = typeof b.label === 'string' ? b.label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (!label) return NextResponse.json({ error: 'Name the token after the machine or person that will use it.' }, { status: 400 });
    const t = newToken();
    const { data, error } = await db.from('qa_upload_tokens').insert({ label, token_hash: t.hash, created_by: op.id }).select('id').single();
    if (error || !data) return NextResponse.json({ error: 'Could not create the token.' }, { status: 500 });
    await audit('CREATE', 'qa_upload_tokens', data.id, { label });
    return NextResponse.json({ ok: true, id: data.id, token: t.token });
  }

  if (b.action === 'revoke') {
    if (!runId) return NextResponse.json({ error: 'Unknown token.' }, { status: 400 });
    const { error } = await db.from('qa_upload_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', runId).is('revoked_at', null);
    if (error) return NextResponse.json({ error: 'Could not revoke it.' }, { status: 500 });
    await audit('REVOKE', 'qa_upload_tokens', runId, {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
