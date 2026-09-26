import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS, PLAN_INFO, annualValue, effectivePrice,
  PLATFORM_DEFAULTS, accessBlock, normaliseCode, parsePlatformValue, parseReason, parseSchoolPatch,
  resolvePlatform, schoolPolicy, type SchoolRow,
} from './registry';
import { buildInventory, summarise, type InventoryInputs, type SchoolFacts } from './inventory';
import { RATE_LIMITS, limitOf } from './limits';

const NOW = new Date('2026-09-25T10:00:00+05:30').getTime();
const DAY = 86_400_000;
const school = (over: Partial<SchoolRow> & { settings?: Record<string, unknown> } = {}): SchoolRow => ({
  id: '00000000-0000-0000-0000-000000000001', name: 'Test School', institution_type: 'school',
  trial_expires_at: new Date(NOW + 10 * DAY).toISOString(), settings: { code: 'TST-1', plan: 'trial' }, ...over,
});

test('platform values: defaults, validation, stored overrides', () => {
  assert.equal(PLATFORM_DEFAULTS['ai.enabled'], true);
  assert.equal(PLATFORM_DEFAULTS['trial.default_days'], 30);
  assert.deepEqual(parsePlatformValue('ai.enabled', false), { value: false });
  assert.ok('error' in parsePlatformValue('ai.enabled', 'no'));
  assert.deepEqual(parsePlatformValue('trial.default_days', '45'), { value: 45 });
  assert.ok('error' in parsePlatformValue('trial.default_days', 3));
  assert.ok('error' in parsePlatformValue('trial.default_days', 30.5));
  assert.deepEqual(parsePlatformValue('notice.message', '  Planned   downtime  '), { value: 'Planned downtime' });
  assert.ok('error' in parsePlatformValue('notice.message', 'x'.repeat(241)));
  assert.ok('error' in parsePlatformValue('notice.tone', 'purple'));
  // Unknown keys and values that no longer validate fall back to defaults.
  const v = resolvePlatform([
    { key: 'ai.enabled', value: false }, { key: 'trial.default_days', value: 9999 }, { key: 'made.up', value: 1 },
  ]);
  assert.equal(v['ai.enabled'], false);
  assert.equal(v['trial.default_days'], 30);
  assert.equal((v as Record<string, unknown>)['made.up'], undefined);
});

test('school policy: pilot, suspension, AI, legacy rows', () => {
  const p = schoolPolicy(school(), NOW);
  // Rows written before the tiers were named read as their tier: 'trial' is a pilot.
  assert.equal(p.plan, 'pilot');
  assert.equal(p.trialDaysLeft, 10);
  assert.equal(p.trialExpired, false);
  assert.equal(p.active, true);
  assert.equal(p.aiEnabled, true);

  const expired = schoolPolicy(school({ trial_expires_at: new Date(NOW - DAY).toISOString() }), NOW);
  assert.equal(expired.trialExpired, true);
  assert.equal(expired.trialDaysLeft, 0);
  // A few hours left still counts as a day.
  assert.equal(schoolPolicy(school({ trial_expires_at: new Date(NOW + 3_600_000).toISOString() }), NOW).trialExpired, false);
  // Paid tiers ignore a stale pilot date; legacy 'standard' is Sthamba.
  const paid = schoolPolicy(school({ trial_expires_at: new Date(NOW - DAY).toISOString(), settings: { plan: 'standard', code: 'X' } }), NOW);
  assert.equal(paid.plan, 'sthamba');
  assert.equal(paid.trialExpired, false);
  assert.equal(paid.trialEndsAt, null);
  assert.equal(schoolPolicy(school({ settings: { plan: 'premium' } }), NOW).plan, 'shikhara');
  assert.equal(schoolPolicy(school({ settings: { plan: 'enterprise' } }), NOW).plan, 'mandala');
  assert.equal(schoolPolicy(school({ settings: { plan: 'shikhara' } }), NOW).plan, 'shikhara');
  // Legacy rows without flags are active with AI on; unknown plans are treated as a pilot.
  const legacy = schoolPolicy(school({ settings: { plan: 'gold' } }), NOW);
  assert.equal(legacy.active, true);
  assert.equal(legacy.plan, 'pilot');
  assert.equal(legacy.code, null);
  const sus = schoolPolicy(school({ settings: { active: false, aiEnabled: false, suspension: { at: '2026-09-20', reason: 'Unpaid' } } }), NOW);
  assert.equal(sus.active, false);
  assert.equal(sus.aiEnabled, false);
  assert.deepEqual(sus.suspension, { at: '2026-09-20', reason: 'Unpaid' });
});

