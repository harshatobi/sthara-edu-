import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { checkInfo, loginVerdict, type LoginFacts } from '@/lib/ops/diagnostics';
import { can } from '@/lib/ops/roles';
import { parseReason, schoolPolicy, type SchoolRow } from '@/lib/settings/registry';
import { invalidateSettings } from '@/lib/settings/server';
import { SWITCHES, SWITCH_KEYS, isSwitchKey, switchJournalKey, withSwitch } from '@/lib/settings/switches';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const notFound = () => NextResponse.json({ error: 'School not found' }, { status: 404 });
const COLS = 'id, name, institution_type, trial_expires_at, settings, updated_at';

interface Diagnostics {
  logins: { role: string; total: number; never: number; week: number; month: number; banned: number; temp_password: number; no_login: number; left_school: number }[];
  stuck: { id: string; role: string; name: string | null; email: string | null; state: string }[];
  checks: { key: string; table: string; count: number; sample: string[] }[];
}

/**
 * GET /api/ops/schools/:id/controls — the school's kill switches, its sign-in picture by role, the staff who
 * cannot or have not signed in, and its data-integrity checks (counts with a few sample ids).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'schools.read', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const db = createAdminClient();
  const [{ data: row }, diag] = await Promise.all([
    db.from('schools').select(COLS).eq('id', id).maybeSingle(),
    db.rpc('ops_school_diagnostics', { p_school: id }),
  ]);
  if (!row) return notFound();
  const policy = schoolPolicy(row as SchoolRow);
  const d = diag.error ? null : (diag.data as Diagnostics | null);
  // Who the stuck accounts are is for roles that work with accounts; everyone else gets how many.
  const named = can(op.role, 'schools.manage') || can(op.role, 'people.search');
  return NextResponse.json({
    switches: SWITCH_KEYS.map(k => ({ key: k, ...SWITCHES[k], on: !policy.off.includes(k) })),
    aiEnabled: policy.aiEnabled,
    canSwitch: can(op.role, 'schools.switches'),
    diagnostics: d && {
      logins: d.logins,
      stuck: named ? d.stuck : d.stuck.map(s => ({ ...s, name: null, email: null })),
      checks: (d.checks || []).map(c => ({ ...c, ...checkInfo(c.key) })),
    },
    diagnosticsError: diag.error ? 'Diagnostics are not available: the ops_debug migration is missing from the database.' : null,
  });
}

/** PATCH /api/ops/schools/:id/controls — { key, on, reason }: turn one part of the product off or back on for this school. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'schools.switches', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const b = await req.json().catch(() => ({}));
  if (!isSwitchKey(b.key) || typeof b.on !== 'boolean') return NextResponse.json({ error: 'Pick a switch and whether it is on.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason (at least 4 characters). It goes in the change log.' }, { status: 400 });
  const db = createAdminClient();
  const { data: row } = await db.from('schools').select(COLS).eq('id', id).maybeSingle();
  if (!row) return notFound();
  const wasOn = !schoolPolicy(row as SchoolRow).off.includes(b.key);
  if (wasOn === b.on) return NextResponse.json({ ok: true, unchanged: true });
  const { error } = await db.rpc('ops_update_school', {
    p_school: id,
    p_patch: { settings: { switches: withSwitch(row.settings, b.key, b.on) } },
    p_journal: [{ key: switchJournalKey(b.key), old: wasOn, new: b.on }],
    p_reason: reason, p_actor: op.id, p_actor_email: op.email, p_expected: null,
  });
  invalidateSettings(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** POST /api/ops/schools/:id/controls — { email }: why the account with this email, in this school, can or cannot sign in. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const op = await operatorFor(req, 'schools.read', (await params).id);
  if (op instanceof Response) return op;
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const b = await req.json().catch(() => ({}));
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter the account’s full email address.' }, { status: 400 });
  const db = createAdminClient();
  const [{ data: row }, { data: facts, error }] = await Promise.all([
    db.from('schools').select(COLS).eq('id', id).maybeSingle(),
    db.rpc('ops_login_check', { p_school: id, p_email: email }),
  ]);
  if (!row) return notFound();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!facts) return NextResponse.json({ error: 'This school has no account with that email. Check the address, or the school.' }, { status: 404 });
  const f = facts as LoginFacts & { id: string; createdAt: string | null };
  const policy = schoolPolicy(row as SchoolRow);
  return NextResponse.json({
    email, id: f.id, role: f.role, lastSignIn: f.lastSignIn, createdAt: f.createdAt, twoFactor: f.twoFactor,
    ...loginVerdict(f, { active: policy.active, trialExpired: policy.trialExpired }),
  });
}
