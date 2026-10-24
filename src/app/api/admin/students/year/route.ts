import { NextResponse, type NextRequest } from 'next/server';
import { deny, requireAdmin, str } from '@/lib/admin/serverAuth';
import { chainStep, classYear, promote, publish, yearBoard } from '@/lib/students/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Year end in the office.
 *   GET                 every class this session and where its outcomes stand (students.read or outcomes.approve)
 *   GET ?cls=           one class, student by student, with each report card result
 *   POST { action, cls }:
 *     approve { items: [{ id }] } | return { items, note }            outcomes.approve (principal)
 *     finalise { items: [{ id, outcome?, note? }] } | reopen { items } students.manage (registrar); a changed outcome needs a note
 *     promote { toClass, sameClass? }                                 students.manage: every outcome final
 *     publish                                                         students.manage: to the student and parent portals
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'outcomes.approve']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const cls = str(req.nextUrl.searchParams.get('cls'), 40);
  const can = { approve: admin.access.can('outcomes.approve'), manage: admin.access.can('students.manage') };
  try {
    return NextResponse.json({ ...(cls ? await classYear(db, admin.schoolId, cls) : await yearBoard(db, admin.schoolId)), can });
  } catch (e) {
    console.error('[admin/students/year]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the year end.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['outcomes.approve', 'students.manage']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  const cls = str(b.cls, 40);
  if (!cls) return NextResponse.json({ error: 'Pick a class.' }, { status: 400 });
  const a = { id: admin.id, name: admin.name, schoolId: admin.schoolId };
  const items = Array.isArray(b.items) ? b.items.filter((i: any) => i && typeof i.id === 'string').slice(0, 500) : [];
  let out;
  if (b.action === 'approve' || b.action === 'return') {
    const d = deny(admin, 'outcomes.approve'); if (d) return d;
    out = await chainStep(db, a, b.action, items, cls, str(b.note, 300));
  } else {
    const d = deny(admin, 'students.manage'); if (d) return d;
    out = b.action === 'finalise' || b.action === 'reopen' ? await chainStep(db, a, b.action, items, cls)
      : b.action === 'promote' ? await promote(db, a, cls, str(b.toClass, 40), str(b.sameClass, 40))
        : b.action === 'publish' ? await publish(db, a, cls)
          : { ok: false as const, error: 'Unknown action.', status: 400 };
  }
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
