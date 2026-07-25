import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

const DEFAULT_PASSWORD = 'Sthara@123';

/**
 * POST /api/superadmin/repair-admin
 * Requires: Valid JWT token in Authorization header
 * Body: { schoolId: string, adminEmail: string }
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { schoolId, adminEmail } = await request.json();

    if (!schoolId || !adminEmail) {
      return NextResponse.json({ error: 'schoolId and adminEmail required' }, { status: 400 });
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    const supabase = createAdminClient();

    // Find or create auth user
    const { data: authList } = await supabase.auth.admin.listUsers();
    const existing = (authList?.users || []).find(u => u.email?.toLowerCase() === cleanEmail);

    let userId = '';
    if (existing) {
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { role: 'admin', name: 'School Admin', schoolId },
      });
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { role: 'admin', name: 'School Admin', schoolId },
      });
      if (createErr || !newUser?.user) {
        return NextResponse.json({ error: createErr?.message || 'Failed to create user' }, { status: 500 });
      }
      userId = newUser.user.id;
    }

    // Upsert into users table
    await supabase.from('users').upsert({
      id: userId,
      email: cleanEmail,
      name: 'School Admin',
      role: 'admin',
      school_id: schoolId,
    });

    return NextResponse.json({
      success: true,
      message: `Admin account for ${cleanEmail} created/reset with default password: ${DEFAULT_PASSWORD}`,
      defaultPassword: DEFAULT_PASSWORD,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
