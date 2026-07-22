import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/verify-school
 * Body: { schoolCode: string }
 * Returns: { valid: true, type: 'school'|'college' } or { valid: false, error: string }
 * Looks up school by code field in schools table.
 */
export async function POST(req: NextRequest) {
  try {
    const { schoolCode } = await req.json();

    if (!schoolCode || typeof schoolCode !== 'string' || schoolCode.length < 3) {
      return NextResponse.json({ valid: false, error: 'Invalid school code.' }, { status: 400 });
    }

    const code = schoolCode.trim().toUpperCase();
    const supabase = createAdminClient();

    // Query schools table by code stored in settings->>'code' or by name-derived code
    const { data: school, error } = await supabase
      .from('schools')
      .select('id, institution_type, settings')
      .eq('settings->>code', code)
      .single();

    if (error || !school) {
      return NextResponse.json({
        valid: false,
        error: 'Institution code not found. Please check and try again.',
      });
    }

    return NextResponse.json({
      valid: true,
      type: school.institution_type === 'college' ? 'college' : 'school',
      schoolId: school.id,
    });
  } catch (err: any) {
    console.error('[verify-school] Error:', err.message);
    return NextResponse.json({ valid: false, error: 'Server error. Please try again.' }, { status: 500 });
  }
}
