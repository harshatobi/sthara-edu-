import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * GET ?child=<login id>   A verified child's recent finished AI tutor sessions for the parent (Socratic tutor PR3,
 * decisions of 2026-11-06: parents see the summary, never transcripts): chapter, when, depth in words, what the
 * child showed, what to work on and the next step.
 */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const child = req.nextUrl.searchParams.get('child') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(child)) return NextResponse.json({ error: 'Which child?' }, { status: 400 });
  const { data: g } = await auth.db.from('guardians').select('id').eq('parent_id', auth.parent.id).eq('student_id', child).eq('verified', true).maybeSingle();
  if (!g) return NextResponse.json({ error: 'Not your child.' }, { status: 403 });
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await auth.db.from('tutor_sessions')
    .select('id, subject, topic, mode, depth_score, completed_at, summary')
    // bounded: one child's finished sessions in the last 60 days, newest 12
    .eq('student_id', child).eq('status', 'done').gte('completed_at', since).order('completed_at', { ascending: false }).limit(12);
  if (error) return NextResponse.json({ error: 'Could not load the tutor sessions.' }, { status: 500 });
  const list = (data ?? []).map(s => {
    const sum = (s.summary && typeof s.summary === 'object' ? s.summary : {}) as { strengths?: unknown; toFix?: unknown; next?: unknown };
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 3) : []);
    return {
      id: s.id, subject: s.subject, topic: s.topic, hots: s.mode === 'hots', at: s.completed_at,
      depth: s.depth_score === null ? null : Math.round(Number(s.depth_score)),
      strengths: arr(sum.strengths), toFix: arr(sum.toFix), next: typeof sum.next === 'string' ? sum.next : null,
    };
  });
  return NextResponse.json({ sessions: list });
}
