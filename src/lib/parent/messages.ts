import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normClass } from '@/lib/teacher/scope';
import { accessOf } from '@/lib/admin/serverAuth';
import { TOPICS, TOPIC_LABEL, type Topic } from './ask';
import { guardianOf, type ParentCaller } from './serverAuth';
import { notifyGuardians } from './notify';

export class MessageError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** Does this teacher teach (or class-teach) this child's class? */
async function teachesChild(db: SupabaseClient, staffId: string, schoolId: string, cls: string): Promise<boolean> {
  const { data: t } = await db.from('users').select('role, school_id, teacher_class, assignments').eq('id', staffId).maybeSingle();
  if (!t || t.role !== 'teacher' || t.school_id !== schoolId) return false;
  if (t.teacher_class && normClass(t.teacher_class) === normClass(cls)) return true;
  return (Array.isArray(t.assignments) ? t.assignments : []).some((a: any) => a && normClass(a.class) === normClass(cls));
}

/**
 * A parent writes to the school: a new conversation (childId + audience + staffId + topic + subject)
 * or a reply in one they already have (threadId). Everything is checked against the database.
 */
export async function parentPost(db: SupabaseClient, parent: ParentCaller, input: {
  threadId?: unknown; childId?: unknown; audience?: unknown; staffId?: unknown; topic?: unknown; subject?: unknown; body: unknown;
  channel: 'web' | 'whatsapp';
}): Promise<{ threadId: string; created: boolean }> {
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 4000) : '';
  if (!body) throw new MessageError('Write a message first.');
  let thread: any;
  let created = false;
  if (input.threadId) {
    if (!isUuid(input.threadId)) throw new MessageError('Unknown conversation.', 404);
    const { data } = await db.from('school_threads').select('*').eq('id', input.threadId).eq('parent_id', parent.id).maybeSingle();
    if (!data || !(await guardianOf(db, parent.id, data.student_id))) throw new MessageError('Unknown conversation.', 404);
    thread = data;
    if (thread.status === 'closed') await db.from('school_threads').update({ status: 'open' }).eq('id', thread.id);
  } else {
    if (!isUuid(input.childId) || !(await guardianOf(db, parent.id, input.childId))) throw new MessageError('Choose one of your children.', 403);
    const { data: child } = await db.from('users').select('id, name, student_class, school_id').eq('id', input.childId).maybeSingle();
    if (!child || child.school_id !== parent.schoolId) throw new MessageError('Choose one of your children.', 403);
    const audience = input.audience === 'office' ? 'office' : 'teacher';
    let staffId: string | null = null;
    if (audience === 'teacher') {
      if (!isUuid(input.staffId) || !(await teachesChild(db, input.staffId, parent.schoolId, child.student_class || ''))) {
        throw new MessageError(`Choose one of ${child.name?.split(' ')[0] || 'your child'}'s teachers.`, 403);
      }
      staffId = input.staffId;
    }
    const topic: Topic = (TOPICS as readonly string[]).includes(input.topic as string) ? (input.topic as Topic) : 'general';
    const subject = (typeof input.subject === 'string' ? input.subject.trim().slice(0, 160) : '') || TOPIC_LABEL[topic];
    const { data, error } = await db.from('school_threads').insert({
      school_id: parent.schoolId, student_id: child.id, parent_id: parent.id, staff_id: staffId, audience, subject, topic,
    }).select('*').single();
    if (error || !data) { console.error('[messages] thread insert:', error?.message); throw new MessageError('Could not start the conversation.', 500); }
    thread = data;
    created = true;
  }
  const now = new Date().toISOString();
  const { error: mErr } = await db.from('school_messages').insert({
    thread_id: thread.id, school_id: thread.school_id, sender_id: parent.id, sender_role: 'parent', body, channel: input.channel,
  });
  if (mErr) { console.error('[messages] insert:', mErr.message); throw new MessageError('Could not send the message.', 500); }
  await db.from('school_threads').update({ last_message_at: now, parent_read_at: now }).eq('id', thread.id);

  // Tell the recipient(s) in the app.
  const { data: child } = await db.from('users').select('name, student_class').eq('id', thread.student_id).maybeSingle();
  let to: string[] = thread.staff_id ? [thread.staff_id] : [];
  if (!thread.staff_id) {
    const { data: admins } = await db.from('users').select('id').eq('school_id', thread.school_id).eq('role', 'admin');
    const allowed = await Promise.all((admins || []).map(async a => ((await accessOf(db, a.id, thread.school_id)).can('messages.office') ? a.id : null)));
    to = allowed.filter((x): x is string => !!x);
  }
  if (to.length) {
    const { error } = await db.from('notifications').insert(to.map(uid => ({
      school_id: thread.school_id, user_id: uid, student_id: thread.student_id, type: 'parent_message',
      title: `${parent.name || 'A parent'} (${child?.name || 'student'}, ${child?.student_class || ''})`,
      body: `${thread.subject}: ${body.slice(0, 160)}`, metadata: { threadId: thread.id },
    })));
    if (error) console.warn('[messages] notify staff:', error.message);
  }
  return { threadId: thread.id, created };
}

/** A teacher or school admin answers a parent. */
export async function staffPost(db: SupabaseClient, staff: { id: string; name: string; role: 'teacher' | 'admin'; schoolId: string }, threadId: unknown, rawBody: unknown) {
  const body = typeof rawBody === 'string' ? rawBody.trim().slice(0, 4000) : '';
  if (!body) throw new MessageError('Write a reply first.');
  if (!isUuid(threadId)) throw new MessageError('Unknown conversation.', 404);
  const { data: t } = await db.from('school_threads').select('*').eq('id', threadId).eq('school_id', staff.schoolId).maybeSingle();
  if (!t || (staff.role === 'teacher' && t.staff_id !== staff.id)) throw new MessageError('Unknown conversation.', 404);
  const now = new Date().toISOString();
  const { error } = await db.from('school_messages').insert({ thread_id: t.id, school_id: t.school_id, sender_id: staff.id, sender_role: staff.role, body, channel: 'web' });
  if (error) { console.error('[messages] staff insert:', error.message); throw new MessageError('Could not send the reply.', 500); }
  await db.from('school_threads').update({ last_message_at: now, staff_read_at: now, status: 'open' }).eq('id', t.id);
  const { data: child } = await db.from('users').select('name').eq('id', t.student_id).maybeSingle();
  const first = child?.name?.split(' ')[0] || 'your child';
  await notifyGuardians(db, {
    schoolId: t.school_id, studentId: t.student_id, parentIds: [t.parent_id], pref: 'messages', type: 'school_reply',
    title: `${staff.name} replied: ${t.subject}`, body: body.slice(0, 300), metadata: { threadId: t.id },
    whatsapp: `*${staff.name}* replied about ${first} (${t.subject}):\n\n${body.slice(0, 1200)}\n\nReply here and I'll pass it on, or open Messages in the parent portal.`,
  });
  return { threadId: t.id };
}
