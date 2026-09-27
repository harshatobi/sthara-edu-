import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageIncidents, requireFeedCaller, type FeedCaller } from '@/lib/feed/access';
import {
  incidentDraft, incidentNotice, incidentSeverity, INCIDENT_CATEGORIES, INCIDENT_RULES, type IncidentCategory, type ParentNotice,
} from '@/lib/feed/rules';
import { raise } from '@/lib/feed/raise';
import { notifyGuardians } from '@/lib/parent/notify';
import { displayClass, normClass } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** What parents get: the category and summary only; details stay with the school. */
async function tellParents(db: SupabaseClient, schoolId: string, inc: any) {
  if (!inc.student_id) return 0;
  const label = INCIDENT_RULES[inc.category as IncidentCategory].label.toLowerCase();
  const r = await notifyGuardians(db, {
    schoolId, studentId: inc.student_id, type: 'incident', pref: 'alerts',
    title: `A ${label} matter at school today`,
    body: `${inc.summary}. Please contact the class teacher if you would like to talk about it.`,
    metadata: { incidentId: inc.id, category: inc.category },
  });
  return r.parents;
}

/** Keeps the feed item's line about parents in step with the incident. */
async function syncFeed(db: SupabaseClient, schoolId: string, inc: any, loggedByName: string) {
  const d = incidentDraft({
    id: inc.id, category: inc.category, severity: inc.severity, summary: inc.summary, studentId: inc.student_id, studentName: inc.student_name ?? null,
    className: inc.class_name, location: inc.location, loggedByName, notice: inc.parent_notice,
  });
  await db.from('situations').update({ message: d.message, metadata: d.metadata }).eq('school_id', schoolId).eq('dedupe_key', d.dedupeKey);
}

/** May this caller decide on telling parents for this incident? */
function mayDecide(me: FeedCaller, inc: { parent_notice: ParentNotice; class_name: string | null }) {
  if (canManageIncidents(me)) return true;
  return inc.parent_notice === 'awaiting_class_teacher' && me.role === 'teacher' && !!me.classTeacherOf && me.classTeacherOf === normClass(inc.class_name);
}

