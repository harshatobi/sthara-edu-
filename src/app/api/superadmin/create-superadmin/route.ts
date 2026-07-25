import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * POST /api/superadmin/create-superadmin
 * Creates a SuperAdmin user account in Supabase Auth and inserts into `superadmins` & `users` tables.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Create or fetch Auth user
    let uid = '';
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { role: 'superadmin', name: name || 'Super Admin' },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        // Fetch existing user ID
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase().trim());
        if (existing) {
          uid = existing.id;
          await supabase.auth.admin.updateUserById(uid, { password });
        } else {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else {
      uid = authData.user.id;
    }

    // 2. Insert into `superadmins` table
    const { error: superadminErr } = await supabase
      .from('superadmins')
      .upsert({ id: uid, email: email.toLowerCase().trim(), name: name || 'Super Admin' });

    if (superadminErr) {
      console.error('[create-superadmin] superadmins insert error:', superadminErr);
    }

    // 3. Insert into `users` table with role='superadmin'
    const { error: userErr } = await supabase
      .from('users')
      .upsert({
        id: uid,
        email: email.toLowerCase().trim(),
        name: name || 'Super Admin',
        role: 'superadmin',
        school_id: 'global',
      });

    if (userErr) {
      console.error('[create-superadmin] users insert error:', userErr);
    }

    return NextResponse.json({
      success: true,
      message: `SuperAdmin account created successfully for ${email}`,
      uid,
    });

  } catch (error: any) {
    console.error('[create-superadmin] Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
