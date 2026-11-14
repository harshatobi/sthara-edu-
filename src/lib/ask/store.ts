import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PARENT_ASK_DAILY } from '@/lib/settings/limits';
import { DAY_MS, istDay } from '@/lib/feed/rules';
import { blankReply, canSeeAll, readReply, titleOf, type AskReply, type Viewer } from './protocol';
import type { Asker, Turn } from './engine';

/**
 * Saved conversations (every device, kept until the person deletes them) and
 * answers shared between staff. Only ever the person's own rows, except a
 * shared answer, which is re-checked against the recipient's own role.
 */

export interface ConversationRow { id: string; title: string; pinned: boolean; lastAt: string; createdAt: string }
export interface TurnRow { id: string; role: 'me' | 'os'; text: string; reply: AskReply | null; at: string }
export interface SharedRow { id: string; turnId: string; from: string; note: string | null; at: string; seen: boolean; question: string; reply: AskReply; hidden: boolean }

const conv = (r: any): ConversationRow => ({ id: r.id, title: r.title, pinned: r.pinned, lastAt: r.last_at, createdAt: r.created_at });
const turn = (r: any): TurnRow => ({ id: r.id, role: r.role, text: r.text, reply: readReply(r.reply), at: r.created_at });

export async function listConversations(db: SupabaseClient, userId: string, q?: string): Promise<ConversationRow[]> {
  const term = (q || '').trim().slice(0, 80);
  if (!term) {
    // bounded: one person's conversations, newest 200
    const { data } = await db.from('ask_conversations').select('id, title, pinned, last_at, created_at').eq('user_id', userId)
      .order('pinned', { ascending: false }).order('last_at', { ascending: false }).limit(200);
    return (data || []).map(conv);
  }
  const like = `%${term.replace(/[%_\\]/g, m => `\\${m}`)}%`;
  const { data: mine } = await db.from('ask_conversations').select('id').eq('user_id', userId).limit(2000);
  const ids = (mine || []).map(r => r.id);
  if (!ids.length) return [];
  const [{ data: byTitle }, { data: byText }] = await Promise.all([
    db.from('ask_conversations').select('id').eq('user_id', userId).ilike('title', like).limit(100),
    db.from('ask_turns').select('conversation_id').in('conversation_id', ids.slice(0, 300)).ilike('text', like).limit(200),
  ]);
  const hit = [...new Set([...(byTitle || []).map(r => r.id), ...(byText || []).map(r => r.conversation_id)])];
  if (!hit.length) return [];
  const { data } = await db.from('ask_conversations').select('id, title, pinned, last_at, created_at').in('id', hit.slice(0, 100)).order('last_at', { ascending: false });
  return (data || []).map(conv);
}

export async function getConversation(db: SupabaseClient, userId: string, id: string): Promise<{ conversation: ConversationRow; turns: TurnRow[] } | null> {
  const { data: c } = await db.from('ask_conversations').select('id, title, pinned, last_at, created_at').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!c) return null;
  // bounded: one conversation's turns (a long one is a few hundred)
  const { data: t } = await db.from('ask_turns').select('id, role, text, reply, created_at').eq('conversation_id', id).order('created_at').limit(1000);
  return { conversation: conv(c), turns: (t || []).map(turn) };
}

