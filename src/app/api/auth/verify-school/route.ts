import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { normaliseCode, schoolPolicy, type SchoolRow } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/verify-school — the first step of sign-in.
 * Body: { schoolCode }
 * Returns { valid: true, schoolId, name, type } or { valid: false, error }.
 *
 * Looks the code up in schools.settings->>'code'. A suspended school is
 * refused here, before anyone types a password. Rate limited per IP so codes
 * can't be enumerated quickly.
 */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`verify-school:${getClientIp(req)}`, ...limitOf('verifySchool')).allowed) {
    return NextResponse.json({ valid: false, error: 'Too many attempts. Wait a few minutes and try again.' }, { status: 429 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const code = normaliseCode(body?.schoolCode);
    if (code.length < 3) return NextResponse.json({ valid: false, error: 'Enter your school code.' }, { status: 400 });

    const { data, error } = await createAdminClient()
      .from('schools')
      .select('id, name, institution_type, trial_expires_at, settings')
      .eq('settings->>code', code)
      .limit(2);
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ valid: false, error: 'School code not found. Check it with your school office.' });
    if (data.length > 1) {
      console.error('[verify-school] duplicate school code', code);
      return NextResponse.json({ valid: false, error: 'This school code needs attention from Sthara support.' });
    }
    const p = schoolPolicy(data[0] as SchoolRow);
    if (!p.active) return NextResponse.json({ valid: false, error: 'This school’s Sthara account is suspended. Contact your school office.' });
    return NextResponse.json({ valid: true, schoolId: p.id, name: p.name, type: p.institutionType });
  } catch (err) {
    console.error('[verify-school]', err instanceof Error ? err.message : err);
    return NextResponse.json({ valid: false, error: 'We couldn’t check that code. Please try again.' }, { status: 500 });
  }
}
