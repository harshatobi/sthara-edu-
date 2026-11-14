import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CopilotReply } from './copilot';
import { normCls, REPLY_REUSE_DAYS } from './copilotKeys';

/**
 * The Copilot's saved outputs (table copilot_outputs): everything it makes is kept, and an identical request is
 * answered from the kept copy at no AI cost. Chat answers are the teacher's own; board papers and pictures are shared
 * with the school's other teachers of that class level and subject.
 */

export const keyOf = (source: string) => createHash('sha256').update(source).digest('hex');

export interface Reused { id: string; at: string; by: 'you' | 'colleague'; versions?: number }
export interface SavedRow {
  id: string; kind: 'reply' | 'paper' | 'image'; cls: string; subject: string; chapter: string | null; title: string;
  artifactKind: string | null; at: string; reuseCount: number; mine: boolean;
}
interface Staffish { id: string; schoolId: string }

const gradeOf = (cls: string) => normCls(cls).replace(/[a-z]+$/, '');

/** The newest saved output for this request; chat answers only the teacher's own and only while recent. */
export async function findSaved(db: SupabaseClient, staff: Staffish, kind: 'reply' | 'paper' | 'image', key: string) {
  let q = db.from('copilot_outputs').select('id, teacher_id, reply, image_path, created_at, reuse_count')
    .eq('school_id', staff.schoolId).eq('kind', kind).eq('request_key', key).order('created_at', { ascending: false }).limit(20);
  if (kind === 'reply') q = q.eq('teacher_id', staff.id).gte('created_at', new Date(Date.now() - REPLY_REUSE_DAYS * 86_400_000).toISOString());
  const { data } = await q;
  if (!data?.length) return null;
  const row = data[0];
  // Counted, so the library can show what's been used again (and the saving it made). Best effort.
  void db.from('copilot_outputs').update({ reuse_count: (row.reuse_count ?? 0) + 1, last_used_at: new Date().toISOString() }).eq('id', row.id).then(() => {}, () => {});
  return {
    id: row.id as string, reply: row.reply as CopilotReply | null, imagePath: row.image_path as string | null,
    reused: { id: row.id, at: row.created_at, by: row.teacher_id === staff.id ? 'you' : 'colleague', versions: data.length } as Reused,
  };
}

export async function saveOutput(db: SupabaseClient, staff: Staffish, o: {
  kind: 'reply' | 'paper' | 'image'; cls: string; subject: string; chapter?: string | null; key: string; title: string;
  artifactKind?: string | null; reply?: CopilotReply | null; imagePath?: string | null;
}): Promise<string | null> {
  const { data, error } = await db.from('copilot_outputs').insert({
    school_id: staff.schoolId, teacher_id: staff.id, kind: o.kind, class: o.cls.slice(0, 40), subject: o.subject.slice(0, 80),
    chapter: o.chapter ? o.chapter.slice(0, 200) : null, request_key: o.key, title: (o.title || 'Untitled').slice(0, 200),
    artifact_kind: o.artifactKind ?? null, reply: o.reply ?? null, image_path: o.imagePath ?? null,
  }).select('id').single();
  if (error) { console.warn('[copilot saved] insert', error.message); return null; }
  return data.id;
}

/** "Made before" for a class and subject: the teacher's own things, plus the school's board papers and pictures for that level. */
export async function listSaved(db: SupabaseClient, staff: Staffish, cls: string, subject: string): Promise<SavedRow[]> {
  // bounded: one school's saved outputs for one subject, newest 400
  const { data } = await db.from('copilot_outputs').select('id, teacher_id, kind, class, subject, chapter, title, artifact_kind, created_at, reuse_count')
    .eq('school_id', staff.schoolId).ilike('subject', subject).order('created_at', { ascending: false }).limit(400);
  const g = gradeOf(cls);
  return (data || [])
    .filter(r => (r.teacher_id === staff.id && normCls(r.class) === normCls(cls)) || (r.kind !== 'reply' && gradeOf(r.class) === g))
    .slice(0, 60)
    .map(r => ({ id: r.id, kind: r.kind, cls: r.class, subject: r.subject, chapter: r.chapter, title: r.title, artifactKind: r.artifact_kind, at: r.created_at, reuseCount: r.reuse_count, mine: r.teacher_id === staff.id }));
}

/** One saved output, if this teacher may see it (their own, or a shared paper or picture of their school). */
export async function getSaved(db: SupabaseClient, staff: Staffish, id: string) {
  const { data: r } = await db.from('copilot_outputs').select('id, teacher_id, kind, class, subject, chapter, title, reply, image_path, created_at')
    .eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  if (!r || (r.kind === 'reply' && r.teacher_id !== staff.id)) return null;
  return r;
}

export async function deleteSaved(db: SupabaseClient, staff: Staffish, id: string): Promise<boolean> {
  const { data } = await db.from('copilot_outputs').delete().eq('id', id).eq('teacher_id', staff.id).select('id');
  return !!data?.length;
}
