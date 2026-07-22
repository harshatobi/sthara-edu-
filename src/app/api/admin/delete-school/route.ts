import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DELETE /api/admin/delete-school
 * Body: { schoolId }
 * Permanently deletes a school. Foreign key CASCADE constraints automatically delete
 * all associated users, assignments, submissions, situations, notifications, materials, classes, etc.
 */
export async function DELETE(req: NextRequest) {
  const { user, error: authError } = await verifyApiToken(req.headers.get('authorization'));
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized — superadmin token required' }, { status: 401 });
  }

  try {
    const { schoolId } = await req.json();
    if (!schoolId || typeof schoolId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid schoolId' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Delete the school doc. Cascade rules in Postgres will clean up all relational child tables.
    const { data: deletedSchool, error } = await supabase
      .from('schools')
      .delete()
      .eq('id', schoolId)
      .select('id')
      .single();

    if (error || !deletedSchool) {
      return NextResponse.json({ error: error?.message || `School "${schoolId}" not found` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      schoolId,
      message: `School "${schoolId}" and all associated relational records permanently deleted.`,
    });
  } catch (err: any) {
    console.error('[delete-school] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete school' }, { status: 500 });
  }
}
