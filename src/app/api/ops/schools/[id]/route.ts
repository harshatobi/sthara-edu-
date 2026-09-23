import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

/** GET /api/ops/schools/:id — school, classes (with subjects) and roster. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: school }, { data: classes }, { data: people }] = await Promise.all([
    admin.from('schools').select('id, name, settings, trial_expires_at, created_at').eq('id', id).maybeSingle(),
    admin.from('classes').select('id, name, metadata').eq('school_id', id).order('name'),
    admin.from('users').select('id, role, name, email, student_class, custom_student_id, teacher_class, assignments, metadata, created_at')
      .eq('school_id', id).order('role').order('name'),
  ]);
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  return NextResponse.json({ school, classes: classes || [], people: people || [] });
}
