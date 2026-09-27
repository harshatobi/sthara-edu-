import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { linkUsable, maskPhone, toE164, whatsappConfig } from './config';
import { sendWhatsApp } from './send';

/**
 * Linking a WhatsApp number to any Sthara account (parent, teacher, office staff):
 * a 6-digit code on WhatsApp proves the number, then the account is opted in.
 * The same number can belong to one account only.
 */
export type LinkRole = 'parent' | 'teacher' | 'admin';
export interface LinkUser { id: string; schoolId: string; role: LinkRole }

const OTP_MINUTES = 10;

/** What each kind of account can switch on or off. */
export const PREFS: Record<LinkRole, { key: string; label: string; hint: string }[]> = {
  parent: [
    { key: 'grades', label: 'Grades', hint: 'When a teacher confirms a mark' },
    { key: 'alerts', label: 'Learning alerts', hint: 'When a chapter drops into "severe need"' },
    { key: 'messages', label: 'Teacher replies', hint: 'Replies to your messages' },
    { key: 'fees', label: 'Fee reminders', hint: 'Reminders from the fee office' },
  ],
  teacher: [
    { key: 'alerts', label: 'Urgent feed alerts', hint: 'Critical items for your classes; reply ACK to acknowledge' },
    { key: 'messages', label: 'Parent messages', hint: 'Messages from parents; reply R and your answer' },
    { key: 'digest', label: 'Morning digest', hint: 'Your day at a glance, once a day' },
  ],
  admin: [
    { key: 'alerts', label: 'Escalations', hint: 'Items your teachers did not acknowledge in time; reply ACK' },
    { key: 'messages', label: 'Parent messages to the office', hint: 'Reply R and your answer' },
    { key: 'digest', label: 'Morning digest', hint: 'The school at a glance, once a day' },
  ],
};

const WELCOME: Record<LinkRole, { body: string; options: string[] }> = {
  parent: {
    body: `You're connected to your child's school on Sthara.\n\nAsk me anything, for example:\n1. How is my child doing this week?\n2. What homework is due?\n3. Are any fees due?\n\nI'll also send grades, alerts and replies from teachers here. Reply STOP at any time to pause.`,
    options: ['How is my child doing this week?', 'What homework is due?', 'Are any fees due?'],
  },
  teacher: {
    body: `You're connected to Sthara on WhatsApp.\n\nAsk me about your classes, for example:\n1. What needs me today?\n2. Who hasn't submitted this week's homework?\n3. Which students are slipping?\n\nYou can also:\n• *ACK* to acknowledge the last alert (add a note after it)\n• *R* then your answer to reply to the last parent message\n• *ABSENT 4, 12* to mark today's register (everyone else present)\n• *TODAY* for your digest\n\nReply STOP to pause.`,
    options: ['What needs me today?', "Who hasn't submitted this week's homework?", 'Which students are slipping?'],
  },
  admin: {
    body: `You're connected to Sthara on WhatsApp.\n\nAsk me about the school, for example:\n1. What needs my attention today?\n2. How are fee collections this month?\n3. Which classes haven't marked attendance?\n\nYou can also reply *ACK* to acknowledge an escalation, *R* then your answer to reply to a parent, and *TODAY* for the digest. Reply STOP to pause.`,
    options: ['What needs my attention today?', 'How are fee collections this month?', "Which classes haven't marked attendance?"],
  },
};