test('access block: suspension wins over an expired trial', () => {
  assert.equal(accessBlock({ active: true, trialExpired: false }), null);
  assert.equal(accessBlock({ active: true, trialExpired: true })?.code, 'trial_expired');
  assert.equal(accessBlock({ active: false, trialExpired: true })?.code, 'suspended');
});

test('school edits: only real changes, validated', () => {
  const cur = schoolPolicy(school(), NOW);
  assert.deepEqual(parseSchoolPatch(cur, { name: 'Test School', code: 'tst-1' }, NOW), { patch: {} });
  const r = parseSchoolPatch(cur, { code: ' new code!', active: false, aiEnabled: false }, NOW);
  assert.ok('patch' in r);
  assert.deepEqual(r.patch, { code: 'NEWCODE', active: false, aiEnabled: false });
  assert.ok('error' in parseSchoolPatch(cur, { code: 'AB' }, NOW));
  assert.ok('error' in parseSchoolPatch(cur, { plan: 'platinum' }, NOW));
  assert.ok('error' in parseSchoolPatch(cur, { active: 'no' }, NOW));
  // Trial end is end of day IST, at most two years out.
  const t = parseSchoolPatch(cur, { trialEndsAt: '2026-12-31' }, NOW);
  assert.ok('patch' in t && t.patch.trialEndsAt === '2026-12-31T18:29:59.000Z');
  assert.ok('error' in parseSchoolPatch(cur, { trialEndsAt: '2030-01-01' }, NOW));
  assert.ok('error' in parseSchoolPatch(cur, { trialEndsAt: '31/12/2026' }, NOW));
  // Moving a paid school onto a pilot needs an end date; old plan names are not accepted on write.
  const paid = schoolPolicy(school({ settings: { plan: 'standard', code: 'X1X' } }), NOW);
  assert.ok('error' in parseSchoolPatch(paid, { plan: 'trial' }, NOW));
  assert.ok('error' in parseSchoolPatch(paid, { plan: 'pilot' }, NOW));
  assert.ok('patch' in parseSchoolPatch(paid, { plan: 'pilot', trialEndsAt: '2026-10-31' }, NOW));
  // Pilot end is ignored for paid tiers.
  assert.deepEqual(parseSchoolPatch(paid, { trialEndsAt: '2026-10-31' }, NOW), { patch: {} });
});

test('codes and reasons', () => {
  assert.equal(normaliseCode(' sthtest '), 'STHTEST');
  assert.equal(normaliseCode('sch vsn/2026'), 'SCHVSN2026');
  assert.equal(parseReason('  ok '), null);
  assert.equal(parseReason('Unpaid   invoice'), 'Unpaid invoice');
  assert.equal(parseReason('x'.repeat(501)), null);
});

test('rate limits are read from one table', () => {
  assert.deepEqual(limitOf('tutorSession'), [40, 5 * 60_000]);
  for (const r of Object.values(RATE_LIMITS)) {
    assert.ok(r.limit > 0 && r.windowMs >= 60_000, r.label);
    assert.ok(r.route.startsWith('/api/'), r.label);
  }
});

