import 'server-only';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { schoolPolicy, type SchoolRow } from './registry';
import { buildInventory, type HealthProbe, type InventoryInputs, type SchoolFacts } from './inventory';
import { getPlatformSettings } from './server';

/** Env vars whose values are secret: only their presence leaves this module. */
const SECRET_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'TUTOR_SESSION_SECRET',
  'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'YOUTUBE_API_KEY',
  'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'FIREBASE_ADMIN_PRIVATE_KEY',
] as const;
const PLAIN_ENV = ['VERCEL_ENV', 'VERCEL_REGION', 'NODE_ENV', 'POLICIES_APPROVED'] as const;

async function repoMigrations(): Promise<string[] | null> {
  try {
    const files = await readdir(path.join(process.cwd(), 'supabase', 'migrations'));
    return files.filter(f => /^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
  } catch {
    return null;
  }
}

/** Every school as the product enforces it, with head counts and school-admin holders. */
export async function loadSchoolFacts(db: SupabaseClient): Promise<{ schools: SchoolFacts[]; duplicateCodes: string[] }> {
  const [{ data: schools, error }, { data: people }, { data: grants }] = await Promise.all([
    db.from('schools').select('id, name, institution_type, trial_expires_at, settings, created_at, updated_at').order('created_at', { ascending: false }),
    db.from('users').select('school_id'),
    db.from('role_grants').select('user_id, school_id, expires_on').eq('role_key', 'school_admin').is('revoked_at', null),
  ]);
  if (error) throw error;
  const heads = new Map<string, number>();
  for (const p of people || []) if (p.school_id) heads.set(p.school_id, (heads.get(p.school_id) ?? 0) + 1);
  // Same validity rule as activeGrants() in src/lib/admin/rbac.ts (not revoked, not expired).
  const today = isoDay();
  const admins = new Map<string, number>();
  for (const g of grants || []) {
    if (g.expires_on && String(g.expires_on) < today) continue;
    admins.set(g.school_id, (admins.get(g.school_id) ?? 0) + 1);
  }
  const facts = (schools || []).map(s => ({
    ...schoolPolicy(s as SchoolRow),
    updatedAt: (s.updated_at as string | null) ?? null,
    people: heads.get(s.id) ?? 0,
    schoolAdmins: admins.get(s.id) ?? 0,
  }));
  const seen = new Map<string, number>();
  for (const f of facts) if (f.code) seen.set(f.code, (seen.get(f.code) ?? 0) + 1);
  return { schools: facts, duplicateCodes: [...seen].filter(([, n]) => n > 1).map(([c]) => c) };
}

export async function collectInventory(db: SupabaseClient) {
  const [platform, health, repo, schoolFacts] = await Promise.all([
    getPlatformSettings(db),
    db.rpc('ops_platform_health').then(r => r, e => ({ data: null, error: e })),
    repoMigrations(),
    loadSchoolFacts(db),
  ]);
  const { __stored, ...values } = platform;
  const secrets = Object.fromEntries(SECRET_ENV.map(k => [k, !!process.env[k]?.trim()]));
  const env = Object.fromEntries(PLAIN_ENV.map(k => [k, process.env[k]]));
  const inputs: InventoryInputs = {
    secrets, env,
    platform: values,
    platformStored: __stored,
    health: (health.data as HealthProbe | null) ?? null,
    healthError: health.error ? String((health.error as { message?: unknown }).message ?? health.error) : null,
    repoMigrations: repo,
    schools: schoolFacts.schools,
    duplicateCodes: schoolFacts.duplicateCodes,
    now: Date.now(),
  };
  return { items: buildInventory(inputs), platform: values, platformStored: __stored, schools: schoolFacts.schools };
}
