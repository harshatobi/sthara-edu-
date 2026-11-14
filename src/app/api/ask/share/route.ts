import { NextResponse, type NextRequest } from 'next/server';
import { requireAsker } from '@/lib/ask/engine';
import { colleagues, markSharesSeen, sharedWith, shareTurn } from '@/lib/ask/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ask/share            answers shared with me (parts my role can't see are hidden) and who I can share with
 * GET /api/ask/share?seen=1     also marks them seen
 * POST { turnId, to: [userId], note? }   share one of my answers with colleagues (staff only)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  const { asker, db } = auth;
  if (asker.kind !== 'staff') return NextResponse.json({ shared: [], colleagues: [] });
  const [shared, people] = await Promise.all([sharedWith(db, asker.viewer), colleagues(db, asker.viewer.schoolId, asker.viewer.id)]);
  if (req.nextUrl.searchParams.get('seen') === '1') await markSharesSeen(db, asker.viewer.id);
  return NextResponse.json({ shared, colleagues: people });
}

export async function POST(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  const b = await req.json().catch(() => null);
  const to = Array.isArray(b?.to) ? b.to.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : [];
  if (typeof b?.turnId !== 'string' || !to.length) return NextResponse.json({ error: 'Choose who to share with.' }, { status: 400 });
  try {
    const n = await shareTurn(auth.db, auth.asker, b.turnId, to, typeof b?.note === 'string' ? b.note.trim() : null);
    return NextResponse.json({ shared: n });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t share that.' }, { status: e?.status || 500 });
  }
}
