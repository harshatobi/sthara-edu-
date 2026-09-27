import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { fmtDate } from '@/lib/admin/format';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { holdersOf } from '@/lib/schedule/notify';
import { parseAttendanceWord, parseLeaveWord } from './commands';
import { localOf } from './engine';
import { recordPunch } from './server';

const HELP = 'Sthara staff line. Reply:\n• *IN* when you arrive, *OUT* when you leave\n• *LEAVE 12 Oct to 14 Oct reason* (or *LEAVE TOMORROW reason*) to ask for leave\n• *STOP* to stop these messages';

/**
 * WhatsApp from a register member with no login who agreed to it (their register number): check in and out,
 * and ask for leave (the office approves it). Anything else gets the help text; STOP withdraws their consent.
 */
export async function handleRegisterInbound(db: SupabaseClient, m: { id: string; school_id: string; name: string }, phone: string, text: string, mark: (p: Record<string, unknown>) => unknown) {
  await mark({ school_id: m.school_id, meta: { staffMemberId: m.id } });
  const reply = (body: string) => sendWhatsApp(db, { to: phone, schoolId: m.school_id, kind: 'system', body, meta: { staffMemberId: m.id } });
  if (!checkRateLimit(`wa-reg:${m.id}`, ...limitOf('whatsappInbound')).allowed) { await reply('That’s a lot of messages. Try again in a few minutes.'); return; }
  const t = text.trim();
  if (/^stop$/i.test(t)) {
    await db.from('staff_members').update({ whatsapp_opt_in: false, updated_at: new Date().toISOString() }).eq('id', m.id);
    await reply('Stopped. You won’t get messages from the school here. Ask the office to switch them back on.');
    return;
  }
  const word = parseAttendanceWord(t);
  if (word) {
    const { error } = await recordPunch(db, { schoolId: m.school_id, userId: null, staffMemberId: m.id, direction: word.kind === 'check_in' ? 'in' : 'out', source: 'whatsapp', onCampus: null });
    const at = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    await reply(error ? 'I couldn’t record that. Please tell the office.' : word.kind === 'check_in' ? `Checked in at ${at}, ${m.name.split(' ')[0]}.` : `Checked out at ${at}.`);
    return;
  }
  const today = localOf(Date.now()).date;
  const leave = parseLeaveWord(t, today);
  if (leave?.kind === 'leave') {
    const { data: clash } = await db.from('leave_requests').select('id').eq('staff_member_id', m.id).in('status', ['pending', 'approved']).lte('from_date', leave.to).gte('to_date', leave.from).limit(1);
    if (clash?.length) { await reply('You already have leave on some of those days. Call the office to change it.'); return; }
    const { error } = await db.from('leave_requests').insert({
      school_id: m.school_id, staff_id: null, staff_member_id: m.id, leave_type: 'casual', from_date: leave.from, to_date: leave.to, half_day: false,
      reason: leave.reason, source: 'whatsapp',
    });
    if (error) { console.warn('[wa leave]', error.message); await reply('I couldn’t save that. Please tell the office.'); return; }
    const hr = await holdersOf(db, m.school_id, 'leave.approve');
    if (hr.length) {
      await db.from('notifications').insert(hr.map(id => ({ school_id: m.school_id, user_id: id, type: 'leave', title: 'Leave request on WhatsApp',
        body: `${m.name} asked for leave ${fmtDate(leave.from, true)}${leave.to !== leave.from ? ` to ${fmtDate(leave.to, true)}` : ''}: "${leave.reason}". Decide it in Staff & Leave.`, metadata: { staffMemberId: m.id } })));
    }
    await reply(`Leave asked for ${fmtDate(leave.from, true)}${leave.to !== leave.from ? ` to ${fmtDate(leave.to, true)}` : ''}. The office will reply once it's decided.`);
    return;
  }
  await reply(leave?.kind === 'leave_help' ? 'Send it like this: *LEAVE 12 Oct to 14 Oct reason*, or *LEAVE TOMORROW reason*.' : HELP);
}
