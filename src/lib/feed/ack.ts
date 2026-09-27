import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canSeeSituation, type FeedCaller } from './access';

export type AckResult = { ok: true; already: boolean; acknowledgedAt: string; title: string } | { ok: false; error: string; status: number };

/** Acknowledges a feed item the caller can see, with an optional note (web and WhatsApp). */
export async function acknowledgeSituation(db: SupabaseClient, me: FeedCaller, id: string, rawNote?: string): Promise<AckResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Which item?', status: 400 };
  const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 500) : '';
  const { data: row } = await db.from('situations').select('id, school_id, audience, teacher_id, class_name, acknowledged_at, title').eq('id', id).maybeSingle();
  if (!row || !canSeeSituation(me, row)) return { ok: false, error: 'That item is not in your feed.', status: 404 };
  if (row.acknowledged_at) return { ok: true, already: true, acknowledgedAt: row.acknowledged_at, title: row.title };
  const now = new Date().toISOString();
  const { error } = await db.from('situations')
    .update({ acknowledged: true, acknowledged_by: me.id, ack_by_name: me.name, acknowledged_at: now, ack_note: note || null })
    .eq('id', id).is('acknowledged_at', null);
  if (error) return { ok: false, error: 'Could not acknowledge. Try again.', status: 500 };
  return { ok: true, already: false, acknowledgedAt: now, title: row.title };
}
