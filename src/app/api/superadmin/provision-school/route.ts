import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/superadmin/provision-school
 * Creates a new school/college in Supabase using the service role client (bypasses RLS).
 * Only callable by SuperAdmins.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      name,
      institutionType,
      code,
      adminEmail,
      branches,
    } = await request.json();

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Institution name and code are required' }, { status: 400 });
    }

    const codeUpper = code.trim().toUpperCase();
    const supabase = createAdminClient(); // Service role — bypasses RLS

    // Check if school code already exists
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

    // Insert the new school
    const { data, error: insertErr } = await supabase
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

    if (insertErr) {
      console.error('[provision-school] Insert error:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      school: {
        id: data.id,
        name: data.name,
        type: data.institution_type,
        code: codeUpper,
        adminEmail: data.settings?.adminEmail,
      },
    });

  } catch (err: any) {
    console.error('[provision-school] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