/** The last turns of a conversation, for the model. */
export async function historyOf(db: SupabaseClient, conversationId: string): Promise<Turn[]> {
  const { data } = await db.from('ask_turns').select('role, text, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);
  return (data || []).reverse().map(r => ({ role: r.role, text: r.text }));
}

export async function startConversation(db: SupabaseClient, a: Asker, question: string): Promise<string> {
  const { data, error } = await db.from('ask_conversations').insert({ school_id: a.viewer.schoolId, user_id: a.viewer.id, title: titleOf(question) }).select('id').single();
  if (error || !data) throw new Error(error?.message || 'could not start a conversation');
  return data.id;
}

export async function ownsConversation(db: SupabaseClient, userId: string, id: string) {
  const { data } = await db.from('ask_conversations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function saveTurns(db: SupabaseClient, a: Asker, conversationId: string, question: string, answer: { reply: AskReply; needs: string[] }): Promise<{ questionId: string; answerId: string }> {
  const now = Date.now();
  const { data, error } = await db.from('ask_turns').insert([
    { conversation_id: conversationId, school_id: a.viewer.schoolId, role: 'me', text: question.slice(0, 6000), created_at: new Date(now).toISOString() },
    { conversation_id: conversationId, school_id: a.viewer.schoolId, role: 'os', text: answer.reply.say.slice(0, 6000) || answer.reply.ask.map(q => q.question).join(' ').slice(0, 6000), reply: answer.reply, needs: answer.needs.slice(0, 40), created_at: new Date(now + 1).toISOString() },
  ]).select('id, role');
  if (error || !data) throw new Error(error?.message || 'could not save');
  await db.from('ask_conversations').update({ last_at: new Date(now + 1).toISOString() }).eq('id', conversationId);
  return { questionId: data.find(r => r.role === 'me')!.id, answerId: data.find(r => r.role === 'os')!.id };
}

export async function updateConversation(db: SupabaseClient, userId: string, id: string, patch: { pinned?: boolean; title?: string }) {
  const row: Record<string, unknown> = {};
  if (typeof patch.pinned === 'boolean') row.pinned = patch.pinned;
  if (typeof patch.title === 'string' && patch.title.trim()) row.title = titleOf(patch.title);
  if (!Object.keys(row).length) return false;
  const { data } = await db.from('ask_conversations').update(row).eq('id', id).eq('user_id', userId).select('id');
  return !!data?.length;
}

export async function deleteConversation(db: SupabaseClient, userId: string, id: string) {
  const { data } = await db.from('ask_conversations').delete().eq('id', id).eq('user_id', userId).select('id');
  return !!data?.length;
}

export async function deleteAll(db: SupabaseClient, userId: string) {
  const { error } = await db.from('ask_conversations').delete().eq('user_id', userId);
  return !error;
}

// ── Parents: questions per day ───────────────────────────────────────────────
/** IST midnight today, as an instant. */
const istMidnight = () => new Date(Date.parse(`${istDay()}T00:00:00+05:30`)).toISOString();

/** Questions a parent has left today, counted from metered answers (deleting a conversation doesn't give them back). */
export async function parentQuestionsLeft(db: SupabaseClient, userId: string): Promise<{ used: number; limit: number; left: number }> {
  const { count } = await db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', 'parentAsk').eq('ok', true).gte('at', istMidnight());
  const used = count ?? 0;
  return { used, limit: PARENT_ASK_DAILY, left: Math.max(0, PARENT_ASK_DAILY - used) };
}

// ── Sharing (staff to staff) ────────────────────────────────────────────────
export interface Colleague { id: string; name: string; role: string }

/** Staff in the same school someone can share with (teachers and office accounts), excluding themselves. */
export async function colleagues(db: SupabaseClient, schoolId: string, me: string): Promise<Colleague[]> {
  // bounded: one school's staff accounts (a few hundred)
  const { data } = await db.from('users').select('id, name, role, teacher_subject').eq('school_id', schoolId).in('role', ['teacher', 'admin']).neq('id', me).order('name').limit(1000);
  return (data || []).map(u => ({ id: u.id, name: u.name || 'Staff', role: u.role === 'teacher' ? `Teacher${u.teacher_subject ? ` · ${u.teacher_subject}` : ''}` : 'School office' }));
}

export async function shareTurn(db: SupabaseClient, a: Asker, turnId: string, toIds: string[], note: string | null): Promise<number> {
  if (a.kind !== 'staff') throw Object.assign(new Error('Parents can save a PDF; sharing is for staff.'), { status: 403 });
  const { data: t } = await db.from('ask_turns').select('id, role, conversation_id, school_id').eq('id', turnId).maybeSingle();
  if (!t || t.role !== 'os' || t.school_id !== a.viewer.schoolId || !(await ownsConversation(db, a.viewer.id, t.conversation_id))) {
    throw Object.assign(new Error('That answer isn’t yours to share.'), { status: 404 });
  }
  const ids = [...new Set(toIds)].filter(id => id !== a.viewer.id).slice(0, 10);
  if (!ids.length) return 0;
  const { data: people } = await db.from('users').select('id').in('id', ids).eq('school_id', a.viewer.schoolId).in('role', ['teacher', 'admin']).limit(10);
  const ok = (people || []).map(p => p.id);
  if (!ok.length) return 0;
  const { data } = await db.from('ask_shares').upsert(ok.map(to => ({ school_id: a.viewer.schoolId, turn_id: turnId, from_user: a.viewer.id, to_user: to, note: note?.slice(0, 500) || null })), { onConflict: 'turn_id,to_user', ignoreDuplicates: true }).select('id');
  return data?.length ?? 0;
}

/** Answers shared with this person, newest first; parts their role can't see are blanked. */
export async function sharedWith(db: SupabaseClient, viewer: Viewer, limit = 30): Promise<SharedRow[]> {
  if (viewer.kind !== 'staff') return [];
  const { data: shares } = await db.from('ask_shares').select('id, turn_id, from_user, note, created_at, seen_at').eq('to_user', viewer.id)
    .gte('created_at', new Date(Date.now() - 180 * DAY_MS).toISOString()).order('created_at', { ascending: false }).limit(limit);
  if (!shares?.length) return [];
  const { data: turns } = await db.from('ask_turns').select('id, conversation_id, reply, needs, created_at').in('id', shares.map(x => x.turn_id));
  const T = new Map((turns || []).map(t => [t.id, t]));
  // The question each answer replied to: the 'me' turn just before it in the same conversation.
  const convIds = [...new Set((turns || []).map(t => t.conversation_id))];
  const { data: qs } = convIds.length ? await db.from('ask_turns').select('conversation_id, text, created_at').in('conversation_id', convIds).eq('role', 'me').limit(2000) : { data: [] as any[] };
  const { data: from } = await db.from('users').select('id, name').in('id', [...new Set(shares.map(x => x.from_user))]).limit(50);
  const name = new Map((from || []).map(u => [u.id, u.name || 'A colleague']));
  return shares.flatMap(x => {
    const t = T.get(x.turn_id);
    const reply = t ? readReply(t.reply) : null;
    if (!t || !reply) return [];
    const q = (qs || []).filter(r => r.conversation_id === t.conversation_id && r.created_at < t.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const ok = canSeeAll(t.needs || [], viewer, x.from_user);
    return [{ id: x.id, turnId: x.turn_id, from: name.get(x.from_user) || 'A colleague', note: x.note, at: x.created_at, seen: !!x.seen_at, question: q?.text || '', reply: ok ? reply : blankReply(reply), hidden: !ok }];
  });
}

export async function markSharesSeen(db: SupabaseClient, userId: string) {
  await db.from('ask_shares').update({ seen_at: new Date().toISOString() }).eq('to_user', userId).is('seen_at', null);
}
