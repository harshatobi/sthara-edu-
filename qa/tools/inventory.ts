/**
 * Read-only inventory of the app, taken from the source on every run so the test pack
 * never drifts from the code: every page, every API route and method, the guard in front
 * of each route, and the navigation of each portal. Used by the API gate sweep, the
 * catalog check and the workbooks. It only ever reads the app.
 *
 * The pack lives in the app's repo (qa/): the app is the parent folder, or STHARA_APP_DIR to test another checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** This test pack's own folder. */
export const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The app under test (read-only). */
export const ROOT = path.resolve(process.env.STHARA_APP_DIR || path.join(QA, '..'));
if (!fs.existsSync(path.join(ROOT, 'src/app'))) {
  throw new Error(`The app isn't at ${ROOT}. Set STHARA_APP_DIR to a sthara-edu- checkout.`);
}
const APP = path.join(ROOT, 'src/app');

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

/** src/app/api/ops/schools/[id]/route.ts -> /api/ops/schools/[id] */
const routeOf = (file: string) => '/' + path.relative(APP, path.dirname(file)).split(path.sep).filter(s => !/^\(.*\)$/.test(s)).join('/');

// ── API routes ──────────────────────────────────────────────────────────────

export type Guard =
  | 'office'        // requireAdmin: school office account with the named permission(s)
  | 'staff'         // requireStaff: teacher or office account
  | 'feed'          // requireFeedCaller: teacher or office account (feed, incidents, WhatsApp)
  | 'parent'        // requireParent
  | 'signed-in'     // verifyApiToken + the route's own role checks
  | 'operator'      // operatorFromRequest: Sthara operators only, 404 for everyone else
  | 'cron'          // Authorization: Bearer <CRON_SECRET>
  | 'device'        // biometric device token
  | 'meta'          // WhatsApp webhook: verify token (GET) / X-Hub-Signature-256 (POST)
  | 'public'        // deliberately open (sign-in lookup, health, contact form, error reports)
  | 'unguarded';    // none of the above: a finding until someone decides it is public

export interface ApiRoute {
  route: string;
  file: string;
  methods: string[];
  guard: Guard;
  perms: string[];
  /** Status codes an unauthenticated caller may get. Anything else (above all 2xx or 5xx) is a failure. */
  anonymous: Record<string, number[]>;
}

/** Open on purpose, with what a caller who sends nothing useful gets back. */
const PUBLIC: Record<string, Record<string, number[]>> = {
  '/api/health': { GET: [200, 503] },
  '/api/platform/public': { GET: [200] },
  '/api/auth/verify-school': { POST: [400, 429] },
  // Same-origin only: without an Origin/Referer from the site itself, both methods answer 403.
  '/api/contact': { GET: [403], POST: [403] },
  '/api/errors': { POST: [204, 400, 413] },
};

const METHOD = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;

