import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate, schoolAccessBlock } from '@/lib/settings/server';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { callerById, isLeadership, type FeedCaller } from '@/lib/feed/access';
import { acknowledgeSituation } from '@/lib/feed/ack';
import { classRoster, RegisterError, saveRegister } from '@/lib/feed/attendance';
import { istDay, DAY_MS } from '@/lib/feed/rules';
import { staffPost, MessageError } from '@/lib/parent/messages';
import { accessOf } from '@/lib/admin/serverAuth';
import { displayClass } from '@/lib/teacher/scope';
import { askStaffOS, staffRoleOf } from './askServer';
import { toWhatsAppText } from './ask';
import { parseStaffCommand, resolveRegister } from './commands';
import { buildDigest, maybeSendDigest } from './digest';

const HISTORY_MS = 24 * 3600_000;

const HELP: Record<'teacher' | 'leadership', string> = {
  teacher: `Sthara on WhatsApp. Ask anything about your classes, or:\n• *ACK* (and a note) to acknowledge the last alert\n• *R* then your answer to reply to the last parent message\n• *ABSENT 4, 12* (roll numbers) or *ALL PRESENT* to mark today's register\n• *TODAY* for your digest\n\nReply STOP to pause, START to resume.`,
  leadership: `Sthara on WhatsApp. Ask anything about the school, or:\n• *ACK* (and a note) to acknowledge the last escalation\n• *R* then your answer to reply to the last parent message\n• *TODAY* for the school digest\n\nReply STOP to pause, START to resume.`,
};

/** The most recent thing we sent this person that carries a given kind of context (last 7 days). */
async function lastContext(db: SupabaseClient, userId: string) {
  const { data } = await db.from('whatsapp_log').select('meta, kind, created_at').eq('user_id', userId).eq('direction', 'out')
    .in('kind', ['answer', 'system', 'notify', 'message']).gte('created_at', new Date(Date.now() - 7 * DAY_MS).toISOString())
    .order('created_at', { ascending: false }).limit(25);
  const rows = (data || []).map(r => ({ ...r, meta: (r.meta || {}) as Record<string, any> }));
  const within = (r: { created_at: string }, ms: number) => Date.now() - Date.parse(r.created_at) < ms;
  return {
    /** Numbered options offered in the very last message. */
    options: (rows[0]?.meta.options as string[] | undefined) ?? [],
    /** A reply the School OS drafted in the last message, awaiting SEND. */
    draft: rows[0]?.meta.replyDraft as { threadId: string; draft: string; toName: string } | undefined,
    /** What ACK refers to: an ack the School OS proposed, else the latest alert (48 h). */
    ack: (rows[0]?.meta.ack as { situationId: string; note?: string } | undefined)
      ?? (() => { const r = rows.find(x => x.meta.situationId && within(x, 2 * DAY_MS)); return r ? { situationId: r.meta.situationId as string } : undefined; })(),
    /** The last parent message we forwarded (R replies to it). */
    thread: rows.find(x => x.meta.threadId && x.meta.type === 'parent_message')?.meta.threadId as string | undefined,
  };
}

async function mayReply(db: SupabaseClient, me: FeedCaller, threadId: string): Promise<boolean> {
  const { data: t } = await db.from('school_threads').select('staff_id, school_id').eq('id', threadId).maybeSingle();
  if (!t || t.school_id !== me.schoolId) return false;
  if (me.role === 'teacher') return t.staff_id === me.id;
  return (await accessOf(db, me.id, me.schoolId)).can('messages.office');
}

/**
 * One inbound WhatsApp text from a teacher or school leader (the number is already
 * verified and belongs to `userId`). Runs after the webhook answered Meta.
 */
