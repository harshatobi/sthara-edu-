import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET  ?schoolId=X&teacherId=Y       → fetch syllabus modules for teacher
 * POST { schoolId, teacherId, ...fields }  → create module
 * PUT  { schoolId, id, ...fields }    → update module
 * DELETE { schoolId, id }             → delete module
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  const teacherId = searchParams.get('teacherId');

  if (!schoolId || !teacherId) {
    return NextResponse.json({ error: 'Missing schoolId or teacherId' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('syllabus')
      .select('*')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const modules = (data || []).map((d) => ({
      id: d.id,
      schoolId: d.school_id,
      teacherId: d.teacher_id,
      subject: d.subject,
      class: d.class,
      topic: d.topic,
      month: d.month,
      status: d.status,
      createdAt: d.created_at,
    }));

    return NextResponse.json({ modules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolId, teacherId, subject, class: cls, topic, month, status } = body;
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('syllabus')
      .insert({
        school_id: schoolId,
        teacher_id: teacherId || null,
        subject: subject || null,
        class: cls || null,
        topic: topic || null,
        month: month || null,
        status: status || 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolId, id, ...fields } = body;
    if (!schoolId || !id) return NextResponse.json({ error: 'Missing schoolId or id' }, { status: 400 });

    const supabase = createAdminClient();

    // Map camelCase fields to snake_case columns
    const update: Record<string, any> = {};
    if (fields.topic  !== undefined) update.topic  = fields.topic;
    if (fields.month  !== undefined) update.month  = fields.month;
    if (fields.status !== undefined) update.status = fields.status;
    if (fields.subject!== undefined) update.subject= fields.subject;
    if (fields.class  !== undefined) update.class  = fields.class;

    const { error } = await supabase
      .from('syllabus')
      .update(update)
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolId, id } = body;
    if (!schoolId || !id) return NextResponse.json({ error: 'Missing schoolId or id' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('syllabus')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
