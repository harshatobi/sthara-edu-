import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { computeStudentTml } from '@/lib/tml/engine';

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
    const result = await computeStudentTml(supabase, studentId, subject);

    return NextResponse.json({
      success: true,
      studentId,
      computedTopics: result.computedTopicsCount,
      topics: result.topics,
    });
  } catch (err: any) {
    console.error('[TML Compute API Error]:', err);
    return NextResponse.json({ error: err.message || 'TML computation failed' }, { status: 500 });
  }
}

