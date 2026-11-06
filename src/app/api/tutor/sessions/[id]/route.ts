import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { SESSION_COLS, loadMessages, view, type SessionRow } from '@/lib/tutor/socraticServer';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/tutor/sessions/:id — one of the student's own sessions with its transcript, to read back or resume. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { user, error } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role && user.role !== 'student') return NextResponse.json({ error: 'Only students can open their sessions here.' }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = createAdminClient();
  const { data } = await db.from('tutor_sessions').select(SESSION_COLS).eq('id', id).eq('student_id', user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'That session was not found.' }, { status: 404 });
  const [messages, tags] = await Promise.all([
    loadMessages(db, id),
    db.from('tutor_session_misconceptions').select('tutor_misconceptions(label)').eq('session_id', id),
  ]);
  const labels = (tags.data ?? []).map((t: any) => t.tutor_misconceptions?.label).filter(Boolean);
  return NextResponse.json({ session: view(data as SessionRow, messages, { misconceptions: labels }) });
}
