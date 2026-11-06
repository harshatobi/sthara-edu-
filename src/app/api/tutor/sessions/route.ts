import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { studentAllowance } from '@/lib/ai/allowanceServer';
import { openAssignments } from '@/lib/tutor/assignmentsServer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tutor/sessions — the student's own tutor history: open sessions to
 * resume first, then finished ones, newest first, with their depth score and
 * the previous score on the same chapter (for "retry the topic"). Also the
 * student's AI allowance level, so the screen can say when sessions pause,
 * and their open tutor assignments (Critical Gap and teacher-set).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role && user.role !== 'student') return NextResponse.json({ error: 'Only students have tutor history.' }, { status: 403 });
  const db = createAdminClient();
  const [{ data, error: qErr }, allowance, assignments] = await Promise.all([
    db.from('tutor_sessions')
      .select('id, subject, topic, micro_topic, grounding, mode, status, stage, depth_score, hint_depth, answer_revealed, rubric, created_at, completed_at, updated_at, transcript_purged_at')
      .eq('student_id', user.id).order('created_at', { ascending: false }).limit(200),
    studentAllowance(db, user.id),
    openAssignments(db, user.id),
  ]);
  if (qErr) return NextResponse.json({ error: 'Could not load your sessions.' }, { status: 500 });
  const rows = data ?? [];
  // Previous finished score on the same chapter, for each finished session.
  const done = rows.filter(r => r.status === 'done');
  const sessions = rows.map(r => {
    const prev = r.status === 'done'
      ? done.find(o => o.subject === r.subject && o.topic === r.topic && o.created_at < r.created_at)
      : done.find(o => o.subject === r.subject && o.topic === r.topic);
    return {
      id: r.id, subject: r.subject, topic: r.topic, microTopic: r.micro_topic, mode: r.mode, status: r.status, stage: r.stage,
      depth: r.depth_score ?? null, legacy: r.depth_score == null && r.status === 'done', hints: r.hint_depth ?? 0, revealed: !!r.answer_revealed,
      startedAt: r.created_at, completedAt: r.completed_at, updatedAt: r.updated_at, purged: !!r.transcript_purged_at,
      previousDepth: prev?.depth_score ?? null,
    };
  });
  return NextResponse.json({ sessions, assignments, allowance: allowance ? { level: allowance.level } : null });
}
