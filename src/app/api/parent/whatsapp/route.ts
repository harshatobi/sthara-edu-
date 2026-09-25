import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomInt } from 'node:crypto';
import { requireParent } from '@/lib/parent/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { maskPhone, toE164, whatsappConfig } from '@/lib/whatsapp/config';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

const OTP_MINUTES = 10;
const PREF_KEYS = ['grades', 'homework_due', 'alerts', 'fees', 'messages'] as const;
const hashOf = (userId: string, phone: string, code: string) =>
  createHash('sha256').update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || 'sthara'}:${userId}:${phone}:${code}`).digest('hex');
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/parent/whatsapp
 *   { action: 'start', phone, consent: true }   send a 6-digit code to the number
 *   { action: 'verify', code }                 confirm it: the number is linked and opted in
 *   { action: 'prefs', prefs: {...} }          which updates to push
 *   { action: 'optin' | 'optout' }             pause / resume everything
 * DELETE /api/parent/whatsapp                  unlink the number
 */
export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  const b = await req.json().catch(() => ({}));
  const cfg = whatsappConfig();

  if (b?.action === 'start') {
    if (!checkRateLimit(`wa-link:${parent.id}`, ...limitOf('whatsappLink')).allowed) return bad('Too many codes requested. Try again in 15 minutes.', 429);
    if (b.consent !== true) return bad('Tick the box to agree to receive school messages on WhatsApp.');
    const phone = toE164(b.phone);
    if (!phone) return bad('Enter a valid mobile number, e.g. 98765 43210 or +44 7700 900123.');
    const { data: taken } = await db.from('whatsapp_links').select('user_id').eq('phone_e164', phone).not('verified_at', 'is', null).neq('user_id', parent.id).maybeSingle();
    if (taken) return bad('That number is already linked to another parent account. Ask the school office if this is a mistake.', 409);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { error } = await db.from('whatsapp_links').upsert({
      user_id: parent.id, school_id: parent.schoolId, phone_e164: phone, opted_in: false, verified_at: null, verified_mode: null,
      otp_hash: hashOf(parent.id, phone, code), otp_expires_at: new Date(Date.now() + OTP_MINUTES * 60_000).toISOString(), otp_attempts: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) { console.error('[whatsapp link]', error.message); return bad('WhatsApp linking isn’t available yet.', 500); }
    const sent = await sendWhatsApp(db, {
      to: phone, userId: parent.id, schoolId: parent.schoolId, kind: 'otp', otpCode: code,
      body: `${code} is your Sthara verification code. It expires in ${OTP_MINUTES} minutes. Don't share it.`,
    });
    if (!sent.ok) return bad('We couldn’t reach that number on WhatsApp. Check it and try again.', 502);
    return NextResponse.json({
      sent: true, phone: maskPhone(phone), expiresInMin: OTP_MINUTES,
      // No delivery happens while the channel is simulated, so the code is returned to finish the flow.
      ...(cfg.mode === 'simulated' ? { simulated: true, testCode: code } : {}),
    });
  }

  const { data: link } = await db.from('whatsapp_links').select('*').eq('user_id', parent.id).maybeSingle();
  if (!link) return bad('Link a WhatsApp number first.', 404);

  if (b?.action === 'verify') {
    const code = typeof b.code === 'string' ? b.code.replace(/\D/g, '') : '';
    if (!link.otp_hash || !link.otp_expires_at || new Date(link.otp_expires_at).getTime() < Date.now()) return bad('That code has expired. Send a new one.', 410);
    if (link.otp_attempts >= 5) return bad('Too many wrong codes. Send a new one.', 429);
    if (code.length !== 6 || hashOf(parent.id, link.phone_e164, code) !== link.otp_hash) {
      await db.from('whatsapp_links').update({ otp_attempts: link.otp_attempts + 1 }).eq('user_id', parent.id);
      return bad('That code isn’t right. Check the latest message and try again.');
    }
    const { error } = await db.from('whatsapp_links').update({
      verified_at: new Date().toISOString(), verified_mode: cfg.mode, opted_in: true, otp_hash: null, otp_expires_at: null, otp_attempts: 0, updated_at: new Date().toISOString(),
    }).eq('user_id', parent.id);
    if (error) return bad(error.code === '23505' ? 'That number was just linked to another account.' : 'Could not link the number.', error.code === '23505' ? 409 : 500);
    await sendWhatsApp(db, {
      to: link.phone_e164, userId: parent.id, schoolId: parent.schoolId, kind: 'system',
      body: `You're connected to your child's school on Sthara.\n\nAsk me anything, for example:\n1. How is my child doing this week?\n2. What homework is due?\n3. Are any fees due?\n\nI'll also send grades, alerts and replies from teachers here. Reply STOP at any time to pause.`,
      meta: { options: ['How is my child doing this week?', 'What homework is due?', 'Are any fees due?'] },
    });
    return NextResponse.json({ linked: true, phone: maskPhone(link.phone_e164), mode: cfg.mode });
  }

  if (b?.action === 'prefs') {
    const prefs: Record<string, boolean> = { ...(link.prefs || {}) };
    for (const k of PREF_KEYS) if (typeof b?.prefs?.[k] === 'boolean') prefs[k] = b.prefs[k];
    await db.from('whatsapp_links').update({ prefs, updated_at: new Date().toISOString() }).eq('user_id', parent.id);
    return NextResponse.json({ prefs });
  }

  if (b?.action === 'optin' || b?.action === 'optout') {
    if (!link.verified_at) return bad('Verify the number first.');
    await db.from('whatsapp_links').update({ opted_in: b.action === 'optin', updated_at: new Date().toISOString() }).eq('user_id', parent.id);
    return NextResponse.json({ optedIn: b.action === 'optin' });
  }
  return bad('Unknown action.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  await auth.db.from('whatsapp_links').delete().eq('user_id', auth.parent.id);
  return NextResponse.json({ unlinked: true });
}
