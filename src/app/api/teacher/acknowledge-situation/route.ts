import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/acknowledge-situation
 * Body: { id, schoolId, table, field, value }
 * Generic acknowledgement endpoint for:
 *   - situations  (acknowledged: true/false)
 *   - wellness_logs (resolved: true/false)
 * Requires: Valid JWT for a teacher/admin of the school.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, schoolId, table, field, value } = await request.json();

    if (!id || !schoolId || !table || !field) {
      return NextResponse.json({ error: 'id, schoolId, table, and field are required' }, { status: 400 });
    }

    // Allow only specific tables and fields to prevent SQL injection / misuse
    const allowedTables: Record<string, string[]> = {
      situations: ['acknowledged'],
      wellness_logs: ['resolved'],
    };

    if (!allowedTables[table] || !allowedTables[table].includes(field)) {
      return NextResponse.json({ error: `Table '${table}' or field '${field}' not allowed` }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify requester is teacher/admin of this school
    const { data: reqUser } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!reqUser || reqUser.school_id !== schoolId || !['teacher', 'admin', 'superadmin'].includes(reqUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: updateErr } = await supabase
      .from(table)
      .update({ [field]: value })
      .eq('id', id)
      .eq('school_id', schoolId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[acknowledge-situation]', err);
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}
