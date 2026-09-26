import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { getPlatformSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboard — self-serve school registration.
 *
 * Runs server-side because the database no longer lets a browser create
 * schools or user rows (account safety, migration 20260923120000). Trial terms
 * and plan are set here, never taken from the request. The admin login is
 * created with a normal sign-up so the project's email-confirmation setting
 * still applies; if any later step fails, that login is removed again.
 */
const CURRICULA = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge IGCSE', 'Other'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function schoolCode(name: string): string {
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
}

export async function POST(req: NextRequest) {
  // Operators can close self-serve sign-up from the console (platform setting onboarding.self_serve).
  const platform = await getPlatformSettings();
  if (!platform['onboarding.self_serve']) {
    return NextResponse.json({ error: 'New school sign-up is by invitation right now. Write to us from www.sthara.in/contact and we will set your school up.' }, { status: 403 });
  }
  const rl = checkRateLimit(`onboard:${getClientIp(req)}`, ...limitOf('onboard'));
  if (!rl.allowed) return NextResponse.json({ error: 'Too many registrations from this network. Try again later.' }, { status: 429 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const schoolName = str(b?.schoolName, 120);
  const curriculum = CURRICULA.includes(b?.curriculum) ? b.curriculum : 'Other';
  const adminName = str(b?.adminName, 120);
  const adminEmail = str(b?.adminEmail, 200).toLowerCase();
  const adminPassword = typeof b?.adminPassword === 'string' ? b.adminPassword : '';
  if (!schoolName || !adminName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return NextResponse.json({ error: 'School name, admin name and a valid email are required.' }, { status: 400 });
  }
  if (adminPassword.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const admin = createAdminClient();

  // Unique school code (settings->>code).
  let code = schoolCode(schoolName);
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from('schools').select('id').eq('settings->>code', code).maybeSingle();
    if (!data) break;
    code = schoolCode(schoolName);
  }

  // 1. Admin login, via normal sign-up (respects email confirmation settings).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return NextResponse.json({ error: 'Registration is not configured on this server.' }, { status: 500 });
  const pub = createSupabaseClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signUp, error: signUpErr } = await pub.auth.signUp({
    email: adminEmail, password: adminPassword, options: { data: { name: adminName, role: 'admin' } },
  });
  const uid = signUp?.user?.id;
  // Supabase returns a user with no identities when the email already exists (to avoid enumeration).
  if (signUpErr || !uid || (signUp.user?.identities && signUp.user.identities.length === 0)) {
    const taken = !signUpErr && signUp.user?.identities?.length === 0;
    return NextResponse.json({ error: taken ? 'This email is already registered with another account.' : (signUpErr?.message || 'Could not create the admin account.') }, { status: taken ? 409 : 400 });
  }

  // 2. School + admin profile, server-set trial terms. Roll back the login on failure.
  const { data: school, error: schoolErr } = await admin.from('schools').insert({
    name: schoolName,
    institution_type: 'school',
    trial_expires_at: new Date(Date.now() + platform['trial.default_days'] * 86_400_000).toISOString(),
    settings: {
      code, curriculum,
      board: str(b?.board, 60) || null,
      city: str(b?.city, 80),
      phone: str(b?.phone, 30) || null,
      website: str(b?.website, 200) || null,
      adminEmail, adminUid: uid,
      plan: 'pilot', active: true,
    },
  }).select('id').single();

  const { error: userErr } = school
    ? await admin.from('users').insert({ id: uid, school_id: school.id, name: adminName, email: adminEmail, role: 'admin' })
    : { error: schoolErr };

  if (schoolErr || userErr) {
    if (school) await admin.from('schools').delete().eq('id', school.id);
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    console.error('[onboard] rollback:', (schoolErr || userErr)?.message);
    return NextResponse.json({ error: 'Registration failed. Nothing was saved; please try again.' }, { status: 500 });
  }

  return NextResponse.json({ schoolCode: code, needsEmailConfirmation: !signUp.session });
}
