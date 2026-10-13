import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor, type Operator } from '@/lib/ops/auth';
import { loadPicklist } from '@/lib/ops/deskServer';
import { loadOperators } from '@/lib/ops/org';
import { can } from '@/lib/ops/roles';
import { approvalNeeded, canDecide, daysInStage, effectiveStatus, oppRef, quoteMath, quoteMoves, quoteRef } from '@/lib/ops/sales';
import {
  OPP_COLS, QUOTE_COLS, createQuote, decideQuote, event, loadLimits, loadStages, moveQuote, submitQuote, todayIST, updateOpp, type OppRow, type QuoteRow,
} from '@/lib/ops/salesServer';
import { loadSight, loadTerritories, visibleSchoolIds } from '@/lib/ops/scope';
import { territoryPath } from '@/lib/ops/territories';
import { actorOf, oppInSight } from '../shared';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
type Db = ReturnType<typeof createAdminClient>;
const UUID = /^[0-9a-f-]{36}$/i;
const gone = () => NextResponse.json({ error: 'That deal does not exist.' }, { status: 404 });
const LOG_KINDS = ['note', 'call', 'meeting', 'email', 'whatsapp', 'visit'];

async function load(db: Db, op: Operator, id: string): Promise<OppRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db.from('ops_opportunities').select(OPP_COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  const sight = await loadSight(db, op);
  return oppInSight(sight, data as OppRow, sight.all ? null : await visibleSchoolIds(db, sight)) ? (data as OppRow) : null;
}

