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
  const schoolId  = searchParams.get('schoolId');
  const teacherId = searchParams.get('teacherId');

  try {
    const supabase = createAdminClient();
    let query = supabase.from('syllabus').select('*');

    // Only filter by school_id when a real value is given
    if (schoolId && schoolId !== 'all' && schoolId !== 'null' && schoolId !== 'undefined') {
      query = query.eq('school_id', schoolId);
    }

    // Only filter by teacher_id when a specific teacher is requested (not 'all')
    if (teacherId && teacherId !== 'all' && teacherId !== 'null' && teacherId !== 'undefined') {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    // NOTE: No fallback query here — the old fallback was returning ALL rows on
    // top of the filtered rows, causing every topic to appear twice.
    if (error) throw error;

    // Deduplicate by ID in JS (belt-and-suspenders)
    const seen = new Set<string>();
    const unique = (data || []).filter((d: any) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    const modules = unique.map((d: any) => ({
      id:         d.id,
      schoolId:   d.school_id,
      teacherId:  d.teacher_id,
      subject:    d.subject,
      class:      d.class,
      grade:      d.grade || d.class,
      topic:      d.topic,
      month:      d.month,
      objectives: d.objectives,
      publisher:  d.publisher || 'NCERT',
      status:     d.status,
      createdAt:  d.created_at,
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
