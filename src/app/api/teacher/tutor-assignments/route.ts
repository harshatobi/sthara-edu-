import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { pageAll } from '@/lib/ops/page';
import { syncGapsFor } from '@/lib/tutor/assignmentsServer';

export const dynamic = 'force-dynamic';

/**
 * Tutor session assignments for a teacher's class (Socratic tutor PR2).
 *
 *   GET    ?class=&subject=                         open and recent (30 days) assignments for the class
 *   POST   { class, subject, topic, mode, studentIds?, dueOn?, note? }
 *          studentIds omitted = the whole class (one batch)
 *   DELETE ?id=  or  ?batch=                         cancel open ones you set (an admin may cancel any)
 *
 * Only for a class and subject the teacher teaches. Critical Gap assignments are the
 * system's and can't be cancelled here; they clear when the chapter recovers.
 */

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function rosterOf(db: SupabaseClient, staff: Staff, cls: string) {
  const r = await pageAll<{ id: string; name: string | null; student_class: string | null }>((a, b) => db.from('users').select('id, name, student_class')
    .eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b));
  return r.data.filter(s => normClass(s.student_class) === normClass(cls));
}

const allowed = (staff: Staff, cls: string, subject: string) => staff.role === 'admin' || inScope(staff.scope, cls, subject);

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = str(req.nextUrl.searchParams.get('class'), 40);
  const subject = str(req.nextUrl.searchParams.get('subject'), 80);
  if (!cls || !subject) return bad('Pick a class and subject.');
  if (!allowed(staff, cls, subject)) return bad('You don’t teach that class and subject.', 403);
  const roster = await rosterOf(db, staff, cls);
  const ids = roster.map(s => s.id);
  if (!ids.length) return NextResponse.json({ assignments: [] });
  // Bring the class's Critical Gap sessions up to date first (snapshots can be older than the feed scan's window).
  await syncGapsFor(db, staff.schoolId, roster);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from('tutor_assignments')
      .select('id, student_id, subject, topic, mode, source, status, due_on, note, trigger_score, batch_id, assigned_by, created_at, closed_at, close_reason, session_id, tutor_sessions!tutor_assignments_session_id_fkey(depth_score)')
      .eq('school_id', staff.schoolId).ilike('subject', subject.replace(/[\\%_]/g, m => `\\${m}`)).in('student_id', ids.slice(i, i + 150))
      .or(`status.eq.open,closed_at.gte.${since}`).order('created_at', { ascending: false }).limit(1000);
    if (error) return bad('Could not load tutor assignments.', 500);
    out.push(...(data ?? []));
  }
  return NextResponse.json({
    assignments: out.map(r => ({
      id: r.id, studentId: r.student_id, topic: r.topic, mode: r.mode, source: r.source, status: r.status, dueOn: r.due_on, note: r.note,
      score: r.trigger_score === null ? null : Number(r.trigger_score), batchId: r.batch_id, mine: r.assigned_by === staff.id,
      createdAt: r.created_at, closedAt: r.closed_at, closeReason: r.close_reason,
      depth: r.tutor_sessions?.depth_score == null ? null : Number(r.tutor_sessions.depth_score),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`assignments:${staff.id}`, ...limitOf('assignments')).allowed) return bad('That’s a lot of assigning in a short time. Give it a few minutes.', 429);
  let b: any;
  try { b = await req.json(); } catch { return bad('Invalid JSON'); }
  const cls = str(b?.class, 40), subject = str(b?.subject, 80), topic = str(b?.topic, 200), note = str(b?.note, 300) || null;
  const mode = b?.mode === 'hots' ? 'hots' : 'standard';
  const dueOn = typeof b?.dueOn === 'string' && DAY.test(b.dueOn) ? b.dueOn : null;
  if (!cls || !subject || !topic) return bad('Pick the class, subject and chapter.');
  if (!allowed(staff, cls, subject)) return bad('You don’t teach that class and subject.', 403);
  if (dueOn && dueOn < new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)) return bad('The due date has passed.');
  const roster = await rosterOf(db, staff, cls);
  const wanted: string[] | null = Array.isArray(b?.studentIds) ? b.studentIds.filter((x: unknown): x is string => typeof x === 'string') : null;
  const targets = wanted ? roster.filter(s => wanted.includes(s.id)) : roster;
  if (!targets.length) return bad(wanted ? 'Those students aren’t in this class.' : `No students in ${cls} yet.`);
  if (targets.length > 80) return bad('Assign to at most 80 students at once.');
  const batch = wanted && wanted.length === 1 ? null : randomUUID();

  let created = 0, already = 0;
  for (const s of targets) {
    const { error } = await db.from('tutor_assignments').insert({
      school_id: staff.schoolId, student_id: s.id, subject, topic, mode, source: 'teacher', assigned_by: staff.id, batch_id: batch, due_on: dueOn, note,
    });
    if (!error) created++;
    else if (error.code === '23505') already++; // an open one on this chapter and mode already exists
    else return bad(`Could not assign: ${error.message}`, 500);
  }
  return NextResponse.json({ created, already, batchId: batch });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const id = str(req.nextUrl.searchParams.get('id'), 40), batch = str(req.nextUrl.searchParams.get('batch'), 40);
  if (!id && !batch) return bad('Which assignment?');
  let q = db.from('tutor_assignments').update({ status: 'cancelled', closed_at: new Date().toISOString(), close_reason: `Cancelled by ${staff.name}` })
    .eq('school_id', staff.schoolId).eq('status', 'open').eq('source', 'teacher');
  q = id ? q.eq('id', id) : q.eq('batch_id', batch);
  if (staff.role !== 'admin') q = q.eq('assigned_by', staff.id);
  const { data, error } = await q.select('id');
  if (error) return bad('Could not cancel.', 500);
  if (!data?.length) return bad('Nothing open to cancel (only your own, and not Critical Gap ones).', 404);
  return NextResponse.json({ cancelled: data.length });
}
