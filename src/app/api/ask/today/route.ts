import { NextResponse, type NextRequest } from 'next/server';
import { requireAsker } from '@/lib/ask/engine';
import { todayFor } from '@/lib/ask/today';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/ask/today: the cards, findings and trends the Ask page opens on. Built from the records, no AI. */
export async function GET(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  try {
    return NextResponse.json(await todayFor(auth.db, auth.asker));
  } catch (e: any) {
    console.error('[ask/today]', e?.message);
    return NextResponse.json({ error: 'Couldn’t load today’s summary.' }, { status: 500 });
  }
}
