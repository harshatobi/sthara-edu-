import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { subjectSlug } from '@/lib/subjects/catalog';
import { chapterKey } from '@/lib/tutor/socraticServer';

export const dynamic = 'force-dynamic';

/**
 * A chapter's misconception bank, curated by the teachers who teach it (decisions of 2026-11-06: AI-seeded,
 * teacher-curated; the tutor tags only against the active bank).
 *   POST  { class, subject, chapter, label, description? }       add one (source teacher)
 *   PATCH { id, class, subject, label?, description?, status? }   edit it, or retire / restore it
 * Only for a class and subject the teacher teaches, and only that class's level.
 */
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const levelOf = (cls: string) => cls.match(/\d{1,2}/)?.[0] ?? null;

async function gate(req: NextRequest, b: any) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth;
  const { staff } = auth;
  if (!checkRateLimit(`tutorBank:${staff.id}`, ...limitOf('assignments')).allowed) return { res: bad('That’s a lot of changes in a short time. Give it a few minutes.', 429) };
  const cls = str(b?.class, 40), subject = str(b?.subject, 80);
  const level = levelOf(cls);
  if (!cls || !subject || !level) return { res: bad('Pick the class and subject.') };
  if (!(staff.role === 'admin' || inScope(staff.scope, cls, subject))) return { res: bad('You don’t teach that class and subject.', 403) };
  return { ...auth, cls, subject, level };
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const g = await gate(req, b);
  if ('res' in g) return g.res;
  const label = str(b?.label, 120), description = str(b?.description, 400), chapter = str(b?.chapter, 200);
  if (label.length < 3) return bad('Describe the misconception in a few words.');
  if (!chapter) return bad('Pick the chapter.');
  const { data, error } = await g.db.from('tutor_misconceptions').insert({
    school_id: g.staff.schoolId, level: g.level, subject_key: str(b?.subjectKey, 80) || subjectSlug(g.subject), chapter_key: chapterKey(chapter),
    label, description, status: 'active', source: 'teacher', created_by: g.staff.id, updated_by: g.staff.id,
  }).select('id').single();
  if (error) return error.code === '23505' ? bad('That misconception is already in the bank.', 409) : bad('Could not add it.', 500);
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const g = await gate(req, b);
  if ('res' in g) return g.res;
  const id = str(b?.id, 40);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Which misconception?');
  const patch: Record<string, unknown> = { updated_by: g.staff.id, updated_at: new Date().toISOString() };
  if (b?.label !== undefined) { const l = str(b.label, 120); if (l.length < 3) return bad('Describe the misconception in a few words.'); patch.label = l; }
  if (b?.description !== undefined) patch.description = str(b.description, 400);
  if (b?.status !== undefined) { if (b.status !== 'active' && b.status !== 'retired') return bad('Retire or restore.'); patch.status = b.status; }
  // Only this school's bank, at this class's level.
  const { data, error } = await g.db.from('tutor_misconceptions').update(patch).eq('id', id).eq('school_id', g.staff.schoolId).eq('level', g.level).select('id');
  if (error) return error.code === '23505' ? bad('Another misconception in this chapter already says that.', 409) : bad('Could not save.', 500);
  if (!data?.length) return bad('Not found in this class’s bank.', 404);
  return NextResponse.json({ ok: true });
}
