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

  try {
    const supabase = createAdminClient();
    let query = supabase.from('syllabus').select('*');

    if (schoolId && schoolId !== 'all') {
      query = query.eq('school_id', schoolId);
    }
    if (teacherId && teacherId !== 'all') {
      query = query.eq('teacher_id', teacherId);
    }

    let { data, error } = await query.order('created_at', { ascending: true });

    // Fallback: If 0 rows found when filtering by schoolId, query all syllabus rows
    if (!data || data.length === 0) {
      const { data: fallbackData } = await supabase
        .from('syllabus')
        .select('*')
        .order('created_at', { ascending: true });

      if (fallbackData && fallbackData.length > 0) {
        data = fallbackData;
      }
    }

    if (error) throw error;

    const modules = (data || []).map((d) => ({
      id: d.id,
      schoolId: d.school_id,
      teacherId: d.teacher_id,
      subject: d.subject,
      class: d.class,
      grade: d.grade || d.class,
      topic: d.topic,
      month: d.month,
      objectives: d.objectives,
      publisher: d.publisher || 'NCERT',
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

    // ── Deduplication check ───────────────────────────────────────────────────
    if (teacherId && topic && month) {
      let dupQuery = supabase
        .from('syllabus')
        .select('id')
        .eq('school_id', schoolId)
        .eq('teacher_id', teacherId)
        .ilike('topic', topic.trim())
        .eq('month', month);

      if (subject) dupQuery = dupQuery.ilike('subject', subject.trim());

      const { data: existing } = await dupQuery.maybeSingle();
      if (existing?.id) {
        return NextResponse.json({ success: true, id: existing.id, isDuplicate: true });
      }
    }

    const { data, error } = await supabase
      .from('syllabus')
      .insert({
        school_id:  schoolId,
        teacher_id: teacherId || null,
        subject:    subject || null,
        class:      cls || null,
        grade:      body.grade || cls || null,
        topic:      topic || null,
        month:      month || null,
        objectives: body.objectives || null,
        publisher:  body.publisher || 'NCERT',
        unit_id:    body.unitId || null,
        status:     status || 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
