import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { QUEUES, byUrgency, inQueue, isCaseSource, isPriority, isQueue, slaState } from '@/lib/ops/desk';
import { CASE_COLS, clocked, createCase, loadPicklist, type CaseRow } from '@/lib/ops/deskServer';
import { loadOperators } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { canSeeSchool, loadSight, visibleSchoolIds } from '@/lib/ops/scope';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/desk?queue=mine|unassigned|open|breaching|waiting|resolved|all&school=&q=
 * The service desk: the cases in a queue (most pressing first), how many sit in each queue, and what the
 * forms need (categories, operators who work the desk, the schools in sight). Operators who work a territory
 * get its schools' cases only.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'desk.read');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  const queue = isQueue(sp.get('queue')) ? sp.get('queue') as (typeof QUEUES)[number] : 'open';
  const school = UUID.test(sp.get('school') || '') ? sp.get('school')! : null;
  const q = (sp.get('q') || '').trim().toLowerCase().slice(0, 80);
  const db = createAdminClient();
  let cq = db.from('ops_cases').select(CASE_COLS).order('created_at', { ascending: false }).limit(2000);
  if (school) cq = cq.eq('school_id', school);
  const [cases, visible, schools, categories, ops] = await Promise.all([
    cq, visibleSchoolIds(db, await loadSight(db, op)), db.from('schools').select('id, name, settings'), loadPicklist(db, 'case_category', false), loadOperators(db),
  ]);
  if (cases.error) return NextResponse.json({ error: cases.error.message }, { status: 500 });
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const schoolOf = new Map((schools.data || []).map(s => [s.id as string, { name: s.name as string, code: (s.settings as { code?: string } | null)?.code ?? null }]));

  const now = Date.now();
  const mine = ((cases.data || []) as CaseRow[]).filter(c => !visible || visible.has(c.school_id));
  const counts = Object.fromEntries(QUEUES.map(k => [k, mine.filter(c => inQueue(clocked(c), k, op.id, now)).length]));
  const num = /^(case-)?(\d+)$/.exec(q)?.[2];
  const shown = mine
    .filter(c => inQueue(clocked(c), queue, op.id, now))
    .filter(c => !q || (num ? String(c.number) === num : `${c.subject} ${schoolOf.get(c.school_id)?.name ?? ''} ${c.raised_by_name ?? ''}`.toLowerCase().includes(q)))
    .sort((a, b) => byUrgency(now)(clocked(a), clocked(b)))
    .slice(0, 300);

  return NextResponse.json({
    queue, counts,
    cases: shown.map(c => ({
      id: c.id, number: c.number, subject: c.subject, category: c.category, priority: c.priority, status: c.status, source: c.source,
      schoolId: c.school_id, school: schoolOf.get(c.school_id)?.name ?? 'Deleted school', raisedByName: c.raised_by_name,
      ownerId: c.owner_id, owner: c.owner_id ? nameOf.get(c.owner_id) ?? 'Former operator' : null,
      createdAt: c.created_at, updatedAt: c.updated_at, reopened: c.reopened,
      // The school has written since Sthara last did.
      awaitingSthara: !!c.last_school_at && (!c.last_operator_at || c.last_school_at > c.last_operator_at) && c.status !== 'resolved' && c.status !== 'closed',
      sla: slaState(clocked(c), now),
    })),
    categories,
    owners: ops.filter(o => o.active && can(o.role, 'desk.work')).map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    schools: [...schoolOf].filter(([id]) => !visible || visible.has(id)).map(([id, s]) => ({ id, name: s.name, code: s.code })).sort((a, b) => a.name.localeCompare(b.name)),
    can: { work: can(op.role, 'desk.work'), admin: can(op.role, 'desk.admin') },
    me: op.id,
  });
}

/**
 * POST /api/ops/desk — { schoolId, subject, description, category, priority, source, raisedByName?, contactId? }
 * Logs a case on a school's behalf (it rang, emailed or messaged). It is owned by whoever logs it.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'desk.work');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  if (typeof b.schoolId !== 'string' || !UUID.test(b.schoolId)) return NextResponse.json({ error: 'Pick the school.' }, { status: 400 });
  const db = createAdminClient();
  const { data: school } = await db.from('schools').select('id').eq('id', b.schoolId).maybeSingle();
  if (!school || !(await canSeeSchool(db, op, b.schoolId))) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  const { data: me } = await db.from('users').select('name').eq('id', op.id).maybeSingle();
  const out = await createCase(db, {
    schoolId: b.schoolId, subject: String(b.subject ?? ''), body: String(b.description ?? ''), category: String(b.category ?? 'other'),
    priority: isPriority(b.priority) ? b.priority : 'normal', source: isCaseSource(b.source) && b.source !== 'school_portal' ? b.source : 'operator',
    by: { kind: 'operator', id: op.id, name: me?.name || op.email },
    raisedByName: typeof b.raisedByName === 'string' ? b.raisedByName.trim().slice(0, 120) || null : null,
    contactId: typeof b.contactId === 'string' && UUID.test(b.contactId) ? b.contactId : null, ownerId: op.id,
  });
  return out.ok ? NextResponse.json({ ok: true, id: out.id, number: out.number }) : NextResponse.json({ error: out.error }, { status: out.status });
}
