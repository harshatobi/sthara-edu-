import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate, schoolAccessBlock } from '@/lib/settings/server';
import { askSchoolOS } from '@/lib/parent/askServer';
import { toWhatsAppText } from '@/lib/parent/ask';
import { parentPost, MessageError } from '@/lib/parent/messages';
import { linkUsable } from './config';
import { sendWhatsApp } from './send';

const HISTORY_MS = 24 * 3600_000;

const HELP = `This is your child's school on Sthara. Ask anything about schoolwork, progress, wellbeing or fees, in any language.\n\nReply STOP to pause messages, START to resume.`;

/**
 * One inbound WhatsApp text from a parent: link check, commands (STOP / START / HELP /
 * SEND / a numbered option), then Ask the School OS with the recent conversation.
 * Runs after the webhook has already answered Meta.
 */
export async function handleInbound(db: SupabaseClient, msg: { from: string; text: string; id: string | null }) {
  const phone = `+${msg.from.replace(/\D/g, '')}`;
  const text = msg.text.trim().slice(0, 2000);
  const { data: logged, error: logErr } = await db.from('whatsapp_log').insert({
    direction: 'in', phone_e164: phone, kind: 'ask', body: text || '(non-text message)', status: 'received', provider_id: msg.id,
  }).select('id').single();
  if (logErr) {
    if (logErr.code === '23505') return; // a webhook retry of a message already handled
    console.error('[whatsapp in] log:', logErr.message);
  }
  const mark = (patch: Record<string, unknown>) => (logged ? db.from('whatsapp_log').update(patch).eq('id', logged.id) : Promise.resolve());

  const { data: link } = await db.from('whatsapp_links').select('*').eq('phone_e164', phone).not('verified_at', 'is', null).maybeSingle();
  if (!link || !linkUsable(link)) {
    await mark({ status: 'ignored' });
    // Answer an unknown number at most once a day.
    const { data: recent } = await db.from('whatsapp_log').select('id').eq('phone_e164', phone).eq('direction', 'out').eq('kind', 'system')
      .gte('created_at', new Date(Date.now() - HISTORY_MS).toISOString()).limit(1);
    if (!recent?.length) {
      await sendWhatsApp(db, { to: phone, kind: 'system', body: 'This number isn’t linked to a Sthara parent account. Sign in to the parent portal and open Settings > WhatsApp to link it.' });
    }
    return;
  }
  const { data: parent } = await db.from('users').select('id, name, role, school_id').eq('id', link.user_id).maybeSingle();
  if (!parent || parent.role !== 'parent' || !parent.school_id) { await mark({ status: 'ignored' }); return; }
  await mark({ user_id: parent.id, school_id: parent.school_id });
  const reply = (body: string, kind: 'answer' | 'system' | 'message' = 'system', meta: Record<string, unknown> = {}) =>
    sendWhatsApp(db, { to: phone, userId: parent.id, schoolId: parent.school_id, kind, body, meta });

  const command = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (['STOP', 'UNSUBSCRIBE', 'STOPALL'].includes(command)) {
    await db.from('whatsapp_links').update({ opted_in: false, updated_at: new Date().toISOString() }).eq('user_id', parent.id);
    await reply('Paused. You won’t get school updates here until you reply START. You can still ask questions any time.');
    return;
  }
  if (command === 'START') {
    await db.from('whatsapp_links').update({ opted_in: true, updated_at: new Date().toISOString() }).eq('user_id', parent.id);
    await reply('Welcome back. School updates are on again.');
    return;
  }
  if (command === 'HELP' || !text) { await reply(HELP); return; }

  const blocked = await schoolAccessBlock('parent', parent.school_id, db);
  if (blocked) { await reply('Your school’s Sthara account is paused right now. Please contact the school office.'); return; }
  if (!checkRateLimit(`wa-in:${parent.id}`, ...limitOf('whatsappInbound')).allowed) {
    await reply('That’s a lot of questions in a short time. Give me a few minutes and ask again.');
    return;
  }

  // The last thing we said: its numbered options and any message draft awaiting SEND.
  const { data: last } = await db.from('whatsapp_log').select('meta, created_at').eq('user_id', parent.id).eq('direction', 'out')
    .in('kind', ['answer', 'system']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const lastMeta = (last?.meta || {}) as { options?: string[]; draft?: any };

  if (command === 'SEND' && lastMeta.draft) {
    const d = lastMeta.draft;
    try {
      await parentPost(db, { id: parent.id, name: parent.name, schoolId: parent.school_id }, {
        childId: d.childId, audience: d.audience, staffId: d.to, topic: d.topic, subject: d.subject, body: d.draft, channel: 'whatsapp',
      });
      await reply(`Sent to ${d.toName}. Their reply will come to you here and in the parent portal.`, 'message');
    } catch (e: any) {
      await reply(e instanceof MessageError ? `I couldn’t send that: ${e.message}` : 'I couldn’t send that just now. Please try again in the portal under Messages.');
    }
    return;
  }

  let question = text;
  const n = /^\s*(\d)\s*[.)]?\s*$/.exec(text);
  if (n && lastMeta.options?.[Number(n[1]) - 1]) question = lastMeta.options[Number(n[1]) - 1];

  const gate = await aiGate(parent.id);
  if (gate) { await reply('Answers are paused for a short while. Please try again later, or message the school from the parent portal.'); return; }

  // Recent conversation on this channel (last 24 hours), oldest first.
  const { data: hist } = await db.from('whatsapp_log').select('direction, kind, body, created_at').eq('user_id', parent.id)
    .in('kind', ['ask', 'answer']).gte('created_at', new Date(Date.now() - HISTORY_MS).toISOString())
    .order('created_at', { ascending: false }).limit(11);
  const history = (hist || []).filter(h => h.direction === 'out' || h.body !== text).reverse()
    .map(h => ({ role: h.direction === 'in' ? 'parent' as const : 'os' as const, text: h.body }));
  try {
    const { reply: r } = await askSchoolOS(db, { id: parent.id, name: parent.name, schoolId: parent.school_id }, [...history, { role: 'parent', text: question }], 'whatsapp');
    const { text: out, options } = toWhatsAppText(r);
    const draft = r.actions.find(a => a.kind === 'message');
    await reply(out, 'answer', { options, draft: draft ?? null });
  } catch (e: any) {
    console.error('[whatsapp in] ask:', e?.message);
    await reply('Sorry, I couldn’t answer that just now. Try again in a minute, or open the parent portal.');
  }
}
