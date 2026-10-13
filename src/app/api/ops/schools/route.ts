import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadRegistry } from '@/lib/ops/registry';
import { loadOperators, placeSchool, resolvePlacement } from '@/lib/ops/org';
import { scoreHealth, type SchoolMetrics } from '@/lib/ops/health';
import { can } from '@/lib/ops/roles';
import { USD_TO_INR } from '@/lib/ai/pricing';
import { effectivePrice, parseReason } from '@/lib/settings/registry';
import { loadAccounts, loadSight, loadTerritories } from '@/lib/ops/scope';
import { sees, territoryPath } from '@/lib/ops/territories';
import { getPlatformSettings } from '@/lib/settings/server';
import { CURRICULA, PLANS, parseSchoolPatch, schoolPolicy, type Plan } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/schools — the tenant registry: each school's policy, head counts and setup, with where it sits
 * and who owns it. Operators with a territory get the schools in it (or owned by them or their reports).
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'schools.read');
  if (op instanceof Response) return op;
  try {
    const db = createAdminClient();
    const [registry, accounts, territories, sight, ops, metrics] = await Promise.all([
      loadRegistry(db), loadAccounts(db), loadTerritories(db), loadSight(db, op), loadOperators(db),
      db.rpc('ops_school_metrics', { p_school: null }),
    ]);
    const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
    const ownerName = new Map(names.map(u => [u.id as string, (u.name || u.email || 'Operator') as string]));
    const metricsOf = new Map(metrics.error ? [] : ((metrics.data || []) as { school_id: string; metrics: SchoolMetrics }[]).map(r => [r.school_id, r.metrics]));
    const schools = registry
      .filter(s => sight.all || (accounts.has(s.id) && sees(sight, accounts.get(s.id)!)))
      .map(s => {
        const a = accounts.get(s.id);
        return {
          ...s,
          state: a?.state ?? null, district: a?.district ?? null,
          territory: a?.territoryId ? territoryPath(territories, a.territoryId) : null,
          ownerId: a?.ownerId ?? null, owner: a?.ownerId ? ownerName.get(a.ownerId) ?? null : null,
          health: (() => {
            const m = metricsOf.get(s.id);
            if (!m) return null;
            const h = scoreHealth(m, {
              active: s.active, plan: s.plan, trialExpired: s.trialExpired, trialDaysLeft: s.trialDaysLeft,
              contractStudents: s.contractStudents, pricePerStudent: s.plan === 'pilot' ? null : effectivePrice(s), usdToInr: USD_TO_INR,
            });
            return { score: h.score, band: h.band, top: h.findings[0]?.title ?? null };
          })(),
        };
      });
    // ?shape=list is the Schools page: the rows with who is asking and what they may do. The bare array stays for older callers.
    if (req.nextUrl.searchParams.get('shape') !== 'list') return NextResponse.json(schools);
    return NextResponse.json({
      schools, me: op.id,
      owners: ops.filter(o => o.active).map(o => ({ id: o.id, name: ownerName.get(o.id) ?? 'Operator', role: o.role })),
      can: { create: can(op.role, 'schools.create'), assign: can(op.role, 'assign'), desk: can(op.role, 'desk.read') },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load schools.' }, { status: 500 });
  }
}

/**
 * PATCH /api/ops/schools — { schoolIds, ownerId, reason }: give several schools one owner (null = each territory's default).
 * Schools outside the operator's sight are skipped, never changed.
 */
export async function PATCH(req: NextRequest) {
  const op = await operatorFor(req, 'assign');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.schoolIds) ? [...new Set((b.schoolIds as unknown[]).filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one school.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the audit log.' }, { status: 400 });
  const db = createAdminClient();
  const [sight, accounts, { data: real }] = await Promise.all([loadSight(db, op), loadAccounts(db), db.from('schools').select('id').in('id', ids)]);
  const exists = new Set((real || []).map(s => s.id as string));
  let changed = 0;
  const failed: string[] = [];
  for (const id of ids) {
    if (!exists.has(id) || !(sight.all || (accounts.has(id) && sees(sight, accounts.get(id)!)))) continue;
    const out = await placeSchool(db, op, id, { ownerId: typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : null }, reason);
    if (out.ok) changed += 1; else failed.push(out.error);
  }
  if (!changed && failed.length) return NextResponse.json({ error: failed[0] }, { status: 400 });
  return NextResponse.json({ ok: true, changed, skipped: ids.length - changed });
}

/**
 * POST /api/ops/schools
 *   { name, code, curriculum, board?, city?, state?, district?, plan, pilotDays?, contractStudents?, pricePerStudent?, enquiryId? }
 * Creates a school. With enquiryId, the enquiry is marked qualified and noted as converted.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'schools.create');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 120);
  const code = str(b.code, 12).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (name.length < 2 || code.length < 3) return NextResponse.json({ error: 'School name and a code of at least 3 letters/digits are required.' }, { status: 400 });
  const plan: Plan = (PLANS as readonly unknown[]).includes(b.plan) ? b.plan : 'pilot';
  const curriculum = (CURRICULA as readonly unknown[]).includes(b.curriculum) ? b.curriculum : null;
  if (!curriculum) return NextResponse.json({ error: 'Pick the school’s curriculum.' }, { status: 400 });

  // Contract fields go through the same rules as an edit.
  const blank = schoolPolicy({ id: '', name, institution_type: 'school', trial_expires_at: null, settings: { plan } });
  const contract = parseSchoolPatch(blank, { contractStudents: b.contractStudents ?? null, pricePerStudent: b.pricePerStudent ?? null });
  if ('error' in contract) return NextResponse.json({ error: contract.error }, { status: 400 });
  const { contractStudents = null, pricePerStudent = null } = contract.patch;
  if (plan === 'mandala' && pricePerStudent === null) return NextResponse.json({ error: 'Mandala has no list price: set the agreed price per student.' }, { status: 400 });

  const db = createAdminClient();
  // Where the school sits decides its territory and owner. An operator who works a territory must place it.
  const placed = await resolvePlacement(db, { state: b.state, district: b.district });
  if (!placed.ok) return NextResponse.json({ error: placed.error }, { status: placed.status });
  const sight = await loadSight(db, op);
  if (!sight.all && !placed.state) return NextResponse.json({ error: 'Pick the school’s state, so it lands in a territory.' }, { status: 400 });
  // Outside their own territories, the school is theirs until someone reassigns it.
  const ownerId = sight.all || sees(sight, placed) ? placed.ownerId : op.id;
  const platform = await getPlatformSettings(db);
  const pilotDays = Math.min(365, Math.max(1, Number(b.pilotDays) || platform['trial.default_days']));

  const { data: clash } = await db.from('schools').select('id').eq('settings->>code', code).maybeSingle();
  if (clash) return NextResponse.json({ error: `School code ${code} is already in use.` }, { status: 409 });

  const { data, error } = await db.from('schools').insert({
    name,
    institution_type: 'school',
    trial_expires_at: plan === 'pilot' ? new Date(Date.now() + pilotDays * 86_400_000).toISOString() : null,
    settings: {
      code, plan, active: true, curriculum,
      board: str(b.board, 60) || null,
      city: str(b.city, 80) || null,
      contractStudents,
      pricePerStudent,
      onboardedBy: op.id,
      ...(typeof b.enquiryId === 'string' && UUID.test(b.enquiryId) ? { fromEnquiry: b.enquiryId } : {}),
    },
  }).select('id').single();
  if (error?.code === '23505') return NextResponse.json({ error: `School code ${code} is already in use.` }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: accErr } = await db.from('ops_accounts').insert({
    school_id: data.id, state: placed.state, district: placed.district, territory_id: placed.territoryId, owner_id: ownerId, updated_by: op.id,
  });
  if (accErr) console.warn('[ops schools] placement:', accErr.message);

  if (typeof b.enquiryId === 'string' && UUID.test(b.enquiryId)) {
    const { data: enq } = await db.from('enquiries').select('note').eq('id', b.enquiryId).maybeSingle();
    const line = `Converted to school ${name} (${code}) by ${op.email} on ${new Date().toISOString().slice(0, 10)}.`;
    await db.from('enquiries').update({ status: 'qualified', handled_by: op.id, note: enq?.note ? `${enq.note}\n${line}` : line }).eq('id', b.enquiryId);
  }
  return NextResponse.json({ id: data.id });
}
