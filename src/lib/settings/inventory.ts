/**
 * The load-bearing settings inventory: every setting the product depends on,
 * where it lives, its current value and whether it is healthy.
 *
 * Pure: the server collects the inputs (src/lib/settings/collect.ts) and this
 * turns them into rows, so the rules are unit-tested. Secrets arrive as
 * presence flags only; their values never reach this module or the browser.
 */
import { PLATFORM_SETTINGS, type PlatformValues, type SchoolPolicy } from './registry';
import { AI_MODELS, RATE_LIMITS } from './limits';

export type Status = 'ok' | 'warn' | 'crit' | 'info';
export type Source = 'environment' | 'platform' | 'school' | 'database' | 'code' | 'runtime';

export interface InventoryItem {
  id: string;
  group: string;
  label: string;
  source: Source;
  /** Display value. Secrets show only "Set" / "Not set". */
  value: string;
  status: Status;
  detail: string;
  enforcedAt?: string[];
  /** Names (schools, tables, migrations) behind the status, when it is about several. */
  items?: string[];
}

export interface HealthProbe {
  server_version: string;
  rls_off: string[];
  tables: number;
  anon_writable: string[];
  migrations: { version: string; name: string }[];
  operators: number;
  audit_7d: number;
  audit_last: string | null;
  db_bytes: number;
}

export interface SchoolFacts extends SchoolPolicy {
  /** schools.updated_at, sent back with an edit to detect concurrent changes. */
  updatedAt: string | null;
  people: number;
  schoolAdmins: number;
}

export interface InventoryInputs {
  /** Secret-bearing env vars: present or not. */
  secrets: Record<string, boolean>;
  /** Non-secret env vars, by value. */
  env: Record<string, string | undefined>;
  platform: PlatformValues;
  platformStored: boolean;
  health: HealthProbe | null;
  healthError: string | null;
  /** Migration file names in the repo (e.g. 20260924100000_admin_erp.sql); null if unreadable. */
  repoMigrations: string[] | null;
  schools: SchoolFacts[];
  duplicateCodes: string[];
  now: number;
}