function guardOf(route: string, src: string): { guard: Guard; perms: string[] } {
  const perms = [...src.matchAll(/requireAdmin\(\s*\w+\s*,\s*(\[[^\]]*\]|'[^']+')/g)]
    .flatMap(m => [...m[1].matchAll(/'([a-z.]+)'/g)].map(x => x[1]));
  const denies = [...src.matchAll(/deny\(\s*\w+\s*,\s*'([a-z.]+)'/g)].map(m => m[1]);
  const all = [...new Set([...perms, ...denies])];
  if (route in PUBLIC) return { guard: 'public', perms: [] };
  // operatorFor(req, perm) replaced operatorFromRequest in the ops CRM (2026-10-13); both 404 non-operators.
  if (/operatorFromRequest\(|operatorFor\(/.test(src)) return { guard: 'operator', perms: [] };
  if (/CRON_SECRET/.test(src)) return { guard: 'cron', perms: [] };
  if (/x-hub-signature-256/.test(src)) return { guard: 'meta', perms: [] };
  if (/x-device-token/.test(src)) return { guard: 'device', perms: [] };
  if (/requireAdmin\(/.test(src)) return { guard: 'office', perms: all };
  if (/requireParent\(/.test(src)) return { guard: 'parent', perms: [] };
  if (/requireFeedCaller\(/.test(src)) return { guard: 'feed', perms: [] };
  if (/requireStaff\(/.test(src)) return { guard: 'staff', perms: [] };
  if (/verifyApiToken\(/.test(src)) return { guard: 'signed-in', perms: all };
  return { guard: 'unguarded', perms: [] };
}

function anonymousFor(route: string, guard: Guard, methods: string[]): Record<string, number[]> {
  if (PUBLIC[route]) return PUBLIC[route];
  const out: Record<string, number[]> = {};
  for (const m of methods) {
    if (guard === 'operator') out[m] = [404];
    else if (guard === 'meta') out[m] = m === 'GET' ? [403] : [401];
    else out[m] = [401];
  }
  return out;
}

export function apiRoutes(): ApiRoute[] {
  return walk(path.join(APP, 'api'), 'route.ts').sort().map(file => {
    const src = fs.readFileSync(file, 'utf8');
    const route = routeOf(file);
    const methods = [...new Set([...src.matchAll(METHOD)].map(m => m[1] || m[2]))];
    const { guard, perms } = guardOf(route, src);
    return { route, file: path.relative(ROOT, file), methods, guard, perms, anonymous: anonymousFor(route, guard, methods) };
  });
}

/** A URL for a route with dynamic segments filled in (an all-zero UUID never matches a real row). */
export const sampleUrl = (route: string) => route.replace(/\[[^\]]+\]/g, '00000000-0000-0000-0000-000000000000');

// ── Pages and navigation ────────────────────────────────────────────────────

export interface NavItem { portal: string; href: string; label: string; need: string[] }

/** Nav entries of a portal shell: `{ href: '/admin/fees', label: 'Admissions & Fees', ..., need: ['fees.read'] }`. */
export function navOf(file: string, portal: string): NavItem[] {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...src.matchAll(/\{\s*href:\s*'([^']+)',\s*label:\s*'([^']+)'([^\n]*)\}/g)].map(m => ({
    portal, href: m[1], label: m[2],
    need: [...(m[3].match(/need:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z.]+)'/g)].map(x => x[1]),
  }));
}

export const NAV_FILES: Record<string, string> = {
  admin: 'src/app/admin/layout.tsx',
  teacher: 'src/app/teacher/layout.tsx',
  student: 'src/app/student/layout.tsx',
  parent: 'src/app/parent/layout.tsx',
  ops: 'src/app/ops/OpsShell.tsx',
};

export function navigation(): NavItem[] {
  return Object.entries(NAV_FILES).flatMap(([portal, file]) => navOf(file, portal));
}

export interface Page { route: string; file: string; portal: string; kind: 'page' | 'redirect'; redirectsTo: string | null; nav: string | null }

export function pages(): Page[] {
  const nav = navigation();
  return walk(APP, 'page.tsx').sort().map(file => {
    const src = fs.readFileSync(file, 'utf8');
    const route = routeOf(file).replace(/^\/$/, '/') || '/';
    const to = src.match(/redirect\(\s*[`'"]([^`'"]+)[`'"]/)?.[1] ?? null;
    const isRedirect = !!to && src.split('\n').length < 15;
    return {
      route, file: path.relative(ROOT, file), portal: route.split('/')[1] || 'root',
      kind: isRedirect ? 'redirect' : 'page', redirectsTo: isRedirect ? to : null,
      nav: nav.find(n => n.href === route)?.label ?? null,
    };
  });
}

// ── Automated tests already in the repo ─────────────────────────────────────

export interface AutoTest {
  /** 'app:src/lib/...' for the app's own tests, 'qa:e2e/...' for this pack's. */
  file: string;
  name: string;
  kind: 'unit' | 'e2e' | 'site';
  owner: 'app' | 'qa';
}

/** Every automated test by file and name: the app's own suites plus this pack's. */
export function automatedTests(): AutoTest[] {
  const sources: [string, 'app' | 'qa', string, RegExp][] = [
    [path.join(ROOT, 'src/lib'), 'app', ROOT, /\.test\.ts$/],
    [path.join(ROOT, 'site/tests'), 'app', ROOT, /\.test\.mjs$/],
    [path.join(QA, 'regression'), 'qa', QA, /\.test\.ts$/],
    [path.join(QA, 'e2e'), 'qa', QA, /\.(spec|setup)\.ts$/],
  ];
  return sources.flatMap(([dir, owner, base, re]) => listFiles(dir, re).flatMap(f => {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(base, f);
    const kind = rel.endsWith('.spec.ts') ? 'e2e' : rel.startsWith('site/') ? 'site' : 'unit';
    return [...src.matchAll(/^\s*(?:test|it|setup)(?:\.(?:fixme|skip|only|todo))?\(\s*(['"`])((?:\\.|(?!\1).)+)\1/gm)]
      .map(m => ({ file: `${owner}:${rel}`, name: m[2].replace(/\\(.)/g, '$1'), kind, owner }));
  }));
}

function listFiles(dir: string, re: RegExp, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') listFiles(p, re, out); }
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`App under test: ${ROOT}`);
  const api = apiRoutes();
  const byGuard = api.reduce<Record<string, number>>((a, r) => ((a[r.guard] = (a[r.guard] || 0) + 1), a), {});
  console.log(`API routes: ${api.length} (${api.reduce((n, r) => n + r.methods.length, 0)} handlers)`, byGuard);
  console.log(`Pages: ${pages().length}; nav items: ${navigation().length}; automated tests: ${automatedTests().length}`);
  for (const r of api.filter(r => r.guard === 'public')) console.log('  public:', r.route, r.methods.join(','));
}