const hashOf = (userId: string, phone: string, code: string) =>
  createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || 'sthara'}:${userId}:${phone}:${code}`).digest('hex');

export interface LinkStatus {
  mode: 'live' | 'simulated'; businessNumber: string | null; linked: boolean; phone: string | null; optedIn: boolean; pending: boolean;
  prefs: Record<string, boolean>;
}

export async function linkStatus(db: SupabaseClient, userId: string): Promise<LinkStatus> {
  const cfg = whatsappConfig();
  const { data: link } = await db.from('whatsapp_links').select('phone_e164, opted_in, verified_at, verified_mode, otp_expires_at, prefs').eq('user_id', userId).maybeSingle();
  return {
    mode: cfg.mode, businessNumber: cfg.businessNumber, linked: linkUsable(link), phone: link?.phone_e164 ? maskPhone(link.phone_e164) : null,
    optedIn: !!link?.opted_in && linkUsable(link),
    pending: !!link && !link.verified_at && !!link.otp_expires_at && new Date(link.otp_expires_at).getTime() > Date.now(),
    prefs: (link?.prefs as Record<string, boolean>) || {},
  };
}

export class LinkError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

/**
 * One linking step: start (send a code), verify, prefs, optin / optout.
 * Returns the JSON body for the route; throws LinkError with a user-facing message.
 */
export async function linkAction(db: SupabaseClient, user: LinkUser, b: any): Promise<Record<string, unknown>> {
  const cfg = whatsappConfig();
  if (b?.action === 'start') {
    if (!checkRateLimit(`wa-link:${user.id}`, ...limitOf('whatsappLink')).allowed) throw new LinkError('Too many codes requested. Try again in 15 minutes.', 429);
    if (b.consent !== true) throw new LinkError('Tick the box to agree to receive messages on WhatsApp.');
    const phone = toE164(b.phone);
    if (!phone) throw new LinkError('Enter a valid mobile number, e.g. 98765 43210 or +44 7700 900123.');
    const { data: taken } = await db.from('whatsapp_links').select('user_id').eq('phone_e164', phone).not('verified_at', 'is', null).neq('user_id', user.id).maybeSingle();
    if (taken) throw new LinkError('That number is already linked to another Sthara account. Ask the school office if this is a mistake.', 409);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { error } = await db.from('whatsapp_links').upsert({
      user_id: user.id, school_id: user.schoolId, phone_e164: phone, opted_in: false, verified_at: null, verified_mode: null,
      otp_hash: hashOf(user.id, phone, code), otp_expires_at: new Date(Date.now() + OTP_MINUTES * 60_000).toISOString(), otp_attempts: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) { console.error('[whatsapp link]', error.message); throw new LinkError('WhatsApp linking isn’t available yet.', 500); }
    const sent = await sendWhatsApp(db, {
      to: phone, userId: user.id, schoolId: user.schoolId, kind: 'otp', otpCode: code,
      body: `${code} is your Sthara verification code. It expires in ${OTP_MINUTES} minutes. Don't share it.`,
    });
    if (!sent.ok) throw new LinkError('We couldn’t reach that number on WhatsApp. Check it and try again.', 502);
    return {
      sent: true, phone: maskPhone(phone), expiresInMin: OTP_MINUTES,
      // No delivery happens while the channel is simulated, so the code is returned to finish the flow.
      ...(cfg.mode === 'simulated' ? { simulated: true, testCode: code } : {}),
    };
  }

  const { data: link } = await db.from('whatsapp_links').select('*').eq('user_id', user.id).maybeSingle();
  if (!link) throw new LinkError('Link a WhatsApp number first.', 404);

  if (b?.action === 'verify') {
    const code = typeof b.code === 'string' ? b.code.replace(/\D/g, '') : '';
    if (!link.otp_hash || !link.otp_expires_at || new Date(link.otp_expires_at).getTime() < Date.now()) throw new LinkError('That code has expired. Send a new one.', 410);
    if (link.otp_attempts >= 5) throw new LinkError('Too many wrong codes. Send a new one.', 429);
    if (code.length !== 6 || hashOf(user.id, link.phone_e164, code) !== link.otp_hash) {
      await db.from('whatsapp_links').update({ otp_attempts: link.otp_attempts + 1 }).eq('user_id', user.id);
      throw new LinkError('That code isn’t right. Check the latest message and try again.');
    }
    const { error } = await db.from('whatsapp_links').update({
      verified_at: new Date().toISOString(), verified_mode: cfg.mode, opted_in: true, otp_hash: null, otp_expires_at: null, otp_attempts: 0, updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
    if (error) throw new LinkError(error.code === '23505' ? 'That number was just linked to another account.' : 'Could not link the number.', error.code === '23505' ? 409 : 500);
    const w = WELCOME[user.role];
    await sendWhatsApp(db, { to: link.phone_e164, userId: user.id, schoolId: user.schoolId, kind: 'system', body: w.body, meta: { options: w.options } });
    return { linked: true, phone: maskPhone(link.phone_e164), mode: cfg.mode };
  }

  if (b?.action === 'prefs') {
    const prefs: Record<string, boolean> = { ...(link.prefs || {}) };
    for (const { key } of PREFS[user.role]) if (typeof b?.prefs?.[key] === 'boolean') prefs[key] = b.prefs[key];
    await db.from('whatsapp_links').update({ prefs, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    return { prefs };
  }

  if (b?.action === 'optin' || b?.action === 'optout') {
    if (!link.verified_at) throw new LinkError('Verify the number first.');
    await db.from('whatsapp_links').update({ opted_in: b.action === 'optin', updated_at: new Date().toISOString() }).eq('user_id', user.id);
    return { optedIn: b.action === 'optin' };
  }
  throw new LinkError('Unknown action.');
}

export async function unlink(db: SupabaseClient, userId: string) {
  await db.from('whatsapp_links').delete().eq('user_id', userId);
}
