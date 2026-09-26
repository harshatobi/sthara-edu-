import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { loadRegistry } from '@/lib/ops/registry';
import { getPlatformSettings } from '@/lib/settings/server';
import { CURRICULA, PLANS, parseSchoolPatch, schoolPolicy, type Plan } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID = /^[0-9a-f-]{36}$/i;

/** GET /api/ops/schools — the tenant registry: every school's policy, head counts and setup. */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  try {
    return NextResponse.json(await loadRegistry(createAdminClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load schools.' }, { status: 500 });
  }
}

/**
 * POST /api/ops/schools
 *   { name, code, curriculum, board?, city?, plan, pilotDays?, contractStudents?, pricePerStudent?, enquiryId? }
 * Creates a school. With enquiryId, the enquiry is marked qualified and noted as converted.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
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

  if (typeof b.enquiryId === 'string' && UUID.test(b.enquiryId)) {
    const { data: enq } = await db.from('enquiries').select('note').eq('id', b.enquiryId).maybeSingle();
    const line = `Converted to school ${name} (${code}) by ${op.email} on ${new Date().toISOString().slice(0, 10)}.`;
    await db.from('enquiries').update({ status: 'qualified', handled_by: op.id, note: enq?.note ? `${enq.note}\n${line}` : line }).eq('id', b.enquiryId);
  }
  return NextResponse.json({ id: data.id });
}