export async function handleStaffInbound(db: SupabaseClient, userId: string, phone: string, text: string, mark: (p: Record<string, unknown>) => unknown) {
  const me = await callerById(db, userId);
  const role = me ? staffRoleOf(me) : null;
  if (!me || !role) { await mark({ status: 'ignored' }); return; }
  await mark({ user_id: me.id, school_id: me.schoolId });
  const reply = (body: string, kind: 'answer' | 'system' | 'message' = 'system', meta: Record<string, unknown> = {}) =>
    sendWhatsApp(db, { to: phone, userId: me.id, schoolId: me.schoolId, kind, body, meta });

  const cmd = parseStaffCommand(text);
  if (cmd.kind === 'stop') {
    await db.from('whatsapp_links').update({ opted_in: false, updated_at: new Date().toISOString() }).eq('user_id', me.id);
    await reply('Paused. No alerts, parent messages or digests here until you reply START. You can still ask questions.');
    return;
  }
  if (cmd.kind === 'start') {
    await db.from('whatsapp_links').update({ opted_in: true, updated_at: new Date().toISOString() }).eq('user_id', me.id);
    await reply('Welcome back. Alerts, parent messages and your digest are on again.');
    return;
  }
  if (cmd.kind === 'help') { await reply(HELP[role]); return; }

  const blocked = await schoolAccessBlock(me.role, me.schoolId, db);
  if (blocked) { await reply('Your school’s Sthara account is paused right now. Please contact the school office.'); return; }
  if (!checkRateLimit(`wa-in:${me.id}`, ...limitOf('whatsappInbound')).allowed) {
    await reply('That’s a lot of messages in a short time. Give me a few minutes and try again.');
    return;
  }

  if (cmd.kind === 'today') {
    const d = await buildDigest(db, me);
    await sendWhatsApp(db, { to: phone, userId: me.id, schoolId: me.schoolId, kind: 'notify', body: d.text, meta: { digest: istDay(), options: d.options } });
    return;
  }
  // First message of the day: the digest comes first (it is skipped if already sent today).
  await maybeSendDigest(db, me);

  const ctx = await lastContext(db, me.id);

  if (cmd.kind === 'ack') {
    if (!ctx.ack) { await reply('There’s no recent alert to acknowledge. Open the Situational Feed, or ask me “what needs me today?”.'); return; }
    const r = await acknowledgeSituation(db, me, ctx.ack.situationId, cmd.note || ctx.ack.note);
    await reply(!r.ok ? `I couldn’t acknowledge that: ${r.error}` : r.already ? `Already acknowledged: “${r.title}”.` : `Acknowledged: “${r.title}”${cmd.note ? ` with your note` : ''}.`);
    return;
  }

  if (cmd.kind === 'send' || cmd.kind === 'reply') {
    const threadId = cmd.kind === 'send' ? ctx.draft?.threadId : ctx.thread;
    const body = cmd.kind === 'send' ? ctx.draft?.draft : cmd.text;
    if (!threadId || !body) {
      await reply(cmd.kind === 'send' ? 'There’s nothing waiting to send.' : 'There’s no recent parent message to reply to here. Open Parent Messages, or ask me which parents are waiting.');
      return;
    }
    if (!(await mayReply(db, me, threadId))) { await reply('That conversation isn’t yours to answer.'); return; }
    try {
      await staffPost(db, { id: me.id, name: me.name, role: me.role, schoolId: me.schoolId }, threadId, body, 'whatsapp');
      await reply(`Sent${ctx.draft && cmd.kind === 'send' ? ` to ${ctx.draft.toName}` : ''}. It’s in the conversation in Parent Messages too.`, 'message');
    } catch (e: any) {
      await reply(e instanceof MessageError ? `I couldn’t send that: ${e.message}` : 'I couldn’t send that just now. Try again, or reply from Parent Messages.');
    }
    return;
  }

  if (cmd.kind === 'register') {
    if (me.role !== 'teacher' || !me.classTeacherOf) { await reply('Registers are marked by class teachers. Open Attendance in Sthara if you cover a class without one.'); return; }
    const cls = displayClass(me.classTeacherOf);
    const roster = await classRoster(db, me.schoolId, cls);
    if (!roster.length) { await reply(`There are no students in ${cls} yet.`); return; }
    const r = resolveRegister(roster, cmd);
    if (r.unknown.length) {
      await reply(`I couldn’t find ${r.unknown.map(u => `“${u}”`).join(', ')} in ${cls}, so nothing is saved. Use roll numbers, e.g. ABSENT 4, 12. Roll numbers here: ${roster.slice(0, 40).map(s => `${s.rollNo || '?'} ${s.name.split(' ')[0]}`).join(', ')}${roster.length > 40 ? '…' : ''}`);
      return;
    }
    try {
      const saved = await saveRegister(db, me, cls, istDay(), r.marks);
      const by = (k: string) => r.named.filter(s => s.status === k).map(s => `${s.name}${s.rollNo ? ` (${s.rollNo})` : ''}`);
      const parts = [by('absent').length ? `absent: ${by('absent').join(', ')}` : '', by('late').length ? `late: ${by('late').join(', ')}` : '', by('excused').length ? `excused: ${by('excused').join(', ')}` : ''].filter(Boolean);
      await reply(`${cls} register saved for today: ${saved.counts.present || 0} present${parts.length ? `; ${parts.join('; ')}` : ''}.${saved.raised ? ` ${saved.raised} new item${saved.raised === 1 ? '' : 's'} in the feed (absence streak or missed quiz).` : ''}\nSend another ABSENT … to correct it.`);
    } catch (e: any) {
      await reply(e instanceof RegisterError ? `I couldn’t save the register: ${e.message}` : 'I couldn’t save the register just now. Try again, or use Attendance in Sthara.');
    }
    return;
  }

  let question = cmd.kind === 'ask' ? cmd.text : '';
  if (cmd.kind === 'option') question = ctx.options[cmd.n - 1] ?? text;

  const gate = await aiGate(me.id);
  if (gate) { await reply('Answers are paused for a short while. Please try again later.'); return; }
  const { data: hist } = await db.from('whatsapp_log').select('direction, kind, body').eq('user_id', me.id)
    .in('kind', ['ask', 'answer']).gte('created_at', new Date(Date.now() - HISTORY_MS).toISOString())
    .order('created_at', { ascending: false }).limit(11);
  const history = (hist || []).filter(h => h.direction === 'out' || h.body !== text).reverse()
    .map(h => ({ role: h.direction === 'in' ? 'me' as const : 'os' as const, text: h.body }));
  try {
    const r = await askStaffOS(db, me, [...history, { role: 'me', text: question }], 'whatsapp');
    const { text: out, options } = toWhatsAppText(r);
    const rep = r.actions.find(a => a.kind === 'reply');
    const ack = r.actions.find(a => a.kind === 'ack');
    await reply(out, 'answer', {
      options,
      replyDraft: rep && rep.kind === 'reply' ? { threadId: rep.threadId, draft: rep.draft, toName: rep.toName } : null,
      ack: !rep && ack && ack.kind === 'ack' ? { situationId: ack.situationId, note: ack.note } : null,
    });
  } catch (e: any) {
    console.error('[whatsapp staff] ask:', e?.message);
    await reply(isLeadership(me) || me.role === 'teacher' ? 'Sorry, I couldn’t answer that just now. Try again in a minute.' : HELP.teacher);
  }
}
