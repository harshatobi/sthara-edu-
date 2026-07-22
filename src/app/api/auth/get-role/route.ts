import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/get-role
 * Body: { accessToken: string }
 * Returns: { role: string } or { error: string }
 * Verifies Supabase JWT and looks up role from users table.
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify the Supabase JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = user.id;

    // Look up role from users table
    const { data: userData, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', uid)
      .single();

    if (error || !userData?.role) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ role: userData.role });
  } catch (err: any) {
    console.error('[get-role] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
