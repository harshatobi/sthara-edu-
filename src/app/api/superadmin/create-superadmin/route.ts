import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/superadmin/create-superadmin — { email, password, name }
 *
 * Adds another platform operator. Only an existing operator may call it;
 * everyone else gets a 404. It only creates NEW accounts: it never resets the
 * password or role of an existing login (that was an account-takeover path).
 * The first operator is bootstrapped directly in the Supabase dashboard.
 */
export async function POST(request: NextRequest) {
  const operator = await operatorFromRequest(request);
  if (!operator) return notFoundResponse();

  try {
    const { email, password, name } = await request.json();
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || typeof password !== 'string' || password.length < 12) {
      return NextResponse.json({ error: 'Email and a password of at least 12 characters are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing } = await supabase.from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail, password, email_confirm: true,
      user_metadata: { name: name || 'Operator' },
    });
    if (authError || !authData?.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 400 });
    }
    const uid = authData.user.id;

    const { error: rowErr } = await supabase.from('users').insert({ id: uid, email: cleanEmail, name: name || 'Operator', role: 'superadmin', school_id: null });
    if (rowErr) {
      await supabase.auth.admin.deleteUser(uid).catch(() => {});
      return NextResponse.json({ error: 'Could not create the operator profile.' }, { status: 500 });
    }
    await supabase.from('superadmins').insert({ user_id: uid });

    return NextResponse.json({ success: true, uid });
  } catch (error: any) {
    console.error('[create-superadmin] error:', error?.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
