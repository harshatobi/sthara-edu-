import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

const DEFAULT_PASSWORD = 'Sthara@123';

/**
 * POST /api/superadmin/provision-school
 * Requires: SuperAdmin JWT token in Authorization header
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { name, institutionType, code, adminEmail, branches } = await request.json();

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Institution name and code are required' }, { status: 400 });
    }

    const codeUpper = code.trim().toUpperCase();
    const supabase = createAdminClient(); // Service role — bypasses RLS

    // ── 1. Check if school code already exists ────────────────────────────────
    const { data: existing } = await supabase
      .from('schools')
      .select('id')
      .eq('settings->>code', codeUpper)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `School code "${codeUpper}" is already in use. Please choose a different code.` },
        { status: 409 }
      );
    }

    // ── 2. Create the school ──────────────────────────────────────────────────
    const { data: schoolData, error: schoolErr } = await supabase
      .from('schools')
      .insert({
        name: name.trim(),
        institution_type: institutionType || 'school',
        settings: {
          code: codeUpper,
          adminEmail: (adminEmail || '').trim().toLowerCase(),
          branches: institutionType === 'college' ? (branches || []) : [],
          active: true,
          plan: 'trial',
        },
        trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30-day trial
      })
      .select('*')
      .single();

    if (schoolErr) {
      console.error('[provision-school] School insert error:', schoolErr);
      return NextResponse.json({ error: schoolErr.message }, { status: 500 });
    }

    const schoolId = schoolData.id;

    // ── 3. Create admin user in Supabase Auth (if email provided) ─────────────
    let adminUserId = '';
    if (adminEmail?.trim()) {
      const cleanEmail = adminEmail.trim().toLowerCase();

      // Check if user already exists in Auth
      const { data: authList } = await supabase.auth.admin.listUsers();
      const existingAuthUser = (authList?.users || []).find(
        u => u.email?.toLowerCase() === cleanEmail
      );

      if (existingAuthUser) {
        adminUserId = existingAuthUser.id;
        // Update password to default so they can log in
        await supabase.auth.admin.updateUserById(adminUserId, {
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: { role: 'admin', name: 'School Admin', schoolId },
        });
      } else {
        // Create brand new auth user
        const { data: newAuthUser, error: authErr } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: { role: 'admin', name: 'School Admin', schoolId },
        });

        if (authErr || !newAuthUser?.user) {
          console.error('[provision-school] Auth user creation error:', authErr);
          // Don't fail the whole request — school was created, just log warning
        } else {
          adminUserId = newAuthUser.user.id;
        }
      }

      // ── 4. Upsert admin into `users` table ─────────────────────────────────
      if (adminUserId) {
        await supabase.from('users').upsert({
          id: adminUserId,
          email: cleanEmail,
          name: 'School Admin',
          role: 'admin',
          school_id: schoolId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      school: {
        id: schoolId,
        name: schoolData.name,
        type: schoolData.institution_type,
        code: codeUpper,
        adminEmail: schoolData.settings?.adminEmail,
      },
      adminCreated: !!adminUserId,
      defaultPassword: DEFAULT_PASSWORD,
      message: adminEmail?.trim()
        ? `School created. Admin account (${adminEmail.trim()}) provisioned with default password: ${DEFAULT_PASSWORD}`
        : 'School created (no admin email provided).',
    });

  } catch (err: any) {
    console.error('[provision-school] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
