import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { deleteSaved, getSaved, listSaved } from '@/lib/teacher/copilotSaved';

export const dynamic = 'force-dynamic';

const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * The Copilot's "Made before" library (copilot_outputs), opened without any AI.
 *   GET ?class=&subject=   the teacher's own saved things for the class, plus the school's board papers and pictures for that level
 *   GET ?id=               one saved thing (its reply), if the teacher may see it
 *   DELETE ?id=            remove one of the teacher's own
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`copilotSaved:${staff.id}`, ...limitOf('copilotSaved')).allowed) return NextResponse.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 });
  const p = req.nextUrl.searchParams;
  const id = str(p.get('id'), 40);
  if (id) {
    if (!isId(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const r = await getSaved(db, staff, id);
    if (!r || (staff.role === 'teacher' && !inScope(staff.scope, r.class, r.subject))) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ item: { id: r.id, kind: r.kind, cls: r.class, subject: r.subject, chapter: r.chapter, title: r.title, reply: r.reply, imagePath: r.image_path, at: r.created_at, mine: r.teacher_id === staff.id } });
  }
  const cls = str(p.get('class'), 40), subject = str(p.get('subject'), 60);
  if (!cls || !subject) return NextResponse.json({ error: 'Pick a class and subject.' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  return NextResponse.json({ items: await listSaved(db, staff, cls, subject) });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`copilotSaved:${staff.id}`, ...limitOf('copilotSaved')).allowed) return NextResponse.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 });
  const id = str(req.nextUrl.searchParams.get('id'), 40);
  if (!isId(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return (await deleteSaved(db, staff, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Only your own saved things can be removed.' }, { status: 404 });
}
