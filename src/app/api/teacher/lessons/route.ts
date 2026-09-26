import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { CURRENT_SESSION } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

/**
 * Lesson plans.
 *   POST   create  { class, subject, chapterKey, chapterName, title, ...fields }
 *   PATCH  update  { id, ...fields }   (status 'taught' also marks its topics taught)
 *   DELETE remove  { id }
 * A teacher edits their own plans for classes they teach; admins any in school.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v: unknown, n = 12, len = 400) => (Array.isArray(v) ? v.map(x => str(x, len)).filter(Boolean).slice(0, n) : []);

/** Validated column values for whichever fields the body carries. */
function fields(b: any): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  if (b.title !== undefined) { row.title = str(b.title, 200); if (!row.title) return { row, error: 'Give the lesson a title.' }; }
  if (b.chapterKey !== undefined) row.chapter_key = str(b.chapterKey, 200);
  if (b.chapterName !== undefined) row.chapter_name = str(b.chapterName, 200);
  if (b.topics !== undefined) row.topics = list(b.topics, 30, 500);
  if (b.date !== undefined) row.lesson_date = typeof b.date === 'string' && ISO.test(b.date) ? b.date : null;
  if (b.period !== undefined) { const p = Number(b.period); row.period = Number.isInteger(p) && p >= 1 && p <= 12 ? p : null; }
  if (b.durationMin !== undefined) { const d = Number(b.durationMin); if (!Number.isInteger(d) || d < 10 || d > 240) return { row, error: 'Duration must be 10 to 240 minutes.' }; row.duration_min = d; }
  if (b.objectives !== undefined) row.objectives = list(b.objectives);
  if (b.successCriteria !== undefined) row.success_criteria = list(b.successCriteria);
  if (b.priorKnowledge !== undefined) row.prior_knowledge = str(b.priorKnowledge) || null;
  if (b.materials !== undefined) {
    row.materials = (Array.isArray(b.materials) ? b.materials : []).slice(0, 20)
      .map((m: any) => ({ label: str(m?.label, 200), ...(/^https?:\/\//i.test(str(m?.url, 1000)) ? { url: str(m.url, 1000) } : {}) }))
      .filter((m: any) => m.label);
  }
  if (b.stages !== undefined) {
    row.stages = (Array.isArray(b.stages) ? b.stages : []).slice(0, 10).map((s: any) => ({
      name: str(s?.name, 80) || 'Stage', minutes: Math.max(0, Math.min(240, Math.round(Number(s?.minutes) || 0))),
      teacher: str(s?.teacher, 1500), students: str(s?.students, 1500),
    }));
  }
  if (b.differentiation !== undefined) row.differentiation = { support: str(b.differentiation?.support, 1500), stretch: str(b.differentiation?.stretch, 1500) };
  if (b.checkForUnderstanding !== undefined) row.check_for_understanding = str(b.checkForUnderstanding) || null;
  if (b.homeworkAssignmentId !== undefined) row.homework_assignment_id = typeof b.homeworkAssignmentId === 'string' && b.homeworkAssignmentId ? b.homeworkAssignmentId : null;
  if (b.status !== undefined) { if (!['draft', 'ready', 'taught'].includes(b.status)) return { row, error: 'Unknown status.' }; row.status = b.status; }
  if (b.reflection !== undefined) row.reflection = str(b.reflection, 4000) || null;
  if (b.aiDrafted !== undefined) row.ai_drafted = !!b.aiDrafted;
  return { row };
}

async function ownedLesson(db: SupabaseClient, staff: Staff, id: unknown) {
  if (typeof id !== 'string' || !id) return { error: NextResponse.json({ error: 'id is required' }, { status: 400 }) };
  const { data } = await db.from('lesson_plans').select('*').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: 'Lesson not found.' }, { status: 404 }) };
  if (staff.role === 'teacher' && data.teacher_id !== staff.id) return { error: NextResponse.json({ error: 'You can only change your own lesson plans.' }, { status: 403 }) };
  return { lesson: data };
}

/** The homework link must point at an assignment in the same school. */
async function checkHomework(db: SupabaseClient, staff: Staff, id: unknown) {
  if (typeof id !== 'string' || !id) return true;
  const { data } = await db.from('assignments').select('id').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  return !!data;
}

/** Marking a lesson taught marks its topics taught (without undoing anything already taught). */
async function markTopicsTaught(db: SupabaseClient, staff: Staff, l: any) {
  if (!l.topics?.length) return;
  const on = l.taught_on || l.lesson_date || new Date().toISOString().slice(0, 10);
  const { error } = await db.from('syllabus_progress').upsert(
    l.topics.map((t: string) => ({
      school_id: l.school_id, class: l.class, subject: l.subject, session: l.session, chapter_key: l.chapter_key,
      topic: t, status: 'taught', taught_on: on, updated_by: staff.id,
    })),
    { onConflict: 'school_id,class,subject,session,chapter_key,topic', ignoreDuplicates: false },
  );
  if (error) console.error('[lessons] coverage update failed:', error.message);
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`lessons:${staff.id}`, ...limitOf('lessons')).allowed) return NextResponse.json({ error: 'Too many changes at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), subject = str(b?.subject, 60);
  if (!cls || !subject) return NextResponse.json({ error: 'class and subject are required' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  const { row, error } = fields(b ?? {});
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!row.title || !row.chapter_key || !row.chapter_name) return NextResponse.json({ error: 'A lesson needs a title and a chapter.' }, { status: 400 });
  if (!(await checkHomework(db, staff, row.homework_assignment_id))) return NextResponse.json({ error: 'That homework isn’t in your school.' }, { status: 400 });
  if (row.status === 'taught') row.taught_on = row.lesson_date ?? new Date().toISOString().slice(0, 10);
  const { data, error: dbErr } = await db.from('lesson_plans')
    .insert({ ...row, school_id: staff.schoolId, teacher_id: staff.id, class: cls, subject, session: CURRENT_SESSION }).select('*').single();
  if (dbErr) { console.error('[lessons POST]', dbErr.message); return NextResponse.json({ error: 'Could not save the lesson.' }, { status: 500 }); }
  if (data.status === 'taught') await markTopicsTaught(db, staff, data);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const b = await req.json().catch(() => null);
  const owned = await ownedLesson(db, staff, b?.id);
  if ('error' in owned) return owned.error;
  const { row, error } = fields(b ?? {});
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!(await checkHomework(db, staff, row.homework_assignment_id))) return NextResponse.json({ error: 'That homework isn’t in your school.' }, { status: 400 });
  const becameTaught = row.status === 'taught' && owned.lesson.status !== 'taught';
  if (becameTaught) row.taught_on = (row.lesson_date as string | null) ?? owned.lesson.lesson_date ?? new Date().toISOString().slice(0, 10);
  if (row.status && row.status !== 'taught') row.taught_on = null;
  const { data, error: dbErr } = await db.from('lesson_plans').update(row).eq('id', owned.lesson.id).select('*').single();
  if (dbErr) { console.error('[lessons PATCH]', dbErr.message); return NextResponse.json({ error: 'Could not update the lesson.' }, { status: 500 }); }
  if (becameTaught) await markTopicsTaught(db, staff, data);
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const b = await req.json().catch(() => null);
  const owned = await ownedLesson(db, staff, b?.id);
  if ('error' in owned) return owned.error;
  const { error } = await db.from('lesson_plans').delete().eq('id', owned.lesson.id);
  if (error) return NextResponse.json({ error: 'Could not delete the lesson.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
