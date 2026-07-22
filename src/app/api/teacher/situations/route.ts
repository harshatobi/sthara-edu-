import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/situations
 * Body: { schoolId, alerts: Array<{ type, message, studentName, studentId, metadata }> }
 * Inserts situation alerts. Supabase realtime will push updates to teacher feed instantly.
 */
export async function POST(request: NextRequest) {
  try {
    const { schoolId, alerts } = await request.json();

    if (!schoolId || !Array.isArray(alerts) || alerts.length === 0) {
      return NextResponse.json({ error: 'Missing schoolId or alerts' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const rows = alerts.map((alert: any) => ({
      school_id: schoolId,
      teacher_id: alert.teacherId || null,
      type: alert.type || null,
      message: alert.message || null,
      student_name: alert.studentName || null,
      student_id: alert.studentId || null,
      acknowledged: false,
      metadata: alert.metadata || {},
    }));

    const { data, error } = await supabase
      .from('situations')
      .insert(rows)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ success: true, count: data?.length || 0 });
  } catch (err: any) {
    console.error('[situations API] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to write situations' },
      { status: 500 }
    );
  }
}
