import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { isPlatformKey, parsePlatformValue, parseReason } from '@/lib/settings/registry';
import { getPlatformSettings, invalidateSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/settings — the platform-wide controls and the platform change journal.
 * (Checks moved to /api/ops/health; per-school settings to /api/ops/schools/:id.)
 * Operators only; 404 for everyone else.
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const db = createAdminClient();
  invalidateSettings(); // the console always shows what's stored right now
  try {
    const [platform, journal] = await Promise.all([
      getPlatformSettings(db),
      db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
        .eq('scope', 'platform').order('at', { ascending: false }).limit(300),
    ]);
    const { __stored, ...values } = platform;
    return NextResponse.json({ platform: values, platformStored: __stored, journal: journal.error ? null : journal.data, checkedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load settings.' }, { status: 500 });
  }
}

/** PATCH /api/ops/settings — { key, value, reason }: change one platform setting. */
export async function PATCH(req: NextRequest) {
  const op = await operatorFromRequest(req);
  if (!op) return notFoundResponse();
  const b = await req.json().catch(() => ({}));
  const key = b.key;
  if (!isPlatformKey(key)) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 });
  const reason = parseReason(b.reason);
  if (!reason) return NextResponse.json({ error: 'Give a reason for the change (at least 4 characters).' }, { status: 400 });
  const parsed = parsePlatformValue(key, b.value);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = createAdminClient();
  invalidateSettings();
  const current = await getPlatformSettings(db);
  if (!current.__stored) return NextResponse.json({ error: 'The settings store isn’t available. Apply migration ops_settings first.' }, { status: 503 });
  const old = current[key];
  if (old === parsed.value) return NextResponse.json({ ok: true, unchanged: true });

  // The value and its journal entry commit in one transaction.
  const { error } = await db.rpc('ops_set_platform_config', {
    p_key: key, p_value: parsed.value, p_reason: reason, p_actor: op.id, p_actor_email: op.email,
  });
  invalidateSettings();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, value: parsed.value });
}
