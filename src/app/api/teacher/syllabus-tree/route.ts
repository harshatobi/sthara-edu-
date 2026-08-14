import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const cleanStr = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface SyllabusTopicNode {
  id: string;
  topic: string;
  tags: string[];
  examWeightage: number;
  toughnessLevel: 'easy' | 'medium' | 'hard';
  weightageScore: number;
  objectives?: string;
  month?: string;
}

export interface SyllabusChapterNode {
  chapterName: string;
  topics: SyllabusTopicNode[];
}

/**
 * GET /api/teacher/syllabus-tree?schoolId=X&teacherId=Y&class=Z&subject=W
 * Returns hierarchical list of chapters and topics filtered by class & subject.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId');
  const teacherId = searchParams.get('teacherId');
  const studentClass = searchParams.get('class');
  const subject = searchParams.get('subject');

  try {
    const supabase = createAdminClient();
    let query = supabase.from('syllabus').select('*');

    if (schoolId && schoolId !== 'all' && schoolId !== 'null') {
      query = query.eq('school_id', schoolId);
    }
    if (teacherId && teacherId !== 'all' && teacherId !== 'null') {
      query = query.eq('teacher_id', teacherId);
    }

    const { data: rows, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;

    let modules = rows || [];

    // Filter by subject if specified
    if (subject && subject.trim() && subject !== 'all') {
      const subClean = cleanStr(subject);
      modules = modules.filter(m => {
        const mSub = cleanStr(m.subject || '');
        return !mSub || mSub.includes(subClean) || subClean.includes(mSub);
      });
    }

    // Filter by class if specified
    if (studentClass && studentClass.trim() && studentClass !== 'all') {
      const clsClean = cleanStr(studentClass).replace(/^class/, '').replace(/^grade/, '');
      modules = modules.filter(m => {
        const mCls = cleanStr(m.class || m.grade || '').replace(/^class/, '').replace(/^grade/, '');
        return !mCls || mCls === clsClean || mCls.includes(clsClean) || clsClean.includes(mCls);
      });
    }

    // Group into Chapters
    const chapterMap = new Map<string, SyllabusTopicNode[]>();

    modules.forEach(m => {
      const rawTopic = m.topic || 'General Topic';
      let chapterName = m.month ? `${m.month} Topics` : 'General Chapter';

      if (rawTopic.includes(':')) {
        const parts = rawTopic.split(':');
        chapterName = parts[0].trim();
      } else if (rawTopic.toLowerCase().includes('chapter')) {
        const parts = rawTopic.split('-');
        chapterName = parts[0].trim();
      }

      const topicNode: SyllabusTopicNode = {
        id: m.id,
        topic: rawTopic,
        tags: Array.isArray(m.tags) ? m.tags : (m.metadata?.tags || []),
        examWeightage: m.exam_weightage || m.metadata?.examWeightage || 7,
        toughnessLevel: m.toughness_level || m.metadata?.toughnessLevel || 'medium',
        weightageScore: m.weightage_score || m.metadata?.weightageScore || 7.0,
        objectives: m.objectives,
        month: m.month,
      };

      if (!chapterMap.has(chapterName)) {
        chapterMap.set(chapterName, []);
      }
      const existing = chapterMap.get(chapterName)!;
      if (!existing.some(t => t.topic.toLowerCase() === rawTopic.toLowerCase())) {
        existing.push(topicNode);
      }
    });

    const chapters: SyllabusChapterNode[] = Array.from(chapterMap.entries()).map(([chapterName, topics]) => ({
      chapterName,
      topics,
    }));

    return NextResponse.json({ success: true, chapters });
  } catch (err: any) {
    console.error('[syllabus-tree]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch syllabus tree' }, { status: 500 });
  }
}
