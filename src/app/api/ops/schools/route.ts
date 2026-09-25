import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { getPlatformSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

const CURRICULA = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge IGCSE', 'Other'];
const PLANS = ['trial', 'standard', 'premium', 'enterprise'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** GET /api/ops/schools — every school with head counts by role. */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const admin = createAdminClient();
  const [{ data: schools, error }, { data: people }] = await Promise.all([
    admin.from('schools').select('id, name, settings, trial_expires_at, created_at').order('created_at', { ascending: false }),
    admin.from('users').select('school_id, role'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const counts = new Map<string, Record<string, number>>();
  for (const p of people || []) {
    if (!p.school_id) continue;
    const c = counts.get(p.school_id) ?? {};
    c[p.role] = (c[p.role] ?? 0) + 1;
    counts.set(p.school_id, c);
  }
  return NextResponse.json((schools || []).map(s => ({ ...s, counts: counts.get(s.id) ?? {} })));
}

/** POST /api/ops/schools — { name, code, curriculum, board, city, plan, trialDays } */
export async function POST(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 120);
  const code = str(b.code, 12).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!name || code.length < 3) return NextResponse.json({ error: 'School name and a code of at least 3 letters/digits are required.' }, { status: 400 });
  const plan = PLANS.includes(b.plan) ? b.plan : 'trial';
  const admin = createAdminClient();
  const platform = await getPlatformSettings(admin);
  const trialDays = Math.min(365, Math.max(1, Number(b.trialDays) || platform['trial.default_days']));

  const { data: clash } = await admin.from('schools').select('id').eq('settings->>code', code).maybeSingle();
  if (clash) return NextResponse.json({ error: `School code ${code} is already in use.` }, { status: 409 });

  const { data, error } = await admin.from('schools').insert({
    name,
    institution_type: 'school',
    trial_expires_at: plan === 'trial' ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null,
    settings: {
      code, plan, active: true,
      curriculum: CURRICULA.includes(b.curriculum) ? b.curriculum : 'CBSE',
      board: str(b.board, 60) || null,
      city: str(b.city, 80) || null,
      onboardedBy: op.id,
    },
  }).select('id').single();
  if (error?.code === '23505') return NextResponse.json({ error: `School code ${code} is already in use.` }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