const facts = (over: Partial<SchoolFacts> = {}): SchoolFacts => ({
  ...schoolPolicy(school(), NOW), updatedAt: null, people: 20, schoolAdmins: 1, ...over,
});
const inputs = (over: Partial<InventoryInputs> = {}): InventoryInputs => ({
  secrets: {
    SUPABASE_SERVICE_ROLE_KEY: true, NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
    GEMINI_API_KEY: true, TUTOR_SESSION_SECRET: true, SENTRY_DSN: true, YOUTUBE_API_KEY: true,
    WHATSAPP_ACCESS_TOKEN: true, WHATSAPP_PHONE_NUMBER_ID: true, WHATSAPP_APP_SECRET: true, WHATSAPP_VERIFY_TOKEN: true,
  },
  env: { VERCEL_ENV: 'production', VERCEL_REGION: 'bom1', NODE_ENV: 'production', POLICIES_APPROVED: 'true' },
  platform: { ...PLATFORM_DEFAULTS, 'onboarding.self_serve': false },
  platformStored: true,
  health: {
    server_version: '17.6', rls_off: [], tables: 42, anon_writable: [], operators: 2, audit_7d: 10,
    audit_last: new Date(NOW).toISOString(), db_bytes: 50 * 1_048_576,
    migrations: [{ version: '20260923183453', name: 'harden_schema' }, { version: '20260925150001', name: 'ops_settings' }],
  },
  healthError: null,
  repoMigrations: ['20260923120000_harden_schema.sql', '20260925150000_ops_settings.sql'],
  schools: [facts()],
  duplicateCodes: [],
  now: NOW,
  ...over,
});
const byId = (items: ReturnType<typeof buildInventory>, id: string) => items.find(i => i.id === id)!;

test('inventory: a healthy production setup has nothing critical or warning', () => {
  const items = buildInventory(inputs());
  const c = summarise(items);
  const bad = items.filter(i => i.status === 'crit' || i.status === 'warn').map(i => `${i.id}: ${i.value}`);
  // The in-memory rate limiter is the one known production warning.
  assert.deepEqual(bad, ['rt.rate_store: In memory, per instance']);
  assert.equal(c.crit, 0);
  // Secrets never show a value.
  for (const i of items.filter(x => x.group === 'Secrets and keys')) assert.ok(!/eyJ|sk-|AIza/.test(i.value), i.id);
});

test('inventory: missing keys, drift, unprotected tables and school problems are flagged', () => {
  const items = buildInventory(inputs({
    secrets: { NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, OPENAI_API_KEY: true },
    env: { VERCEL_ENV: 'production', VERCEL_REGION: 'iad1', NODE_ENV: 'production' },
    platform: { ...PLATFORM_DEFAULTS, 'ai.enabled': true },
    health: {
      ...inputs().health!, rls_off: ['scratch'], anon_writable: ['enquiries'],
      migrations: [{ version: '1', name: 'harden_schema' }, { version: '2', name: 'hotfix_live_only' }],
    },
    schools: [
      facts({ code: null }),
      facts({ id: 'b', name: 'Ended', trialExpired: true, trialDaysLeft: 0, testSchool: false }),
      facts({ id: 'c', name: 'Soon', trialDaysLeft: 3 }),
      facts({ id: 'd', name: 'Headless', schoolAdmins: 0 }),
    ],
    duplicateCodes: ['DUP'],
  }));
  assert.equal(byId(items, 'env.service_role').status, 'crit');
  assert.equal(byId(items, 'env.gemini').status, 'crit');
  assert.equal(byId(items, 'env.tutor_secret').status, 'warn');
  assert.equal(byId(items, 'env.sentry').status, 'warn');
  assert.deepEqual(byId(items, 'env.stray').items, ['OPENAI_API_KEY']);
  assert.equal(byId(items, 'rt.region').status, 'warn');
  assert.equal(byId(items, 'db.rls').status, 'crit');
  assert.equal(byId(items, 'db.anon').status, 'warn');
  const mig = byId(items, 'db.migrations');
  assert.equal(mig.status, 'crit');
  assert.ok(mig.items!.some(x => x.startsWith('20260925150000_ops_settings.sql')));
  assert.ok(mig.items!.some(x => x.startsWith('hotfix_live_only')));
  assert.equal(byId(items, 'school.codes').status, 'crit');
  assert.equal(byId(items, 'school.trial_expired').status, 'warn');
  assert.equal(byId(items, 'school.trial_ending').status, 'warn');
  assert.deepEqual(byId(items, 'school.no_admin').items, ['Headless']);
});

