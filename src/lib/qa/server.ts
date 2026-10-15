import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { QA_BUCKET, expired, filePath } from './runs';

/** A new upload token: shown once; only its hash is stored. */
export function newToken(): { token: string; hash: string } {
  const token = `sqa_${randomBytes(24).toString('base64url')}`;
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * The test pack's credential: `x-qa-token` (or Authorization: Bearer). Returns the token row, or the response to send.
 * A token can only upload runs.
 */
export async function qaCaller(req: Request, db: SupabaseClient): Promise<{ id: string; label: string } | NextResponse> {
  const raw = req.headers.get('x-qa-token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const token = raw.trim();
  if (!/^sqa_[A-Za-z0-9_-]{20,}$/.test(token)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(`qa:${ip}`, 30, 60_000).allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const { data } = await db.from('qa_upload_tokens').select('id, label, revoked_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.from('qa_upload_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { id: data.id, label: data.label };
}

/** Removes the files of runs past keeping (unpinned, over 90 days old). A few runs at a time: called on each upload. */
export async function purgeExpiredFiles(db: SupabaseClient, limit = 10): Promise<number> {
  const { data } = await db.from('qa_runs').select('id, started_at, pinned, files_purged_at, files')
    .eq('pinned', false).is('files_purged_at', null).lt('started_at', new Date(Date.now() - 89 * 86_400_000).toISOString())
    .order('started_at').limit(limit);
  const due = new Set(expired(data || []));
  let n = 0;
  for (const r of (data || []).filter(x => due.has(x.id))) {
    const paths = (r.files as { name: string }[] || []).map(f => filePath(r.id, f.name));
    if (paths.length) await db.storage.from(QA_BUCKET).remove(paths);
    await db.from('qa_runs').update({ files_purged_at: new Date().toISOString() }).eq('id', r.id);
    n++;
  }
  return n;
}

/** Removes every file of a run (deleting the run). */
export async function removeRunFiles(db: SupabaseClient, runId: string, files: { name: string }[]) {
  const paths = files.map(f => filePath(runId, f.name));
  if (paths.length) await db.storage.from(QA_BUCKET).remove(paths);
}
