import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAdminClient } from '@/lib/supabase/server';
import { cleanPath, fingerprintOf, scrub, type ErrorKind, type ErrorSource } from './fingerprint';

/**
 * Writes errors to the ops error log (public.app_errors via log_app_error). Never throws and never waits long: a
 * logging failure must not turn into a second failure for the user. Identical errors within a few seconds on one
 * server instance are folded into one row with a repeat count, so an error loop can't flood the database.
 */

export interface ErrorReport {
  source: ErrorSource;
  kind: ErrorKind;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  path?: string | null;
  schoolId?: string | null;
  userId?: string | null;
  userRole?: string | null;
  userAgent?: string | null;
  digest?: string | null;
  context?: Record<string, unknown>;
}

const FOLD_MS = 10_000;
/** Folded repeats are written at least this often, so a long burst shows up while it's happening. */
const FLUSH_EVERY = 25;
interface Pending { at: number; folded: number; report: ErrorReport; message: string; timer: ReturnType<typeof setTimeout> | null }
const recent = new Map<string, Pending>();
let writing = 0;
/** Marks the logger's own async work, so an error raised while recording one isn't recorded again (and only then). */
const inLogger = new AsyncLocalStorage<true>();

/** Where errors are recorded: previews and production (a local dev server without the service key logs nothing). */
function enabled() {
  if (process.env.NODE_ENV === 'test' || process.env.STHARA_ERROR_LOG === 'off') return false;
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function reportError(r: ErrorReport): Promise<void> {
  if (!enabled() || writing > 20) return;  // the log itself is failing or flooded; don't pile on
  const message = scrub(String(r.message || 'Unknown error')).slice(0, 2000);
  const fingerprint = fingerprintOf({ source: r.source, kind: r.kind, message, route: r.route ?? r.path, stack: r.stack });
  const now = Date.now();
  const seen = recent.get(fingerprint);
  if (seen && now - seen.at < FOLD_MS) {
    // The same error again within the window: count it, and write the count out every FLUSH_EVERY or when the
    // window closes, so a burst that stops still shows its full size.
    seen.folded++;
    seen.report = r; seen.message = message;
    if (seen.folded >= FLUSH_EVERY) await flush(fingerprint);
    else if (!seen.timer) {
      seen.timer = setTimeout(() => { void flush(fingerprint); }, FOLD_MS);
      (seen.timer as { unref?: () => void }).unref?.();
    }
    return;
  }
  if (seen?.folded) await flush(fingerprint);
  recent.set(fingerprint, { at: now, folded: 0, report: r, message, timer: null });
  if (recent.size > 500) {
    for (const [k, v] of recent) if (now - v.at > FOLD_MS) { if (v.folded) void flush(k); else recent.delete(k); }
  }
  await write(fingerprint, r, message, 1);
}

/** Writes out the repeats folded for a fingerprint since its last row. */
async function flush(fingerprint: string) {
  const p = recent.get(fingerprint);
  if (!p) return;
  if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  const n = p.folded;
  p.folded = 0; p.at = Date.now();
  if (n > 0) await write(fingerprint, p.report, p.message, n);
}

function write(fingerprint: string, r: ErrorReport, message: string, repeats: number): Promise<void> {
  return inLogger.run(true, async () => {
    writing++;
    try {
      const { error } = await createAdminClient().rpc('log_app_error', {
        p_fingerprint: fingerprint, p_source: r.source, p_kind: r.kind, p_message: message,
        p_stack: r.stack ? scrub(r.stack).slice(0, 8000) : null,
        p_route: cleanPath(r.route), p_method: r.method ?? null, p_path: cleanPath(r.path),
        p_school: r.schoolId ?? null, p_user: r.userId ?? null, p_user_role: r.userRole ?? null,
        p_release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
        p_environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
        p_user_agent: r.userAgent?.slice(0, 400) ?? null, p_digest: r.digest ?? null, p_repeats: repeats,
        p_context: contextOf(r.context),
      });
      // Written with the original console so the logger never logs itself.
      if (error) originalError?.('[error-log] could not record an error:', error.message);
    } catch (e) {
      originalError?.('[error-log] could not record an error:', e instanceof Error ? e.message : e);
    } finally {
      writing--;
    }
  });
}

/** Extra detail, scrubbed; dropped (with a note) if it is too big to be useful. */
function contextOf(c: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!c) return {};
  try {
    const clean = JSON.parse(scrub(JSON.stringify(c)));
    return JSON.stringify(clean).length <= 4000 ? clean : { truncated: true, keys: Object.keys(c).slice(0, 20) };
  } catch { return { unserialisable: true }; }
}

/** Turns console.error arguments into a report: the text, and the stack of the first Error among them. */
export function fromConsole(args: unknown[]): Pick<ErrorReport, 'message' | 'stack'> {
  const err = args.find((a): a is Error => a instanceof Error);
  const text = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeJson(a))).join(' ');
  return { message: text || 'console.error with no message', stack: err?.stack ?? null };
}
const safeJson = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 500) ?? String(v); } catch { return String(v); } };

let originalError: ((...a: unknown[]) => void) | null = null;

/**
 * Every console.error on the server also goes to the error log (routes log their real failures that way, like
 * "[attendance] insert failed"). Installed once per server instance, from instrumentation.ts.
 */
export function captureConsoleErrors() {
  if (originalError || !enabled()) return;
  originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError!(...args);
    if (inLogger.getStore()) return;  // raised while recording another error: don't loop
    const { message, stack } = fromConsole(args);
    // Next's own request errors arrive through onRequestError with the route; don't record them twice.
    if (/^\s*⨯|digest:/.test(message)) return;
    void reportError({ source: 'server', kind: 'logged', message, stack, route: tagOf(message) });
  };
}

/** "[attendance] insert failed" -> "[attendance]": the route tag most logs start with, used as their route. */
function tagOf(message: string): string | null {
  const m = /^\s*\[([\w\s/-]{2,40})\]/.exec(message);
  return m ? `[${m[1].trim()}]` : null;
}
