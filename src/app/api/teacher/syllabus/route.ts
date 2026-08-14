import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function calculateWeightageScore(weight: number, toughness: string): number {
  const toughnessBonus = toughness === 'hard' ? 3 : toughness === 'medium' ? 2 : 1;
  return Math.round((weight * 0.7 + toughnessBonus) * 10) / 10;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schoolId  = searchParams.get('schoolId');
  const teacherId = searchParams.get('teacherId');

  try {
    const supabase = createAdminClient();
    let query = supabase.from('syllabus').select('*');

    if (schoolId && schoolId !== 'all' && schoolId !== 'null' && schoolId !== 'undefined') {
      query = query.eq('school_id', schoolId);
    }
    if (teacherId && teacherId !== 'all' && teacherId !== 'null' && teacherId !== 'undefined') {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;

    const seen = new Set<string>();
    const unique = (data || []).filter((d: any) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    const modules = unique.map((d: any) => {
      const meta = d.metadata || {};
      const examWeightage = d.exam_weightage ?? meta.examWeightage ?? 7;
      const toughnessLevel = d.toughness_level ?? meta.toughnessLevel ?? 'medium';
      const weightageScore = d.weightage_score ?? meta.weightageScore ?? calculateWeightageScore(examWeightage, toughnessLevel);
      const tags = Array.isArray(d.tags) ? d.tags : (meta.tags || []);

      return {
        id:             d.id,
        schoolId:       d.school_id,
        teacherId:      d.teacher_id,
        subject:        d.subject,
        class:          d.class,
        grade:          d.grade || d.class,
        topic:          d.topic,
        month:          d.month,
        objectives:     d.objectives,
        publisher:      d.publisher || 'NCERT',
        status:         d.status,
        tags,
        examWeightage,
        toughnessLevel,
        weightageScore,
        createdAt:      d.created_at,
      };
    });

    return NextResponse.json({ modules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolId, teacherId, subject, class: cls, topic, month, status, objectives, publisher, unitId } = body;
    if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });

    let tags = body.tags;
    let examWeightage = body.examWeightage;
    let toughnessLevel = body.toughnessLevel;
    let weightageScore = body.weightageScore;

    // Auto-generate AI analysis if tags/weightage are missing
    if (!tags || !examWeightage || !toughnessLevel || !weightageScore) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && topic) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `Analyze topic "${topic}" (${cls || ''} ${subject || ''}):
Extract JSON: {"tags":["keyword1","keyword2"],"examWeightage":8,"toughnessLevel":"medium","weightageScore":7.6}`;
          const aiRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: 0.1 }
          });
          const parsed = JSON.parse(aiRes.text || '{}');
          tags = tags || parsed.tags || [topic.toLowerCase().replace(/[^a-z0-9]/g, '_')];
          examWeightage = examWeightage || parsed.examWeightage || 7;
          toughnessLevel = toughnessLevel || parsed.toughnessLevel || 'medium';
          weightageScore = weightageScore || parsed.weightageScore || calculateWeightageScore(examWeightage, toughnessLevel);
        } catch (e) {
          console.warn('[syllabus POST] AI analysis fallback:', e);
        }
      }
      tags = tags || [topic.toLowerCase().replace(/[^a-z0-9]/g, '_')];
      examWeightage = examWeightage || 7;
      toughnessLevel = toughnessLevel || 'medium';
      weightageScore = weightageScore || calculateWeightageScore(examWeightage, toughnessLevel);
    }

    const supabase = createAdminClient();

    // Deduplication check
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

    const metadata = { tags, examWeightage, toughnessLevel, weightageScore };

    const { data, error } = await supabase
      .from('syllabus')
      .insert({
        school_id:       schoolId,
        teacher_id:      teacherId || null,
        subject:         subject || null,
        class:           cls || null,
        grade:           body.grade || cls || null,
        topic:           topic || null,
        month:           month || null,
        objectives:      objectives || null,
        publisher:       publisher || 'NCERT',
        unit_id:         unitId || null,
        status:          status || 'pending',
        tags:            tags,
        exam_weightage:  examWeightage,
        toughness_level: toughnessLevel,
        weightage_score: weightageScore,
        metadata:        metadata,
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      id: data.id,
      analysis: { tags, examWeightage, toughnessLevel, weightageScore }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
