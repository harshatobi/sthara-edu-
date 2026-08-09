import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { calculateTopicTml, TmlItemInput } from '@/lib/tml/engine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tml/compute
 * Body: { studentId: string, subject?: string }
 *
 * Computes True Mastery Level (TML) scores for a student based on per-item evidence
 * and persists an append-only snapshot entry into tml_scores table.
 */
export async function POST(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { studentId, subject } = await req.json();
    if (!studentId) {
      return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch student's profile
    const { data: studentUser } = await supabase
      .from('users')
      .select('id, school_id')
      .eq('id', studentId)
      .single();

    if (!studentUser) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Fetch submission items for the student
    let query = supabase
      .from('submission_items')
      .select(`
        id,
        score,
        max_score,
        component_type,
        difficulty,
        hints_used,
        attempts_count,
        teacher_confirmed,
        outcome_code,
        created_at,
        assignments (
          subject,
          title,
          units
        )
      `)
      .eq('student_id', studentId);

    const { data: itemsData, error: itemsErr } = await query;
    if (itemsErr) throw itemsErr;

    // Group items by topic
    const topicGroups: Record<string, { items: TmlItemInput[]; subject: string }> = {};
    const now = new Date();

    (itemsData || []).forEach((row: any) => {
      const assign = row.assignments || {};
      const sub = assign.subject || 'General';
      if (subject && sub.toLowerCase() !== subject.toLowerCase()) return;

      const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
        ? assign.units.filter((u: string) => u !== 'general' && u !== 'General')
        : [];
      
      const topicName = rawUnits.length > 0
        ? rawUnits[0]
        : (assign.title ? assign.title.trim() : 'Core Concepts');

      const ageDays = (now.getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);

      if (!topicGroups[topicName]) {
        topicGroups[topicName] = { items: [], subject: sub };
      }

      topicGroups[topicName].items.push({
        score: Number(row.score) || 0,
        maxScore: Number(row.max_score) || 1,
        componentType: row.component_type || 'homework',
        ageDays,
        hintsUsed: row.hints_used || 0,
        attemptNumber: row.attempts_count || 1,
        teacherConfirmed: row.teacher_confirmed !== false,
        outcomeCode: row.outcome_code,
        topicName,
      });
    });

    const results: any[] = [];

    // Calculate TML for each topic and persist entry
    for (const [topicName, group] of Object.entries(topicGroups)) {
      const calculation = calculateTopicTml(group.items);

      if (calculation.topicTml !== null) {
        const { error: insertErr } = await supabase.from('tml_scores').insert({
          student_id: studentId,
          school_id: studentUser.school_id,
          subject: group.subject,
          topic_name: topicName,
          score: calculation.topicTml,
          confidence_band: calculation.confidenceBand,
          item_count: calculation.totalItemCount,
          components: calculation.components,
          computed_at: new Date().toISOString(),
        });

        if (insertErr) console.error('[TML Engine] insert error:', insertErr);
      }

      results.push({
        topicName,
        subject: group.subject,
        ...calculation,
      });
    }

    return NextResponse.json({
      success: true,
      studentId,
      computedTopics: results.length,
      topics: results,
    });
  } catch (err: any) {
    console.error('[TML Compute API Error]:', err);
    return NextResponse.json({ error: err.message || 'TML computation failed' }, { status: 500 });
  }
}
