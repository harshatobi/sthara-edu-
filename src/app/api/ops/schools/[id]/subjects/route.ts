import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import type { SubjectKind } from '@/lib/subjects/catalog';
import { dropLegacyClassSubject, linkSchool, loadSubjectState, setClassSubjects, setElectives, setSubjectLeads } from '@/lib/subjects/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

type Out = { ok: boolean; status?: number; [k: string]: unknown };
const reply = (r: Out) => {
  if (r.ok) { const { ok: _ok, ...rest } = r; void _ok; return NextResponse.json({ ok: true, ...rest }); }
  const { ok: _ok, status, ...rest } = r; void _ok;
  return NextResponse.json(rest, { status: status ?? 400 });
};

/** GET /api/ops/schools/:id/subjects — offerings, teachers, enrolments, leads, and the linking plan for legacy names. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  return reply(await loadSubjectState(createAdminClient(), id));
}

/**
 * POST /api/ops/schools/:id/subjects — { action, ... }
 *   link-school                          link every legacy name that resolves; report the rest
 *   set-class { classId, subjects: [{name, kind}], confirmRemove? }
 *   drop-legacy { classId, name }        remove an unlinkable name from a class's list
 *   electives { classId, choices: { studentId: classSubjectId[] } }
 *   leads { subjectKey, userIds }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));

  switch (b.action) {
    case 'link-school':
      return reply(await linkSchool(db, id, op.id, 'operator'));
    case 'set-class': {
      if (!isId(b.classId) || !Array.isArray(b.subjects)) return NextResponse.json({ error: 'Pick a class and its subjects.' }, { status: 400 });
      const items = b.subjects.slice(0, 40).flatMap((x: { name?: unknown; kind?: unknown }) =>
        typeof x?.name === 'string' && x.name.trim() ? [{ name: x.name.trim(), kind: x.kind === 'elective' || x.kind === 'core' ? (x.kind as SubjectKind) : undefined }] : []);
      return reply(await setClassSubjects(db, id, op.id, 'operator', b.classId, items, b.confirmRemove === true));
    }
    case 'drop-legacy':
      if (!isId(b.classId) || typeof b.name !== 'string') return NextResponse.json({ error: 'Pick a class and a subject name.' }, { status: 400 });
      return reply(await dropLegacyClassSubject(db, id, op.id, 'operator', b.classId, b.name));
    case 'electives': {
      if (!isId(b.classId) || !b.choices || typeof b.choices !== 'object') return NextResponse.json({ error: 'Pick a class and the students’ electives.' }, { status: 400 });
      const choices: Record<string, string[]> = {};
      for (const [sid, v] of Object.entries(b.choices as Record<string, unknown>)) {
        if (!isId(sid) || !Array.isArray(v) || !v.every(isId)) return NextResponse.json({ error: 'Every choice must be a student and class subject ids.' }, { status: 400 });
        choices[sid] = v as string[];
      }
      return reply(await setElectives(db, id, op.id, 'operator', b.classId, choices));
    }
    case 'leads':
      if (typeof b.subjectKey !== 'string' || !Array.isArray(b.userIds) || !b.userIds.every(isId)) return NextResponse.json({ error: 'Pick a subject and its leads.' }, { status: 400 });
      return reply(await setSubjectLeads(db, id, op.id, 'operator', b.subjectKey, b.userIds));
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
