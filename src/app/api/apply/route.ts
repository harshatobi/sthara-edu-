import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import {
  codeSignIn, endSession, familyAction, otpStart, otpVerify, readSession, schoolByCode, SESSION_COOKIE, whoLabel,
} from '@/lib/admin/familyServer';

export const dynamic = 'force-dynamic';

/**
 * The school's apply page (/apply/<school code>), for families without a Sthara login (admissions phase 2b).
 * Every body names the school by its code. Signing in sets an httpOnly cookie for this browser (four hours, or until
 * the office ends the access code).
 *   POST { school, action: 'me' }                              the school, and who is signed in with their applications
 *   POST { school, action: 'otp-start', phone, consent }       a code on WhatsApp
 *   POST { school, action: 'otp-verify', phone, code }
 *   POST { school, action: 'code', code }                      an access code from the admissions office
 *   POST { school, action: 'sign-out' }
 *   POST { school, action: 'list' | 'load' | 'create' | 'save' | 'submit' | 'upload-url' | 'upload-done' | 'remove-doc', ... }
 *        the family's own applications (lib/admin/familyServer familyAction)
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`apply:${ip}`, ...limitOf('applyWrite')).allowed) return NextResponse.json({ error: 'Too many requests. Wait a few minutes.' }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const db = createAdminClient();
  const school = await schoolByCode(db, b.school);
  if (!school) return NextResponse.json({ error: 'This apply link isn’t right. Check it with the school.' }, { status: 404 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const err = (r: { error: string; status: number }) => NextResponse.json({ error: r.error }, { status: r.status });
  const signedIn = (r: { token: string; expires: Date }) => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: r.expires });
    return res;
  };

  if (b.action === 'otp-start' || b.action === 'otp-verify' || b.action === 'code') {
    if (!checkRateLimit(`apply-sign-in:${ip}`, ...limitOf('applySignIn')).allowed) {
      return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
    }
    if (b.action === 'otp-start') {
      const r = await otpStart(db, school, b);
      return r.ok ? NextResponse.json(r) : err(r);
    }
    const r = b.action === 'code' ? await codeSignIn(db, school, b.code) : await otpVerify(db, school, b);
    return r.ok ? signedIn(r) : err(r);
  }
  if (b.action === 'sign-out') {
    await endSession(db, token);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const p = await readSession(db, token, school.id);
  if (b.action === 'me') {
    return NextResponse.json({
      school: { name: school.name, code: school.code, open: school.open, note: school.note, phoneSignIn: school.phoneSignIn },
      me: p ? { kind: p.kind, label: whoLabel(p) } : null,
    });
  }
  if (!p) return NextResponse.json({ error: 'Sign in again to carry on.', code: 'signed_out' }, { status: 401 });
  try {
    const r = await familyAction(db, p, school, b);
    return r.ok ? NextResponse.json(r) : err(r);
  } catch (e) {
    console.error('[apply]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
