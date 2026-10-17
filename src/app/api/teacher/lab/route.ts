import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { officialName } from '@/lib/subjects/catalog';
import { engineById, validateScene } from '@/lib/lab/registry';

export const dynamic = 'force-dynamic';

/**
 * Live Lab saved demos.
 *   POST   { class, subject, scene, lessonPlanId? }   save a new demo
 *   PATCH  { id, scene?, lessonPlanId? }              change your own demo
 *   DELETE { id }                                     remove your own demo
 * A scene is re-checked by its engine here, so a stored demo can never be one the simulation would refuse.
 * Teachers save for classes they teach. Reading is direct (row-level security: staff of the same school), so any
 * teacher can reuse a colleague's demo (components/lab/useSavedScenes.ts).
 */

const MAX_PER_TEACHER = 300;
const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function rowOut(r: any, staff: Staff) {
  return {
    id: r.id, class: r.class, subject: r.subject, chapter: r.chapter, engine: r.engine, title: r.title, scene: r.scene,
    lessonPlanId: r.lesson_plan_id, mine: r.teacher_id === staff.id, updatedAt: r.updated_at,
  };
}

/** A lesson link must be a lesson plan in the same school, class and subject. */
async function checkLesson(db: SupabaseClient, staff: Staff, id: unknown, cls: string, subject: string) {
  if (id === null || id === undefined || id === '') return { ok: true as const, id: null };
  if (typeof id !== 'string') return { ok: false as const };
  const { data } = await db.from('lesson_plans').select('id, class, subject').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  return data && data.class === cls && data.subject === subject ? { ok: true as const, id: data.id as string } : { ok: false as const };
}

async function ownedScene(db: SupabaseClient, staff: Staff, id: unknown) {
  if (typeof id !== 'string' || !id) return { error: NextResponse.json({ error: 'id is required' }, { status: 400 }) };
  const { data } = await db.from('lab_scenes').select('*').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: 'Demo not found.' }, { status: 404 }) };
  if (data.teacher_id !== staff.id) return { error: NextResponse.json({ error: 'Only the teacher who saved this demo can change it.' }, { status: 403 }) };
  return { row: data };
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`lab:${staff.id}`, ...limitOf('lab')).allowed) return NextResponse.json({ error: 'Too many saves at once. Try again in a few minutes.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), asked = str(b?.subject, 60);
  if (!cls || !asked) return NextResponse.json({ error: 'Pick the class this demo is for.' }, { status: 400 });
  const subject = officialName(cls, asked);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject) && !inScope(staff.scope, cls, asked)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const scene = validateScene(b?.scene);
  if (!scene) return NextResponse.json({ error: 'That set-up isn’t one the simulation accepts.' }, { status: 400 });
  const lesson = await checkLesson(db, staff, b?.lessonPlanId, cls, subject);
  if (!lesson.ok) return NextResponse.json({ error: 'That lesson isn’t one of this class’s lesson plans.' }, { status: 400 });
  const { count } = await db.from('lab_scenes').select('id', { count: 'exact', head: true }).eq('teacher_id', staff.id);
  if ((count ?? 0) >= MAX_PER_TEACHER) return NextResponse.json({ error: `You have ${MAX_PER_TEACHER} saved demos. Delete some old ones first.` }, { status: 400 });
  const { data, error } = await db.from('lab_scenes').insert({
    school_id: staff.schoolId, teacher_id: staff.id, class: cls, subject, chapter: engineById(scene.engine)!.chapters[0],
    engine: scene.engine, title: scene.title, scene, lesson_plan_id: lesson.id,
  }).select('*').single();
  if (error) { console.error('[lab POST]', error.message); return NextResponse.json({ error: 'Could not save the demo.' }, { status: 500 }); }
  return NextResponse.json(rowOut(data, staff));
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`lab:${staff.id}`, ...limitOf('lab')).allowed) return NextResponse.json({ error: 'Too many saves at once. Try again in a few minutes.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const owned = await ownedScene(db, staff, b?.id);
  if ('error' in owned) return owned.error;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b?.scene !== undefined) {
    const scene = validateScene(b.scene);
    if (!scene) return NextResponse.json({ error: 'That set-up isn’t one the simulation accepts.' }, { status: 400 });
    Object.assign(row, { scene, engine: scene.engine, title: scene.title, chapter: engineById(scene.engine)!.chapters[0] });
  }
  if (b?.lessonPlanId !== undefined) {
    const lesson = await checkLesson(db, staff, b.lessonPlanId, owned.row.class, owned.row.subject);
    if (!lesson.ok) return NextResponse.json({ error: 'That lesson isn’t one of this class’s lesson plans.' }, { status: 400 });
    row.lesson_plan_id = lesson.id;
  }
  const { data, error } = await db.from('lab_scenes').update(row).eq('id', owned.row.id).select('*').single();
  if (error) { console.error('[lab PATCH]', error.message); return NextResponse.json({ error: 'Could not update the demo.' }, { status: 500 }); }
  return NextResponse.json(rowOut(data, staff));
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const b = await req.json().catch(() => null);
  const owned = await ownedScene(db, staff, b?.id);
  if ('error' in owned) return owned.error;
  const { error } = await db.from('lab_scenes').delete().eq('id', owned.row.id);
  if (error) return NextResponse.json({ error: 'Could not delete the demo.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
