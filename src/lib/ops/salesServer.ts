import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePlacement } from './org';
import { can, isOperatorRole, type OperatorRole } from './roles';
import {
  DEFAULT_LIMITS, approvalNeeded, canDecide, isOppKind, moveProblem, oppRef, quoteMath, quoteMoves, quoteProblem, quoteRef,
  type DiscountLimits, type OppKind, type QuotePlan, type QuoteStatus, type Stage,
} from './sales';
import { PLANS, type Plan } from '@/lib/settings/registry';

/** The sales pipeline's reads and writes, behind /api/ops/pipeline. */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; email: string; role: OperatorRole; name: string }

export const OPP_COLS = 'id, number, name, kind, stage, enquiry_id, school_id, plan, students, price_per_student, amount, expected_close, next_step, contact_name, contact_phone, contact_email, state, district, territory_id, owner_id, loss_reason, closed_note, closed_at, stage_changed_at, created_by, created_at, updated_at';
export interface OppRow {
  id: string; number: number; name: string; kind: OppKind; stage: string; enquiry_id: string | null; school_id: string | null;
  plan: Plan | null; students: number | null; price_per_student: number | null; amount: number; expected_close: string | null; next_step: string | null;
  contact_name: string | null; contact_phone: string | null; contact_email: string | null; state: string | null; district: string | null;
  territory_id: string | null; owner_id: string | null; loss_reason: string | null; closed_note: string | null; closed_at: string | null;
  stage_changed_at: string; created_by: string | null; created_at: string; updated_at: string;
}
export const QUOTE_COLS = 'id, number, opportunity_id, version, plan, students, list_price, price_per_student, discount_pct, term_months, valid_until, notes, status, needs_role, created_by, created_by_name, created_at, updated_at';
export interface QuoteRow {
  id: string; number: number; opportunity_id: string; version: number; plan: QuotePlan; students: number; list_price: number | null; price_per_student: number;
  discount_pct: number; term_months: number; valid_until: string; notes: string | null; status: QuoteStatus; needs_role: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
}

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export async function loadStages(db: Db): Promise<Stage[]> {
  const { data } = await db.from('ops_opportunity_stages').select('key, label, sort, probability, kind, active').order('sort');
  return (data || []) as Stage[];
}

export async function loadLimits(db: Db): Promise<DiscountLimits> {
  const { data, error } = await db.from('ops_discount_limits').select('role, max_pct');
  if (error || !data?.length) return DEFAULT_LIMITS;
  return Object.fromEntries(data.filter(r => isOperatorRole(r.role)).map(r => [r.role, Number(r.max_pct)])) as DiscountLimits;
}

export async function event(db: Db, oppId: string, by: Actor | null, kind: string, body: string | null, stages?: { from?: string; to?: string }) {
  const { error } = await db.from('ops_opportunity_events').insert({
    opportunity_id: oppId, kind, body: body?.slice(0, 6000) ?? null, from_stage: stages?.from ?? null, to_stage: stages?.to ?? null,
    by_id: by?.id ?? null, by_name: by?.name ?? null,
  });
  if (error) console.warn('[pipeline] event:', error.message);
}

export interface OppInput {
  name?: unknown; kind?: unknown; enquiryId?: unknown; schoolId?: unknown; plan?: unknown; students?: unknown; pricePerStudent?: unknown;
  expectedClose?: unknown; nextStep?: unknown; contactName?: unknown; contactPhone?: unknown; contactEmail?: unknown; state?: unknown; district?: unknown; ownerId?: unknown;
}

/** The priced part of a deal: tier, seats, price and the annual amount they come to. */
function priced(b: OppInput, current?: OppRow) {
  const plan = b.plan === undefined ? current?.plan ?? null : (PLANS as readonly unknown[]).includes(b.plan) ? (b.plan as Plan) : null;
  const students = b.students === undefined ? current?.students ?? null : Number.isInteger(Number(b.students)) && Number(b.students) > 0 ? Number(b.students) : null;
  const price = b.pricePerStudent === undefined ? (current?.price_per_student ?? null) : Number(b.pricePerStudent) > 0 ? Math.round(Number(b.pricePerStudent) * 100) / 100 : null;
  return { plan, students, price_per_student: price, amount: students && price ? Math.round(students * price * 100) / 100 : 0 };
}

