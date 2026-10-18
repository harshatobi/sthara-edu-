import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { officialName } from '@/lib/subjects/catalog';
import { engineById, validateScene } from '@/lib/lab/registry';
import { buildRunResults } from '@/lib/lab/runs';

export const dynamic = 'force-dynamic';

/**
 * Live Lab class predictions.
 *   POST { id, class, subject, scene, answers, sceneId? }   save (or update) one lesson's run
 * The presenter calls this in the background at every reveal with the same id, so a run grows as the lesson goes.
 * Only the class's counts are kept from the request: every question, option and right answer is rebuilt from the
 * engine (lib/lab/runs.ts). Reading is direct (row-level security: staff of the same school).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`lab-runs:${staff.id}`, ...limitOf('labRuns')).allowed) return NextResponse.json({ error: 'Too many saves at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const id = str(b?.id, 40);
  if (!UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const cls = str(b?.class, 40), asked = str(b?.subject, 60);
  if (!cls || !asked) return NextResponse.json({ error: 'Pick the class you are presenting to.' }, { status: 400 });
  const subject = officialName(cls, asked);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject) && !inScope(staff.scope, cls, asked)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const scene = validateScene(b?.scene);
  if (!scene) return NextResponse.json({ error: 'That set-up isn’t one the simulation accepts.' }, { status: 400 });
  const results = buildRunResults(scene, b?.answers);

  // A demo link is kept only when it is a saved demo of this school.
  let sceneId: string | null = null;
  if (typeof b?.sceneId === 'string' && UUID.test(b.sceneId)) {
    const { data } = await db.from('lab_scenes').select('id').eq('id', b.sceneId).eq('school_id', staff.schoolId).maybeSingle();
    sceneId = data?.id ?? null;
  }

  const { data: existing } = await db.from('lab_runs').select('id, teacher_id, school_id, class, subject').eq('id', id).maybeSingle();
  if (existing && (existing.teacher_id !== staff.id || existing.school_id !== staff.schoolId)) return NextResponse.json({ error: 'That run belongs to someone else.' }, { status: 403 });
  if (existing && (existing.class !== cls || existing.subject !== subject)) return NextResponse.json({ error: 'A run stays with the class it started with.' }, { status: 409 });

  const row = {
    class: cls, subject, chapter: results[0]?.chapter ?? engineById(scene.engine)!.chapters[0], engine: scene.engine, scene, scene_id: sceneId, results,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db.from('lab_runs').update(row).eq('id', id)
    : await db.from('lab_runs').insert({ id, school_id: staff.schoolId, teacher_id: staff.id, ...row });
  if (error) { console.error('[lab runs POST]', error.message); return NextResponse.json({ error: 'Could not save the class’s answers.' }, { status: 500 }); }
  return NextResponse.json({ success: true, questions: results.length });
}