/**
 * POST /api/staff/incidents   log an incident (any teacher or office staff)
 *   { category, summary, details?, location?, occurredAt?, studentId?, className?, urgent? }
 * PATCH /api/staff/incidents  act on one
 *   { id, action: 'notify' | 'decline' | 'close', outcome? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedCaller(req);
  if ('res' in auth) return auth.res;
  const { me, db } = auth;
  const b = await req.json().catch(() => ({}));

  const category = b.category as IncidentCategory;
  if (!INCIDENT_CATEGORIES.includes(category)) return bad('Choose what kind of incident this is.');
  const summary = str(b.summary, 160);
  if (summary.length < 3) return bad('Give a one-line summary.');
  const details = str(b.details, 4000) || null;
  const location = str(b.location, 120) || null;
  const occurredAt = typeof b.occurredAt === 'string' && !Number.isNaN(Date.parse(b.occurredAt)) ? new Date(b.occurredAt) : new Date();
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) return bad("An incident can't be in the future.");

  let student: { id: string; name: string | null; student_class: string | null } | null = null;
  if (b.studentId) {
    if (!isUuid(b.studentId)) return bad('Which student?');
    const { data } = await db.from('users').select('id, name, student_class, school_id, role').eq('id', b.studentId).maybeSingle();
    if (!data || data.school_id !== me.schoolId || data.role !== 'student') return bad('That student is not in your school.');
    student = data;
  }
  const className = student?.student_class || str(b.className, 40) || null;
  if (!student && !className && category !== 'safety' && category !== 'property') return bad('Name the student or at least the class involved.');

  const severity = incidentSeverity(category, b.urgent === true);
  const notice = incidentNotice(category, !!student);
  const { data: inc, error } = await db.from('incidents').insert({
    school_id: me.schoolId, student_id: student?.id ?? null, class_name: className ? displayClass(className) : null, category, severity,
    summary, details, location, occurred_at: occurredAt.toISOString(), logged_by: me.id, parent_notice: notice,
    parent_notice_by: notice === 'sent' ? me.id : null, parent_notice_at: notice === 'sent' ? new Date().toISOString() : null,
  }).select('*').single();
  if (error || !inc) {
    console.error('[incidents]', error?.message);
    return bad('Could not log the incident. Try again.', 500);
  }

  let parents = 0;
  if (notice === 'sent') parents = await tellParents(db, me.schoolId, inc);
  try {
    await raise(db, me.schoolId, [incidentDraft({
      id: inc.id, category, severity, summary, studentId: student?.id ?? null, studentName: student?.name ?? null,
      className: inc.class_name, location, loggedByName: me.name, notice,
    })]);
  } catch (e: any) {
    console.warn('[incidents] feed raise failed:', e?.message);
  }
  return NextResponse.json({ ok: true, id: inc.id, severity, parentNotice: notice, parentsTold: parents, hint: INCIDENT_RULES[category].hint });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireFeedCaller(req);
  if ('res' in auth) return auth.res;
  const { me, db } = auth;
  const b = await req.json().catch(() => ({}));
  if (!isUuid(b.id)) return bad('Which incident?');
  const { data: inc } = await db.from('incidents').select('*, logger:users!incidents_logged_by_fkey(name), student:users!incidents_student_id_fkey(name)').eq('id', b.id).maybeSingle();
  if (!inc || inc.school_id !== me.schoolId) return bad('Incident not found.', 404);
  if (inc.category === 'child_protection' && !canManageIncidents(me) && inc.logged_by !== me.id) return bad('Incident not found.', 404);
  const loggedByName = (inc as any).logger?.name || 'staff';
  const withName = { ...inc, student_name: (inc as any).student?.name ?? null };

  if (b.action === 'notify' || b.action === 'decline') {
    if (!['awaiting_class_teacher', 'principal_decides'].includes(inc.parent_notice)) return bad('Parents have already been decided on for this incident.');
    if (!mayDecide(me, inc)) {
      return bad(inc.parent_notice === 'principal_decides' ? 'The principal decides on telling parents for this incident.' : 'The class teacher or the principal confirms this.', 403);
    }
    const next: ParentNotice = b.action === 'notify' ? 'sent' : 'declined';
    const { data: upd, error } = await db.from('incidents')
      .update({ parent_notice: next, parent_notice_by: me.id, parent_notice_at: new Date().toISOString() })
      .eq('id', inc.id).eq('parent_notice', inc.parent_notice).select('*').maybeSingle();
    if (error || !upd) return bad('Someone else just decided this. Refresh.', 409);
    const told = next === 'sent' ? await tellParents(db, me.schoolId, upd) : 0;
    await syncFeed(db, me.schoolId, { ...upd, student_name: withName.student_name }, loggedByName);
    return NextResponse.json({ ok: true, parentNotice: next, parentsTold: told });
  }

  if (b.action === 'close') {
    if (inc.status === 'closed') return NextResponse.json({ ok: true, already: true });
    const critical = inc.severity === 'critical';
    if (!canManageIncidents(me) && (critical || inc.logged_by !== me.id)) return bad('Only the principal can close this incident.', 403);
    if (['awaiting_class_teacher', 'principal_decides'].includes(inc.parent_notice)) return bad('Decide on telling parents before closing.');
    const outcome = str(b.outcome, 2000);
    if (outcome.length < 3) return bad('Record what was done before closing.');
    const { error } = await db.from('incidents').update({ status: 'closed', outcome, closed_by: me.id, closed_at: new Date().toISOString() }).eq('id', inc.id);
    if (error) return bad('Could not close. Try again.', 500);
    // Closing settles the feed item too.
    await db.from('situations').update({ acknowledged: true, acknowledged_by: me.id, ack_by_name: me.name, acknowledged_at: new Date().toISOString(), ack_note: `Closed: ${outcome.slice(0, 480)}` })
      .eq('school_id', me.schoolId).eq('dedupe_key', `incident:${inc.id}`).is('acknowledged_at', null);
    return NextResponse.json({ ok: true });
  }

  return bad('Unknown action.');
}
