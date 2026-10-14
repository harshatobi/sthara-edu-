import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/report-cards — published report cards for a student (their own) or a parent (each verified child).
 * Only the latest version of each term's card. A card the school is holding comes back without its content.
 */
export async function GET(req: NextRequest) {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return NextResponse.json({ error, code: blocked }, { status: 403 });
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const { data: me } = await db.from('users').select('id, role, school_id').eq('id', user.id).maybeSingle();
  if (!me || !me.school_id || (me.role !== 'student' && me.role !== 'parent')) return NextResponse.json({ error: 'Only students and parents have report cards here.' }, { status: 403 });

  let children: { id: string; name: string }[] = [];
  if (me.role === 'student') {
    const { data: u } = await db.from('users').select('id, name').eq('id', me.id).maybeSingle();
    children = u ? [{ id: u.id, name: u.name || 'Student' }] : [];
  } else {
    const { data: g } = await db.from('guardians').select('student_id').eq('parent_id', me.id).eq('verified', true);
    const ids = (g || []).map(x => x.student_id);
    const { data: kids } = ids.length ? await db.from('users').select('id, name, school_id, role').in('id', ids) : { data: [] };
    children = (kids || []).filter(u => u.school_id === me.school_id && u.role === 'student').map(u => ({ id: u.id, name: u.name || 'Student' }));
  }
  if (!children.length) return NextResponse.json({ children: [], cards: [] });

  const { data, error: e } = await db.from('report_cards')
    .select('id, student_id, term_id, version, snapshot, revised, revision_reason, published_at, held')
    .eq('school_id', me.school_id).in('student_id', children.map(c => c.id)).is('superseded_at', null)
    .order('published_at', { ascending: false }).limit(200);
  if (e) {
    if (e.code === '42P01' || e.code === 'PGRST205') return NextResponse.json({ children, cards: [] });
    return NextResponse.json({ error: 'Could not load report cards.' }, { status: 500 });
  }
  return NextResponse.json({
    children,
    cards: (data || []).map(c => {
      const s: any = c.snapshot;
      const head = { id: c.id, studentId: c.student_id, termId: c.term_id, termName: s?.term?.name ?? 'Term', session: s?.session ?? '', version: c.version, revised: c.revised, revisionReason: c.revised ? c.revision_reason : null, publishedAt: c.published_at };
      return c.held ? { ...head, held: true, snapshot: null } : { ...head, held: false, snapshot: s };
    }),
  });
}
