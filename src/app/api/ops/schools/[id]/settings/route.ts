import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { parseReason, parseSchoolPatch, schoolPolicy, type SchoolPatch, type SchoolPolicy, type SchoolRow } from '@/lib/settings/registry';
import { invalidateSettings } from '@/lib/settings/server';
import { syncSchoolAccess } from '@/lib/settings/suspension';

export const dynamic = 'force-dynamic';
// Suspending a large school bans each login in turn.
export const maxDuration = 300;

const UUID = /^[0-9a-f-]{36}$/i;

/** The journal's view of a field: what the operator saw before and after. */
function journalValue(p: SchoolPolicy, k: keyof SchoolPatch): unknown {
  switch (k) {
    case 'trialEndsAt': return p.trialEndsAt;
    case 'active': return p.active ? 'active' : 'suspended';
    default: return p[k] ?? null;
  }
}

/**
 * PATCH /api/ops/schools/:id/settings
 *   { changes: { name?, code?, plan?, trialEndsAt?, active?, aiEnabled?, curriculum?, institutionType?,
 *                contractStudents?, pricePerStudent? },
 *     reason, expectedUpdatedAt? }
 *   { sync: true, reason }  re-applies the sign-in bans/unbans for the school's current status.
 *
 * The school row and its journal entries commit together (ops_update_school).
 * Suspension then bans the school's logins in Supabase Auth; reactivation lifts them.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Pick a school.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason for the change (at least 4 characters).' }, { status: 400 });

  const db = createAdminClient();
  const { data: row } = await db.from('schools').select('id, name, institution_type, trial_expires_at, settings, updated_at').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  const current = schoolPolicy(row as SchoolRow);

  if (b.sync === true) {
    const access = await syncSchoolAccess(db, id, !current.active, op.id);
    invalidateSettings(id);
    return NextResponse.json({ ok: true, access });
  }

  const parsed = parseSchoolPatch(current, (b.changes && typeof b.changes === 'object') ? b.changes : {});
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch = parsed.patch;
  const keys = Object.keys(patch) as (keyof SchoolPatch)[];
  if (!keys.length) return NextResponse.json({ ok: true, unchanged: true });

  if (patch.code) {
    const { data: clash } = await db.from('schools').select('id, name').eq('settings->>code', patch.code).neq('id', id).maybeSingle();
    if (clash) return NextResponse.json({ error: `Code ${patch.code} is already used by ${clash.name}.` }, { status: 409 });
  }

  // Row patch for ops_update_school.
  const settings: Record<string, unknown> = {};
  const rowPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.institutionType !== undefined) rowPatch.institution_type = patch.institutionType;
  if (patch.code !== undefined) settings.code = patch.code;
  if (patch.curriculum !== undefined) settings.curriculum = patch.curriculum;
  if (patch.aiEnabled !== undefined) settings.aiEnabled = patch.aiEnabled;
  if (patch.contractStudents !== undefined) settings.contractStudents = patch.contractStudents;
  if (patch.pricePerStudent !== undefined) settings.pricePerStudent = patch.pricePerStudent;
  if (patch.plan !== undefined) {
    settings.plan = patch.plan;
    // Leaving the trial clears its end date so an old date can't lock a paying school out.
    if (patch.plan !== 'pilot') rowPatch.trial_expires_at = null;
  }
  if (patch.trialEndsAt !== undefined) rowPatch.trial_expires_at = patch.trialEndsAt;
  if (patch.active !== undefined) {
    settings.active = patch.active;
    settings.suspension = patch.active ? null : { at: new Date().toISOString(), by: op.email, reason };
  }

  const after = schoolPolicy({
    ...(row as SchoolRow),
    name: (rowPatch.name as string) ?? row.name,
    institution_type: (rowPatch.institution_type as string) ?? row.institution_type,
    trial_expires_at: 'trial_expires_at' in rowPatch ? (rowPatch.trial_expires_at as string | null) : row.trial_expires_at,
    settings: { ...(row.settings || {}), ...settings },
  });
  const journal = keys.map(k => ({ key: k, old: journalValue(current, k), new: journalValue(after, k) }));

  const { data: res, error } = await db.rpc('ops_update_school', {
    p_school: id,
    p_patch: { ...rowPatch, settings },
    p_journal: journal,
    p_reason: reason,
    p_actor: op.id,
    p_actor_email: op.email,
    p_expected: typeof b.expectedUpdatedAt === 'string' ? b.expectedUpdatedAt : null,
  });
  invalidateSettings(id);
  if (error) {
    if (error.code === '40001') return NextResponse.json({ error: 'Someone else changed this school a moment ago. Reload and try again.' }, { status: 409 });
    if (error.code === '23505') return NextResponse.json({ error: `Code ${patch.code} is already in use.` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sign-in layer: ban on suspend, lift on reactivate.
  let access = null;
  if (patch.active !== undefined) access = await syncSchoolAccess(db, id, !patch.active, op.id);
  return NextResponse.json({ ok: true, changed: keys, updatedAt: (res as { updated_at?: string } | null)?.updated_at ?? null, access });
}
