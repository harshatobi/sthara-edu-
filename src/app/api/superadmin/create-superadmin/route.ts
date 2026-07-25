import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/superadmin/create-superadmin
 * Provisions SuperAdmin user account in Supabase Auth & PostgreSQL DB.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();
    const cleanEmail = (email || '').toLowerCase().trim();

    if (!cleanEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let uid = '';

    // 1. Check if user already exists in Supabase Auth
    const { data: usersList } = await supabase.auth.admin.listUsers();
    const existing = (usersList?.users || []).find(u => u.email?.toLowerCase() === cleanEmail);

    if (existing) {
      uid = existing.id;
      // Update password & confirm email
      await supabase.auth.admin.updateUserById(uid, {
        password,
        email_confirm: true,
        user_metadata: { role: 'superadmin', name: name || 'Super Admin' },
      });
    } else {
      // Create brand new user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { role: 'superadmin', name: name || 'Super Admin' },
      });

      if (authError || !authData?.user) {
        return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 400 });
      }
      uid = authData.user.id;
    }

    // 2. Insert/Upsert into `superadmins` table
    await supabase.from('superadmins').upsert({
      id: uid,
      email: cleanEmail,
      name: name || 'Super Admin',
    });

    // 3. Insert/Upsert into `users` table
    await supabase.from('users').upsert({
      id: uid,
      email: cleanEmail,
      name: name || 'Super Admin',
      role: 'superadmin',
      school_id: 'global',
    });

    return NextResponse.json({
      success: true,
      message: `SuperAdmin provisioned successfully for ${cleanEmail}`,
      uid,
    });
  } catch (error: any) {
    console.error('[create-superadmin] error:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