test('inventory: AI key only critical while AI is on; store and probe outages are critical', () => {
  const off = buildInventory(inputs({ secrets: { SUPABASE_SERVICE_ROLE_KEY: true }, platform: { ...PLATFORM_DEFAULTS, 'ai.enabled': false } }));
  assert.equal(byId(off, 'env.gemini').status, 'warn');
  assert.equal(byId(off, 'platform.ai.enabled').status, 'warn');
  const down = buildInventory(inputs({ platformStored: false, health: null, healthError: 'function does not exist' }));
  assert.equal(byId(down, 'platform.store').status, 'crit');
  assert.equal(byId(down, 'db.probe').status, 'crit');
  assert.match(byId(down, 'db.probe').detail, /function does not exist/);
});

test('tiers: list prices, contract price and annual value', () => {
  assert.deepEqual(PLANS, ['pilot', 'aadhara', 'sthamba', 'shikhara', 'mandala']);
  assert.equal(PLAN_INFO.aadhara.price, 2000);
  assert.equal(PLAN_INFO.sthamba.price, 2500);
  assert.equal(PLAN_INFO.shikhara.price, 3500);
  assert.equal(PLAN_INFO.mandala.price, null);
  const s = (settings: Record<string, unknown>) => schoolPolicy(school({ settings: { code: 'X1X', ...settings } }), NOW);
  // List price x students on the platform, unless seats are contracted.
  assert.equal(annualValue(s({ plan: 'shikhara' }), 100), 350_000);
  assert.equal(annualValue(s({ plan: 'shikhara', contractStudents: 420 }), 100), 1_470_000);
  // A contract price overrides the list price.
  assert.equal(effectivePrice(s({ plan: 'sthamba', pricePerStudent: 2300 })), 2300);
  // Mandala has no list price; a pilot converts at the anchor (Shikhara) unless priced.
  assert.equal(annualValue(s({ plan: 'mandala' }), 100), null);
  assert.equal(annualValue(s({ plan: 'mandala', pricePerStudent: 3000 }), 10), 30_000);
  assert.equal(annualValue(s({ plan: 'pilot' }), 40), 140_000);
  assert.equal(annualValue(s({ plan: 'aadhara' }), 0), null);
  // Junk contract values are ignored.
  assert.equal(s({ plan: 'sthamba', contractStudents: -3, pricePerStudent: 'lots' }).contractStudents, null);
});

test('contract edits: validated, Mandala needs a price', () => {
  const cur = schoolPolicy(school({ settings: { plan: 'sthamba', code: 'X1X' } }), NOW);
  const r = parseSchoolPatch(cur, { contractStudents: '420', pricePerStudent: 2400 }, NOW);
  assert.ok('patch' in r && r.patch.contractStudents === 420 && r.patch.pricePerStudent === 2400);
  assert.ok('error' in parseSchoolPatch(cur, { contractStudents: 0 }, NOW));
  assert.ok('error' in parseSchoolPatch(cur, { pricePerStudent: 12.5 }, NOW));
  assert.ok('error' in parseSchoolPatch(cur, { plan: 'mandala' }, NOW));
  assert.ok('patch' in parseSchoolPatch(cur, { plan: 'mandala', pricePerStudent: 3000 }, NOW));
  // Clearing a contract price is allowed on a listed tier.
  const priced = schoolPolicy(school({ settings: { plan: 'sthamba', code: 'X1X', pricePerStudent: 2400 } }), NOW);
  assert.deepEqual(parseSchoolPatch(priced, { pricePerStudent: '' }, NOW), { patch: { pricePerStudent: null } });
  // An unpriced legacy Mandala school can still be suspended.
  const legacy = schoolPolicy(school({ settings: { plan: 'enterprise', code: 'X1X' } }), NOW);
  assert.deepEqual(parseSchoolPatch(legacy, { active: false }, NOW), { patch: { active: false } });
});