export async function createOpp(db: Db, by: Actor, b: OppInput): Promise<Result<{ id: string; number: number }>> {
  const name = text(b.name, 160);
  if (name.length < 2) return fail('Name the deal: usually the school.');
  const kind: OppKind = isOppKind(b.kind) ? b.kind : 'new';
  const stages = await loadStages(db);
  const first = stages.find(s => s.active && s.kind === 'open');
  if (!first) return fail('No open stage is set up. Add one under pipeline settings.', 409);

  let state: unknown = b.state, district: unknown = b.district;
  const row: Record<string, unknown> = { name, kind, stage: first.key, created_by: by.id, next_step: text(b.nextStep, 300) || null };
  if (typeof b.schoolId === 'string' && b.schoolId) {
    const [{ data: school }, { data: acc }] = await Promise.all([
      db.from('schools').select('id').eq('id', b.schoolId).maybeSingle(),
      db.from('ops_accounts').select('state, district').eq('school_id', b.schoolId).maybeSingle(),
    ]);
    if (!school) return fail('That school does not exist.', 404);
    row.school_id = b.schoolId;
    state = state || acc?.state; district = district || acc?.district;
  } else if (kind !== 'new') return fail('A conversion, renewal or expansion belongs to a school: pick it.');
  if (typeof b.enquiryId === 'string' && b.enquiryId) {
    const { data: enq } = await db.from('enquiries').select('id, name, email, phone, state, district').eq('id', b.enquiryId).maybeSingle();
    if (!enq) return fail('That enquiry does not exist.', 404);
    row.enquiry_id = enq.id;
    row.contact_name = text(b.contactName, 120) || enq.name; row.contact_email = text(b.contactEmail, 200) || enq.email; row.contact_phone = text(b.contactPhone, 30) || enq.phone;
    state = state || enq.state; district = district || enq.district;
  } else {
    row.contact_name = text(b.contactName, 120) || null; row.contact_email = text(b.contactEmail, 200).toLowerCase() || null; row.contact_phone = text(b.contactPhone, 30) || null;
  }
  const expected = b.expectedClose ? day(b.expectedClose) : null;
  if (b.expectedClose && !expected) return fail('Check the expected close date.');
  const place = await resolvePlacement(db, { state, district, ownerId: b.ownerId });
  if (!place.ok) return place;
  Object.assign(row, priced(b), {
    expected_close: expected, state: place.state, district: place.district, territory_id: place.territoryId,
    // The writer owns a deal that lands in no territory with a default owner.
    owner_id: place.ownerId ?? by.id,
  });
  const { data, error } = await db.from('ops_opportunities').insert(row).select('id, number').single();
  if (error) return fail(error.code === '23505' ? 'That enquiry is already a deal.' : error.message, error.code === '23505' ? 409 : 500);
  await event(db, data.id, by, 'created', row.enquiry_id ? 'Created from a website enquiry.' : null, { to: first.key });
  if (row.enquiry_id) {
    await db.from('enquiries').update({ status: 'qualified', handled_by: by.id }).eq('id', row.enquiry_id as string);
  }
  return { ok: true, id: data.id, number: data.number };
}

