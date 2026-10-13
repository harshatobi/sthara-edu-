import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { caseRef, taskDue } from '@/lib/ops/desk';
import { loadOperators } from '@/lib/ops/org';
import { can, reportsOf } from '@/lib/ops/roles';
import { loadSight, visibleSchoolIds } from '@/lib/ops/scope';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * GET /api/ops/tasks?view=mine|team|all — open follow-ups across the schools in sight (and the last 30 finished):
 * mine, those of the people who report to me, or everyone's. Overdue first.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'crm.read');
  if (op instanceof Response) return op;
  const view = ['mine', 'team', 'all'].includes(req.nextUrl.searchParams.get('view') || '') ? req.nextUrl.searchParams.get('view')! : 'mine';
  const db = createAdminClient();
  const [tasks, visible, ops, schools] = await Promise.all([
    db.from('ops_tasks').select('id, school_id, case_id, title, note, due_on, priority, status, owner_id, created_by, created_at, done_at').order('created_at', { ascending: false }).limit(3000),
    visibleSchoolIds(db, await loadSight(db, op)), loadOperators(db), db.from('schools').select('id, name'),
  ]);
  if (tasks.error) return NextResponse.json({ error: tasks.error.message }, { status: 500 });
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const schoolOf = new Map((schools.data || []).map(s => [s.id as string, s.name as string]));
  const team = reportsOf(ops.filter(o => o.active).map(o => ({ id: o.id, managerId: o.managerId })), op.id);
  const caseIds = [...new Set((tasks.data || []).map(t => t.case_id).filter(Boolean))] as string[];
  const cases = caseIds.length ? (await db.from('ops_cases').select('id, number').in('id', caseIds)).data || [] : [];
  const numberOf = new Map(cases.map(c => [c.id as string, c.number as number]));
  const today = todayIST();
  const rank = { overdue: 0, today: 1, upcoming: 2, no_date: 3 };
  const inSight = (t: { school_id: string | null; owner_id: string | null; created_by: string | null }) =>
    t.school_id ? !visible || visible.has(t.school_id) : t.owner_id === op.id || t.created_by === op.id || !visible;
  const all = (tasks.data || []).filter(inSight)
    .filter(t => view === 'all' || (view === 'team' ? !!t.owner_id && team.has(t.owner_id) : t.owner_id === op.id));
  const shape = (t: (typeof all)[number]) => ({
    id: t.id, title: t.title, note: t.note, dueOn: t.due_on, priority: t.priority, status: t.status, doneAt: t.done_at,
    schoolId: t.school_id, school: t.school_id ? schoolOf.get(t.school_id) ?? 'Deleted school' : null,
    caseId: t.case_id, caseRef: t.case_id && numberOf.get(t.case_id) ? caseRef(numberOf.get(t.case_id)!) : null,
    ownerId: t.owner_id, owner: t.owner_id ? nameOf.get(t.owner_id) ?? 'Former operator' : null, due: taskDue(t.due_on, today),
  });
  const open = all.filter(t => t.status === 'open').map(shape).sort((a, b) => rank[a.due] - rank[b.due] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'));
  return NextResponse.json({
    view, today, open,
    done: all.filter(t => t.status !== 'open').map(shape).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 30),
    counts: { overdue: open.filter(t => t.due === 'overdue').length, today: open.filter(t => t.due === 'today').length },
    hasTeam: team.size > 0, canWrite: can(op.role, 'crm.write'),
  });
}

/** PATCH /api/ops/tasks — { id, status: 'open' | 'done' | 'cancelled' } for a follow-up that is yours or in a school you can see. */
export async function PATCH(req: NextRequest) {
  const op = await operatorFor(req, 'crm.write');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== 'string' || !UUID.test(b.id) || !['open', 'done', 'cancelled'].includes(b.status)) return NextResponse.json({ error: 'Pick a follow-up and a status.' }, { status: 400 });
  const db = createAdminClient();
  const { data: t } = await db.from('ops_tasks').select('id, school_id, owner_id, created_by').eq('id', b.id).maybeSingle();
  const visible = t ? await visibleSchoolIds(db, await loadSight(db, op)) : null;
  const allowed = t && (t.school_id ? !visible || visible.has(t.school_id) : t.owner_id === op.id || t.created_by === op.id || !visible);
  if (!allowed) return NextResponse.json({ error: 'That follow-up no longer exists.' }, { status: 404 });
  const { error } = await db.from('ops_tasks').update({ status: b.status, done_at: b.status === 'done' ? new Date().toISOString() : null }).eq('id', b.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