/** GET /api/ops/pipeline/:id — a deal in full: its fields, history, quotes with their approvals, follow-ups, and what the controls need. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'sales.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const o = await load(db, op, (await params).id);
  if (!o) return gone();
  const sight = await loadSight(db, op);
  const [visible, allSchools] = await Promise.all([visibleSchoolIds(db, sight), db.from('schools').select('id, name').order('name')]);
  const [stages, limits, reasons, ops, territories, events, quotes, tasks, school, enquiry] = await Promise.all([
    loadStages(db), loadLimits(db), loadPicklist(db, 'loss_reason', false), loadOperators(db), loadTerritories(db),
    db.from('ops_opportunity_events').select('id, at, kind, body, from_stage, to_stage, by_name').eq('opportunity_id', o.id).order('at', { ascending: false }).limit(300),
    db.from('ops_quotes').select(QUOTE_COLS).eq('opportunity_id', o.id).order('version', { ascending: false }),
    db.from('ops_tasks').select('id, title, due_on, priority, status, owner_id').eq('opportunity_id', o.id).order('status').order('due_on', { nullsFirst: false }),
    o.school_id ? db.from('schools').select('id, name, settings, trial_expires_at').eq('id', o.school_id).maybeSingle() : Promise.resolve({ data: null }),
    o.enquiry_id ? db.from('enquiries').select('id, school, message, student_count, board, improvement_goal, created_at').eq('id', o.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const quoteRows = (quotes.data || []) as QuoteRow[];
  const { data: approvals } = quoteRows.length ? await db.from('ops_quote_approvals').select('quote_id, decision, by_name, by_role, note, at').in('quote_id', quoteRows.map(q => q.id)).order('at') : { data: [] };
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(x => x.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const today = todayIST();
  const stageOf = new Map(stages.map(s => [s.key, s]));
  return NextResponse.json({
    opp: {
      id: o.id, ref: oppRef(o.number), name: o.name, kind: o.kind, stage: o.stage, stageKind: stageOf.get(o.stage)?.kind ?? 'open',
      probability: stageOf.get(o.stage)?.probability ?? 0, amount: Number(o.amount), plan: o.plan, students: o.students,
      pricePerStudent: o.price_per_student === null ? null : Number(o.price_per_student), expectedClose: o.expected_close, nextStep: o.next_step,
      contactName: o.contact_name, contactPhone: o.contact_phone, contactEmail: o.contact_email, state: o.state, district: o.district,
      territory: o.territory_id ? territoryPath(territories, o.territory_id) : null,
      ownerId: o.owner_id, owner: o.owner_id ? nameOf.get(o.owner_id) ?? 'Former operator' : null,
      schoolId: o.school_id, school: school.data?.name ?? null, schoolPlan: (school.data?.settings as { plan?: string } | null)?.plan ?? null,
      enquiryId: o.enquiry_id, lossReason: o.loss_reason, closedNote: o.closed_note, closedAt: o.closed_at, createdAt: o.created_at,
      daysInStage: daysInStage(o.stage_changed_at, Date.now()),
    },
    enquiry: enquiry.data,
    stages,
    events: (events.data || []).map(e => ({ ...e, from: e.from_stage ? stageOf.get(e.from_stage)?.label ?? e.from_stage : null, to: e.to_stage ? stageOf.get(e.to_stage)?.label ?? e.to_stage : null })),
    quotes: quoteRows.map(q => {
      const status = effectiveStatus({ status: q.status, validUntil: q.valid_until }, today);
      return {
        id: q.id, ref: quoteRef(q.number, q.version), version: q.version, plan: q.plan, students: q.students, pricePerStudent: Number(q.price_per_student),
        termMonths: q.term_months, validUntil: q.valid_until, notes: q.notes, status, needsRole: q.needs_role, createdByName: q.created_by_name, createdAt: q.created_at,
        ...quoteMath(q.plan, q.students, Number(q.price_per_student), q.term_months),
        moves: can(op.role, 'sales.work') ? quoteMoves(status) : [],
        // What submitting this draft would do, for the person looking at it.
        wouldNeed: q.status === 'draft' ? approvalNeeded(limits, op.role, q.plan, Number(q.discount_pct)) : null,
        canDecide: canDecide(limits, op, { needsRole: q.needs_role, discountPct: Number(q.discount_pct), plan: q.plan, createdBy: q.created_by, status: q.status }),
        approvals: (approvals || []).filter(a => a.quote_id === q.id),
      };
    }),
    tasks: (tasks.data || []).map(t => ({ ...t, owner: t.owner_id ? nameOf.get(t.owner_id) ?? 'Former operator' : null })),
    schools: (allSchools.data || []).filter(s => !visible || visible.has(s.id as string)),
    lossReasons: reasons,
    limits,
    myLimit: limits[op.role] ?? null,
    owners: ops.filter(x => x.active && can(x.role, 'sales.work')).map(x => ({ id: x.id, name: nameOf.get(x.id) ?? 'Operator', role: x.role })),
    can: { work: can(op.role, 'sales.work'), assign: can(op.role, 'assign'), policy: can(op.role, 'schools.policy'), createSchool: can(op.role, 'schools.create') },
    me: op.id, today,
  });
}

/** PATCH /api/ops/pipeline/:id — { name?, stage?, lossReason?, closedNote?, plan?, students?, pricePerStudent?, expectedClose?, nextStep?, contact…?, state?, district?, ownerId? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'sales.work');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const o = await load(db, op, (await params).id);
  if (!o) return gone();
  const b = await req.json().catch(() => ({}));
  // A school outside the operator's sight cannot be attached to a deal by them.
  if (typeof b.schoolId === 'string' && b.schoolId) {
    const sight = await loadSight(db, op);
    if (!sight.all && !(await visibleSchoolIds(db, sight))?.has(b.schoolId)) return NextResponse.json({ error: 'That school does not exist.' }, { status: 404 });
  }
  const out = await updateOpp(db, await actorOf(db, op), o, b);
  return out.ok ? NextResponse.json({ ok: true, changed: out.changed }) : NextResponse.json({ error: out.error }, { status: out.status });
}

/**
 * POST /api/ops/pipeline/:id
 *   { action: 'log', kind: 'note' | 'call' | 'meeting' | 'email' | 'whatsapp' | 'visit', body }
 *   { action: 'task', title, dueOn? }
 *   { action: 'quote', plan, students, pricePerStudent, termMonths?, validUntil, notes? }     a new draft version
 *   { action: 'quote-submit', quoteId }                                                       approved at once, or sent for approval
 *   { action: 'quote-decide', quoteId, approve, note? }                                       for an approver (needs sales.read only)
 *   { action: 'quote-move', quoteId, move: 'send' | 'accept' | 'decline' | 'revise' }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const b = await req.clone().json().catch(() => ({}));
  const op = await operatorFor(req, b.action === 'quote-decide' ? 'sales.read' : 'sales.work');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const o = await load(db, op, (await params).id);
  if (!o) return gone();
  const by = await actorOf(db, op);
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

  if (b.action === 'log') {
    const body = typeof b.body === 'string' ? b.body.trim().slice(0, 6000) : '';
    if (!LOG_KINDS.includes(b.kind) || !body) return bad('Pick what happened and say what was said.');
    await event(db, o.id, by, b.kind, body);
    await db.from('ops_opportunities').update({ updated_at: new Date().toISOString() }).eq('id', o.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'task') {
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
    if (title.length < 2) return bad('Say what needs doing.');
    const dueOn = typeof b.dueOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dueOn) ? b.dueOn : null;
    const { error } = await db.from('ops_tasks').insert({ title, due_on: dueOn, opportunity_id: o.id, school_id: o.school_id, owner_id: op.id, created_by: op.id, note: `${oppRef(o.number)} ${o.name}` });
    return error ? bad(error.message, 500) : NextResponse.json({ ok: true });
  }
  if (b.action === 'quote') {
    const out = await createQuote(db, by, o, b);
    return out.ok ? NextResponse.json({ ok: true, id: out.id, ref: out.ref }) : bad(out.error, out.status);
  }
  if (typeof b.quoteId !== 'string' || !UUID.test(b.quoteId)) return bad('Pick a quote.');
  const { data: q } = await db.from('ops_quotes').select(QUOTE_COLS).eq('id', b.quoteId).eq('opportunity_id', o.id).maybeSingle();
  if (!q) return bad('That quote does not exist.', 404);
  const out = b.action === 'quote-submit' ? await submitQuote(db, by, o, q as QuoteRow)
    : b.action === 'quote-decide' ? await decideQuote(db, by, o, q as QuoteRow, b.approve === true, typeof b.note === 'string' ? b.note : '')
    : b.action === 'quote-move' ? await moveQuote(db, by, o, q as QuoteRow, String(b.move ?? ''))
    : null;
  if (!out) return bad('Unknown action');
  return out.ok ? NextResponse.json(out) : bad(out.error, out.status);
}