const SET = (b: boolean) => (b ? 'Set' : 'Not set');
const nameOf = (file: string) => file.replace(/^\d+_/, '').replace(/\.sql$/, '');
const mb = (b: number) => `${(b / 1_048_576).toFixed(1)} MB`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildInventory(x: InventoryInputs): InventoryItem[] {
  const out: InventoryItem[] = [];
  const add = (i: InventoryItem) => out.push(i);
  const prod = x.env.VERCEL_ENV === 'production';
  const aiOn = x.platform['ai.enabled'];
  const selfServe = x.platform['onboarding.self_serve'];

  // ── Secrets and keys ─────────────────────────────────────────────────────
  const G1 = 'Secrets and keys';
  add({
    id: 'env.service_role', group: G1, label: 'Supabase service key', source: 'environment',
    value: SET(x.secrets.SUPABASE_SERVICE_ROLE_KEY),
    status: x.secrets.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'crit',
    detail: x.secrets.SUPABASE_SERVICE_ROLE_KEY
      ? 'Server routes act on the database with it (SUPABASE_SERVICE_ROLE_KEY).'
      : 'Missing: every server route that writes to the database, this console included, fails. Set SUPABASE_SERVICE_ROLE_KEY in Vercel.',
    enforcedAt: ['src/lib/supabase/server.ts createAdminClient()'],
  });
  const pubSet = x.secrets.NEXT_PUBLIC_SUPABASE_URL && x.secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  add({
    id: 'env.public_supabase', group: G1, label: 'Supabase URL and public key', source: 'environment',
    value: pubSet ? 'Set' : 'Not set',
    status: pubSet ? 'ok' : x.secrets.NEXT_PUBLIC_SUPABASE_URL ? (selfServe ? 'crit' : 'warn') : 'crit',
    detail: pubSet
      ? 'Browser and server clients use NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      : !x.secrets.NEXT_PUBLIC_SUPABASE_URL
        ? 'NEXT_PUBLIC_SUPABASE_URL is not set: server routes can\'t reach the database at all.'
        : `NEXT_PUBLIC_SUPABASE_ANON_KEY is not set: the browser falls back to the key hard-coded in src/lib/supabase/client.ts, and self-serve sign-up refuses to run${selfServe ? ' while it is switched on' : ''}.`,
    enforcedAt: ['src/lib/supabase/client.ts', '/api/onboard'],
  });
  const aiKey = x.secrets.GEMINI_API_KEY || x.secrets.GOOGLE_GENERATIVE_AI_API_KEY;
  add({
    id: 'env.gemini', group: G1, label: 'Gemini API key', source: 'environment',
    value: SET(aiKey),
    status: aiKey ? 'ok' : aiOn ? 'crit' : 'warn',
    detail: aiKey
      ? 'Billed key used by every AI route (GEMINI_API_KEY).'
      : aiOn ? 'Missing while AI features are on: the tutor, grading and generators all fail. Set GEMINI_API_KEY.' : 'Missing. AI is paused, so nothing is failing yet.',
    enforcedAt: ['16 AI routes under /api'],
  });
  add({
    id: 'env.tutor_secret', group: G1, label: 'Tutor session signing secret', source: 'environment',
    value: SET(x.secrets.TUTOR_SESSION_SECRET),
    status: x.secrets.TUTOR_SESSION_SECRET ? 'ok' : 'warn',
    detail: x.secrets.TUTOR_SESSION_SECRET
      ? 'Signs the hint state of AI tutor sessions (TUTOR_SESSION_SECRET).'
      : 'Not set: tutor sessions are signed with the Supabase service key instead. Works, but rotating that key ends every running session and one secret does two jobs. Set TUTOR_SESSION_SECRET.',
    enforcedAt: ['src/lib/tutor/sessionToken.ts'],
  });
  const sentry = x.secrets.SENTRY_DSN || x.secrets.NEXT_PUBLIC_SENTRY_DSN;
  add({
    id: 'env.sentry', group: G1, label: 'Error reporting (Sentry)', source: 'environment',
    value: SET(sentry),
    status: sentry ? 'ok' : prod ? 'warn' : 'info',
    detail: sentry ? 'Server and browser errors are reported to Sentry.' : 'No DSN: errors in production are not reported anywhere. Create the Sentry project and set SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN.',
    enforcedAt: ['sentry.server.config.ts', 'src/instrumentation-client.ts'],
  });
  add({
    id: 'env.youtube', group: G1, label: 'YouTube API key', source: 'environment',
    value: SET(x.secrets.YOUTUBE_API_KEY),
    status: x.secrets.YOUTUBE_API_KEY ? 'ok' : 'info',
    detail: x.secrets.YOUTUBE_API_KEY ? 'Used by the video search route.' : 'Not set: /api/youtube (student video library, off the main nav) returns no results.',
    enforcedAt: ['/api/youtube'],
  });
  const contact = x.secrets.RESEND_API_KEY && x.secrets.TURNSTILE_SECRET_KEY;
  add({
    id: 'env.contact', group: G1, label: 'Website enquiry add-ons', source: 'environment',
    value: contact ? 'Email and bot check on' : x.secrets.RESEND_API_KEY ? 'Email only' : x.secrets.TURNSTILE_SECRET_KEY ? 'Bot check only' : 'Stored only',
    status: 'info',
    detail: 'Enquiries are always saved to the database and worked in Enquiries. RESEND_API_KEY adds an email alert, TURNSTILE_SECRET_KEY adds a bot check on the form.',
    enforcedAt: ['/api/contact', 'site/api/contact.mjs'],
  });
  const waLive = x.secrets.WHATSAPP_ACCESS_TOKEN && x.secrets.WHATSAPP_PHONE_NUMBER_ID;
  const waHook = x.secrets.WHATSAPP_APP_SECRET && x.secrets.WHATSAPP_VERIFY_TOKEN;
  add({
    id: 'env.whatsapp', group: G1, label: 'WhatsApp Business (parents)', source: 'environment',
    value: waLive ? (waHook ? 'Live' : 'Sending only') : 'Simulated',
    status: waLive ? (waHook ? 'ok' : 'warn') : prod ? 'warn' : 'info',
    detail: waLive
      ? waHook ? `Parents get grades, alerts, fee reminders and teacher replies on WhatsApp, and can Ask the School OS there${x.env.WHATSAPP_BUSINESS_NUMBER ? ` (${x.env.WHATSAPP_BUSINESS_NUMBER})` : ''}.`
        : 'Messages send, but inbound questions fail: set WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN and point the Meta webhook at /api/whatsapp/webhook.'
      : 'Placeholder key: every WhatsApp message is written to whatsapp_log as "simulated" and nothing reaches a phone; link codes are shown on screen. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID at deploy, then parents re-verify their numbers.',
    enforcedAt: ['src/lib/whatsapp/config.ts', '/api/whatsapp/webhook', '/api/parent/whatsapp'],
  });
  const stray = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'FIREBASE_ADMIN_PRIVATE_KEY'].filter(k => x.secrets[k]);
  if (stray.length) {
    add({
      id: 'env.stray', group: G1, label: 'Unused keys in the environment', source: 'environment',
      value: plural(stray.length, 'key'), status: 'warn', items: stray,
      detail: 'No live route uses these. A key nobody uses is still a key that can leak: remove them from Vercel.',
    });
  }

  // ── Launch and runtime ───────────────────────────────────────────────────
  const G2 = 'Launch and runtime';
  add({
    id: 'rt.env', group: G2, label: 'Deployment', source: 'runtime',
    value: x.env.VERCEL_ENV || x.env.NODE_ENV || 'unknown', status: 'info',
    detail: x.env.VERCEL_ENV ? `Vercel ${x.env.VERCEL_ENV} deployment.` : 'Not running on Vercel (local or self-hosted).',
  });
  const region = x.env.VERCEL_REGION;
  add({
    id: 'rt.region', group: G2, label: 'Function region', source: 'runtime',
    value: region || 'Not reported',
    status: !region ? 'info' : region === 'bom1' ? 'ok' : 'warn',
    detail: !region ? 'Only reported on Vercel.'
      : region === 'bom1' ? 'Server code runs in Mumbai, as the privacy policy states.'
      : `Server code runs in ${region}, but the privacy policy (site/LAUNCH.md) states processing in India (bom1). Set the function region to bom1 in Vercel project settings.`,
  });
  const approved = x.env.POLICIES_APPROVED === 'true';
  add({
    id: 'rt.policies', group: G2, label: 'Public website indexing', source: 'environment',
    value: approved ? 'Indexable' : 'Hidden from search',
    status: approved ? 'ok' : 'info',
    detail: approved ? 'POLICIES_APPROVED=true: marketing pages are indexable.' : 'POLICIES_APPROVED is not true: every marketing page is noindex and robots.txt disallows all. Flip it in Vercel at launch (then redeploy).',
    enforcedAt: ['site/build.mjs', 'public/site/robots.txt'],
  });
  const devBypass = x.env.NODE_ENV !== 'production';
  add({
    id: 'rt.dev_bypass', group: G2, label: 'Demo sign-in bypass', source: 'code',
    value: devBypass ? 'Active' : 'Off',
    status: devBypass ? (prod ? 'crit' : 'info') : 'ok',
    detail: devBypass ? 'Development build: the role cookie alone opens portals with sample data. Never deploy a development build.' : 'Production build: portals need a real session.',
    enforcedAt: ['src/proxy.ts', 'src/contexts/AuthContext.tsx'],
  });
  add({
    id: 'rt.rate_store', group: G2, label: 'Rate limit store', source: 'code',
    value: 'In memory, per instance', status: prod ? 'warn' : 'info',
    detail: 'Limits are counted inside each server instance. Vercel runs several, so a determined client gets roughly limit x instances. Moving the counter to Upstash Redis (Vercel Marketplace) makes the limits exact.',
    enforcedAt: ['src/lib/rateLimit.ts'],
  });

  // ── Platform controls ────────────────────────────────────────────────────
  const G3 = 'Platform controls';
  for (const [key, def] of Object.entries(PLATFORM_SETTINGS)) {
    const v = x.platform[key as keyof PlatformValues];
    let status: Status = 'ok';
    let note = '';
    if (key === 'ai.enabled' && !v) { status = 'warn'; note = 'AI is paused for every school.'; }
    if (key === 'onboarding.self_serve' && v) { status = 'info'; note = 'Anyone can create a school from /onboard.'; }
    if (key === 'notice.message' && v) { status = 'info'; note = 'A notice is showing to every user.'; }
    add({
      id: `platform.${key}`, group: G3, label: def.label, source: 'platform',
      value: def.type === 'boolean' ? (v ? 'On' : 'Off') : def.type === 'integer' ? `${v}${'unit' in def && def.unit ? ` ${def.unit}` : ''}`
        : def.type === 'enum' ? (def.options.find(o => o.value === v)?.label ?? String(v)) : (v ? `"${v}"` : 'Empty'),
      status, detail: [note, def.help].filter(Boolean).join(' '), enforcedAt: [...def.enforcedAt],
    });
  }
  if (!x.platformStored) {
    add({
      id: 'platform.store', group: G3, label: 'Platform settings store', source: 'database',
      value: 'Unavailable', status: 'crit',
      detail: 'public.platform_config could not be read, so code defaults apply and changes can\'t be saved. Apply migration ops_settings.',
    });
  }

  // ── Schools ──────────────────────────────────────────────────────────────
  const G4 = 'Schools';
  const S = x.schools;
  const real = S.filter(s => !s.testSchool);
  const noCode = S.filter(s => !s.code);
  add({
    id: 'school.codes', group: G4, label: 'Sign-in codes', source: 'school',
    value: noCode.length || x.duplicateCodes.length ? `${noCode.length} missing, ${x.duplicateCodes.length} duplicated` : `${S.length} unique`,
    status: noCode.length || x.duplicateCodes.length ? 'crit' : 'ok',
    items: [...noCode.map(s => `${s.name} (no code)`), ...x.duplicateCodes.map(c => `${c} (used twice)`)],
    detail: 'Every sign-in starts with the school code. A school without one can\'t sign in; a duplicated code is refused at sign-in.',
    enforcedAt: ['/api/auth/verify-school', 'src/app/login/page.tsx'],
  });
  const suspended = S.filter(s => !s.active);
  add({
    id: 'school.suspended', group: G4, label: 'Suspended schools', source: 'school',
    value: String(suspended.length), status: suspended.length ? 'info' : 'ok', items: suspended.map(s => s.name),
    detail: 'Suspended schools are refused at the code step, their logins are banned in Supabase Auth, and every API call and portal page is blocked.',
    enforcedAt: ['/api/auth/verify-school', 'src/lib/auth/verifyToken.ts', 'src/contexts/AuthContext.tsx', 'Supabase Auth ban'],
  });
  const expired = S.filter(s => s.active && s.trialExpired);
  add({
    id: 'school.trial_expired', group: G4, label: 'Ended pilots', source: 'school',
    value: String(expired.length), status: expired.some(s => !s.testSchool && s.people > 0) ? 'warn' : expired.length ? 'info' : 'ok',
    items: expired.map(s => `${s.name} (${plural(s.people, 'account')})`),
    detail: 'Users of these schools see the pilot-ended page and their API calls are refused. Extend the pilot or convert the school to a tier in Schools.',
    enforcedAt: ['src/lib/auth/verifyToken.ts', 'src/proxy.ts'],
  });
  const ending = S.filter(s => s.active && !s.trialExpired && s.trialDaysLeft !== null && s.trialDaysLeft <= 7);
  add({
    id: 'school.trial_ending', group: G4, label: 'Pilots ending within 7 days', source: 'school',
    value: String(ending.length), status: ending.some(s => !s.testSchool) ? 'warn' : 'ok',
    items: ending.map(s => `${s.name} (${plural(s.trialDaysLeft ?? 0, 'day')} left)`),
    detail: 'Their users already see the pilot-ending banner.',
  });
  const noAdmin = real.filter(s => s.active && s.schoolAdmins === 0);
  add({
    id: 'school.no_admin', group: G4, label: 'Schools with no school admin', source: 'school',
    value: String(noAdmin.length), status: noAdmin.length ? 'warn' : 'ok', items: noAdmin.map(s => s.name),
    detail: 'Nobody at these schools holds the school_admin office role, so nobody there can grant roles or manage people. Add one in the school\'s onboarding page.',
    enforcedAt: ['public.role_grants', 'src/lib/admin/rbac.ts'],
  });
  const aiOff = S.filter(s => !s.aiEnabled);
  add({
    id: 'school.ai_off', group: G4, label: 'Schools with AI turned off', source: 'school',
    value: String(aiOff.length), status: 'info', items: aiOff.map(s => s.name),
    detail: 'AI routes refuse requests from these schools\' users.',
    enforcedAt: ['src/lib/settings/server.ts aiGate()'],
  });

  // ── Database ─────────────────────────────────────────────────────────────
  const G5 = 'Database';
  const h = x.health;
  if (!h) {
    add({
      id: 'db.probe', group: G5, label: 'Database health probe', source: 'database', value: 'Unavailable', status: 'crit',
      detail: `ops_platform_health() could not run${x.healthError ? ` (${x.healthError})` : ''}. Apply migration ops_settings.`,
    });
  } else {
    add({
      id: 'db.rls', group: G5, label: 'Row level security', source: 'database',
      value: h.rls_off.length ? `${h.rls_off.length} of ${h.tables} tables unprotected` : `All ${h.tables} tables`,
      status: h.rls_off.length ? 'crit' : 'ok', items: h.rls_off,
      detail: h.rls_off.length ? 'These tables have RLS off: any signed-in user (or the public key) can read and write every row. Enable RLS and add policies.' : 'Every public table has RLS on; access is only what the policies allow.',
    });
    add({
      id: 'db.anon', group: G5, label: 'Write grants to the public key', source: 'database',
      value: h.anon_writable.length ? plural(h.anon_writable.length, 'table') : 'None',
      status: h.anon_writable.length ? 'warn' : 'ok', items: h.anon_writable,
      detail: h.anon_writable.length ? 'The anon role holds insert/update/delete on these tables. RLS still applies, but revoking the grant removes the risk entirely.' : 'The anon role can\'t write to any table.',
    });
    const live = new Set(h.migrations.map(m => m.name));
    const repo = x.repoMigrations;
    if (repo) {
      const repoNames = repo.map(nameOf);
      const notApplied = repo.filter(f => !live.has(nameOf(f)));
      const notInRepo = h.migrations.filter(m => !repoNames.includes(m.name)).map(m => `${m.name} (${m.version})`);
      add({
        id: 'db.migrations', group: G5, label: 'Migrations', source: 'database',
        value: notApplied.length ? `${notApplied.length} not applied` : notInRepo.length ? `${notInRepo.length} not in repo` : `${h.migrations.length} applied, in sync`,
        status: notApplied.length ? 'crit' : notInRepo.length ? 'warn' : 'ok',
        items: [...notApplied.map(f => `${f} (in repo, not applied)`), ...notInRepo.map(n => `${n} (applied, no file in repo)`)],
        detail: notApplied.length ? 'Code that expects these schema changes is running against a database without them.'
          : notInRepo.length ? 'Applied to the live database but missing from supabase/migrations: a rebuilt database would lack them. Commit the SQL.'
          : 'The live database has exactly the repo\'s migrations.',
      });
    } else {
      add({
        id: 'db.migrations', group: G5, label: 'Migrations', source: 'database',
        value: `${h.migrations.length} applied`, status: 'info',
        items: h.migrations.map(m => m.name),
        detail: 'Repo migration files aren\'t readable on this server, so drift can\'t be checked here.',
      });
    }
    add({
      id: 'db.operators', group: G5, label: 'Platform operators', source: 'database',
      value: String(h.operators), status: h.operators === 0 ? 'crit' : h.operators > 5 ? 'warn' : 'ok',
      detail: h.operators > 5 ? 'Operators can see and change every school. Keep the list short.' : 'Accounts that can open this console (users.role superadmin or public.superadmins).',
      enforcedAt: ['src/lib/ops/auth.ts'],
    });
    const lastAudit = h.audit_last ? new Date(h.audit_last).getTime() : null;
    add({
      id: 'db.audit', group: G5, label: 'Audit trail', source: 'database',
      value: `${h.audit_7d} changes in 7 days`,
      status: lastAudit === null ? 'warn' : 'ok',
      detail: lastAudit === null ? 'Nothing has been written to audit_log yet.' : `Last entry ${new Date(lastAudit).toISOString().slice(0, 16).replace('T', ' ')} UTC. Grades, roles, consent, guardians, fees and school settings are audited.`,
      enforcedAt: ['app.audit() triggers'],
    });
    add({
      id: 'db.size', group: G5, label: 'Database', source: 'database',
      value: `Postgres ${h.server_version} · ${mb(h.db_bytes)}`, status: 'info',
      detail: 'Supabase project in ap-south-1 (Mumbai).',
    });
  }

  // ── Limits and models ────────────────────────────────────────────────────
  const G6 = 'Limits and models';
  add({
    id: 'code.ai_models', group: G6, label: 'AI models', source: 'code',
    value: `${AI_MODELS.standard} (standard), ${AI_MODELS.deep} (deep)`, status: 'info',
    detail: 'Standard runs the tutor, grading, generators and copilot; deep runs operator course analysis. Change in src/lib/settings/limits.ts.',
    enforcedAt: ['src/lib/settings/limits.ts AI_MODELS'],
  });
  for (const [k, r] of Object.entries(RATE_LIMITS)) {
    const mins = r.windowMs / 60_000;
    add({
      id: `code.rate.${k}`, group: G6, label: r.label, source: 'code',
      value: `${r.limit} per ${mins === 1 ? 'minute' : `${mins} min`} per ${r.per}`, status: 'info',
      detail: `Rate limit on ${r.route}.`, enforcedAt: [r.route],
    });
  }

  return out;
}

export const STATUS_ORDER: Record<Status, number> = { crit: 0, warn: 1, info: 2, ok: 3 };

export function summarise(items: InventoryItem[]) {
  const c = { crit: 0, warn: 0, info: 0, ok: 0 } as Record<Status, number>;
  for (const i of items) c[i.status]++;
  return c;
}