export async function updateOpp(db: Db, by: Actor, o: OppRow, b: OppInput & { stage?: unknown; lossReason?: unknown; closedNote?: unknown }): Promise<Result<{ changed: string[] }>> {
  const patch: Record<string, unknown> = {};
  const at = new Date().toISOString();
  if (b.name !== undefined) { const n = text(b.name, 160); if (n.length < 2) return fail('Name the deal.'); if (n !== o.name) patch.name = n; }
  if (b.nextStep !== undefined && (text(b.nextStep, 300) || null) !== o.next_step) patch.next_step = text(b.nextStep, 300) || null;
  for (const [k, col, max] of [['contactName', 'contact_name', 120], ['contactPhone', 'contact_phone', 30], ['contactEmail', 'contact_email', 200]] as const) {
    if (b[k] !== undefined && (text(b[k], max) || null) !== o[col]) patch[col] = text(b[k], max) || null;
  }
  if (b.expectedClose !== undefined) {
    const d = b.expectedClose ? day(b.expectedClose) : null;
    if (b.expectedClose && !d) return fail('Check the expected close date.');
    if (d !== o.expected_close) patch.expected_close = d;
  }
  if (b.plan !== undefined || b.students !== undefined || b.pricePerStudent !== undefined) {
    const p = priced(b, o);
    if (p.plan !== o.plan || p.students !== o.students || p.price_per_student !== (o.price_per_student === null ? null : Number(o.price_per_student))) Object.assign(patch, p);
  }
  if (b.state !== undefined || b.district !== undefined || b.ownerId !== undefined) {
    if (b.ownerId !== undefined && !can(by.role, 'assign') && b.ownerId !== by.id) return fail('Your role cannot hand a deal to someone else.', 403);
    const place = await resolvePlacement(db, { state: b.state, district: b.district, ownerId: b.ownerId }, { state: o.state, district: o.district, ownerId: o.owner_id });
    if (!place.ok) return place;
    if (place.state !== o.state || place.district !== o.district || place.territoryId !== o.territory_id) Object.assign(patch, { state: place.state, district: place.district, territory_id: place.territoryId });
    if ((place.ownerId ?? null) !== o.owner_id) patch.owner_id = place.ownerId;
  }
  if (b.schoolId !== undefined && (b.schoolId || null) !== o.school_id) {
    if (b.schoolId) {
      const { data: school } = await db.from('schools').select('id').eq('id', String(b.schoolId)).maybeSingle();
      if (!school) return fail('That school does not exist.', 404);
    } else if (o.kind !== 'new') return fail('A conversion, renewal or expansion belongs to a school.');
    patch.school_id = b.schoolId || null;
  }
  let moved: { from: string; to: string } | null = null;
  if (b.stage !== undefined && b.stage !== o.stage) {
    const stages = await loadStages(db);
    const to = String(b.stage);
    const reason = typeof b.lossReason === 'string' && b.lossReason ? b.lossReason.slice(0, 40) : null;
    const amount = patch.amount !== undefined ? Number(patch.amount) : Number(o.amount);
    const bad = moveProblem(stages, { amount, stage: o.stage }, to, reason);
    if (bad) return fail(bad);
    const s = stages.find(x => x.key === to)!;
    Object.assign(patch, {
      stage: to, stage_changed_at: at, closed_at: s.kind === 'open' ? null : at,
      loss_reason: s.kind === 'lost' ? reason : null, closed_note: s.kind === 'open' ? null : text(b.closedNote, 1000) || null,
    });
    moved = { from: o.stage, to };
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { ok: true, changed };
  const { error } = await db.from('ops_opportunities').update({ ...patch, updated_at: at }).eq('id', o.id);
  if (error) return fail(error.message, 500);
  if (moved) await event(db, o.id, by, 'stage', text(b.closedNote, 1000) || null, moved);
  if (patch.owner_id !== undefined) await event(db, o.id, by, 'owner', 'Owner changed.');
  if (patch.amount !== undefined) await event(db, o.id, by, 'change', `Value set to ${Number(patch.amount).toLocaleString('en-IN')} a year (${patch.students} students at ${patch.price_per_student}).`);
  return { ok: true, changed };
}

// ── Quotes ───────────────────────────────────────────────────────────────────

export interface QuoteInput { plan?: unknown; students?: unknown; pricePerStudent?: unknown; termMonths?: unknown; validUntil?: unknown; notes?: unknown }

export async function createQuote(db: Db, by: Actor, o: OppRow, b: QuoteInput): Promise<Result<{ id: string; ref: string }>> {
  const q = {
    plan: b.plan, students: Number(b.students), pricePerStudent: Math.round(Number(b.pricePerStudent) * 100) / 100,
    termMonths: b.termMonths === undefined ? 12 : Number(b.termMonths), validUntil: String(b.validUntil ?? ''),
  };
  const bad = quoteProblem(q, todayIST());
  if (bad) return fail(bad);
  const plan = q.plan as QuotePlan;
  const m = quoteMath(plan, q.students, q.pricePerStudent, q.termMonths);
  const { data: last } = await db.from('ops_quotes').select('version').eq('opportunity_id', o.id).order('version', { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  const { data, error } = await db.from('ops_quotes').insert({
    opportunity_id: o.id, version, plan, students: q.students, list_price: m.listPrice, price_per_student: q.pricePerStudent, discount_pct: m.discountPct,
    term_months: q.termMonths, valid_until: q.validUntil, notes: typeof b.notes === 'string' ? b.notes.trim().slice(0, 3000) || null : null,
    created_by: by.id, created_by_name: by.name,
  }).select('id, number').single();
  if (error) return fail(error.message, 500);
  const ref = quoteRef(data.number, version);
  await event(db, o.id, by, 'quote', `${ref} drafted: ${q.students} students at ${q.pricePerStudent}${m.discountPct ? ` (${m.discountPct}% off list)` : ''}.`);
  return { ok: true, id: data.id, ref };
}

/** Submits a draft: it is approved on the spot when the discount is within the writer's limit, else it waits for an approver. */
export async function submitQuote(db: Db, by: Actor, o: OppRow, q: QuoteRow): Promise<Result<{ status: QuoteStatus; needs: string | null }>> {
  if (q.status !== 'draft') return fail('Only a draft can be submitted.', 409);
  if (q.valid_until < todayIST()) return fail('This draft’s validity date has passed. Make a new version.', 409);
  const needs = approvalNeeded(await loadLimits(db), by.role, q.plan, Number(q.discount_pct));
  const status: QuoteStatus = needs ? 'pending_approval' : 'approved';
  const { error } = await db.from('ops_quotes').update({ status, needs_role: needs, updated_at: new Date().toISOString() }).eq('id', q.id).eq('status', 'draft');
  if (error) return fail(error.message, 500);
  const ref = quoteRef(q.number, q.version);
  await db.from('ops_quote_approvals').insert({ quote_id: q.id, decision: needs ? 'requested' : 'approved', by_id: by.id, by_name: by.name, by_role: by.role, note: needs ? null : 'Within the writer’s own limit.' });
  await event(db, o.id, by, 'approval', needs
    ? `${ref} needs approval from a ${needs === 'director' ? 'director' : 'regional lead'}: ${Number(q.discount_pct)}% off list${q.list_price === null ? ' (custom price)' : ''}.`
    : `${ref} approved: within the writer’s limit.`);
  return { ok: true, status, needs };
}

export async function decideQuote(db: Db, by: Actor, o: OppRow, q: QuoteRow, approve: boolean, note: string): Promise<Result<{ status: QuoteStatus }>> {
  const allowed = canDecide(await loadLimits(db), by, { needsRole: q.needs_role, discountPct: Number(q.discount_pct), plan: q.plan, createdBy: q.created_by, status: q.status });
  if (!allowed) return fail(q.status !== 'pending_approval' ? 'This quote is not awaiting approval.' : q.created_by === by.id ? 'Someone else must approve a quote you wrote.' : 'This discount is above what your role can approve.', q.status !== 'pending_approval' ? 409 : 403);
  if (!approve && !note.trim()) return fail('Say why, for whoever wrote the quote.');
  const status: QuoteStatus = approve ? 'approved' : 'rejected';
  const { data, error } = await db.from('ops_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', q.id).eq('status', 'pending_approval').select('id');
  if (error) return fail(error.message, 500);
  if (!data?.length) return fail('Someone else just decided this quote.', 409);
  await db.from('ops_quote_approvals').insert({ quote_id: q.id, decision: status, by_id: by.id, by_name: by.name, by_role: by.role, note: note.trim().slice(0, 1000) || null });
  await event(db, o.id, by, 'approval', `${quoteRef(q.number, q.version)} ${approve ? 'approved' : 'refused'}${note.trim() ? `: ${note.trim()}` : '.'}`);
  return { ok: true, status };
}

/** send, accept, decline, or revise (a new draft copied from this one). Accepting writes the quote's terms onto the deal. */
export async function moveQuote(db: Db, by: Actor, o: OppRow, q: QuoteRow, move: string): Promise<Result<{ status?: QuoteStatus; newId?: string }>> {
  const today = todayIST();
  const lapsed = q.valid_until < today && q.status !== 'accepted';
  const moves = quoteMoves(lapsed ? 'expired' : q.status);
  if (!(moves as string[]).includes(move) || move === 'submit') return fail(lapsed ? 'This quote has expired. Make a new version.' : 'That cannot be done to this quote now.', 409);
  const ref = quoteRef(q.number, q.version);
  if (move === 'revise') {
    const validUntil = q.valid_until >= today ? q.valid_until : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const out = await createQuote(db, by, o, { plan: q.plan, students: q.students, pricePerStudent: q.price_per_student, termMonths: q.term_months, validUntil, notes: q.notes });
    return out.ok ? { ok: true, newId: out.id } : out;
  }
  const status: QuoteStatus = move === 'send' ? 'sent' : move === 'accept' ? 'accepted' : 'declined';
  const { error } = await db.from('ops_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', q.id);
  if (error) return fail(error.message, 500);
  if (move === 'accept') {
    const amount = Math.round(q.students * Number(q.price_per_student) * 100) / 100;
    await db.from('ops_opportunities').update({ plan: q.plan, students: q.students, price_per_student: q.price_per_student, amount, updated_at: new Date().toISOString() }).eq('id', o.id);
  }
  await event(db, o.id, by, 'quote', `${ref} ${move === 'send' ? 'sent to the school' : move === 'accept' ? 'accepted by the school: the deal now carries its terms' : 'declined by the school'}.`);
  return { ok: true, status };
}

export { oppRef };
