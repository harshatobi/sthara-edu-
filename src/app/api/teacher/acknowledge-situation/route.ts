import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { accessOf } from '@/lib/admin/serverAuth';
import { normClass, teachingScope } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/acknowledge-situation
 * Body: { id, schoolId, table: 'wellness_logs', field: 'resolved', value }
 * Marks a low-energy check-in as followed up. Only the student's own teachers
 * (or office staff with wellness.read) may. Feed items are acknowledged
 * through /api/feed instead.
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

    const { data: log } = await supabase.from('wellness_logs').select('student_id, school_id').eq('id', id).maybeSingle();
    if (!log || log.school_id !== schoolId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (reqUser.role === 'teacher') {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('users').select('assignments, teacher_class, teacher_subject').eq('id', user.id).single(),
        supabase.from('users').select('student_class').eq('id', log.student_id).single(),
      ]);
      if (!teachingScope(t || {}).some(e => normClass(e.cls) === normClass(s?.student_class))) {
        return NextResponse.json({ error: 'You can only follow up with students you teach.' }, { status: 403 });
      }
    } else if (reqUser.role === 'admin' && !(await accessOf(supabase, user.id, schoolId)).can('wellness.read')) {
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
