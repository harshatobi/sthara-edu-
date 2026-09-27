/**
 * How errors are grouped in the ops error log, and what is never stored. Pure (no I/O), so the server logger, the
 * browser reporter endpoint and the tests share one set of rules.
 *
 * Two errors are the same problem when they come from the same place (source, kind, route) with the same message
 * once the parts that change every time are taken out: ids, numbers, quoted values, emails, URLs' query strings.
 */

export type ErrorSource = 'server' | 'client';
export type ErrorKind = 'uncaught' | 'logged' | 'client' | 'render' | 'unhandled';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const JWT = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;
const LONG_HEX = /\b[0-9a-f]{16,}\b/gi;

/** Removes things that must never be kept: tokens, emails, phone-like numbers (DPDP: no personal data in the log). */
export function scrub(text: string): string {
  return text
    .replace(JWT, '[token]')
    .replace(/(bearer\s+)[\w.-]+/gi, '$1[token]')
    .replace(/((?:password|passwd|secret|token|apikey|api_key|authorization)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, '$1[redacted]')
    .replace(EMAIL, '[email]')
    .replace(/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g, '[phone]');
}

/** A request path without its query string or fragment (a query can carry tokens or names). */
export function cleanPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = String(path).split(/[?#]/)[0].slice(0, 500);
  return p.replace(UUID, ':id');
}

/** The message with its changing parts replaced, so repeats of one problem group together. */
export function normaliseMessage(message: string): string {
  return scrub(message)
    .replace(UUID, ':id')
    .replace(LONG_HEX, ':hex')
    .replace(/(["'`])(?:(?!\1).){1,120}\1/g, '$1…$1')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** The first stack frame in our own code (not node_modules or the runtime), for grouping. */
export function topFrame(stack: string | null | undefined): string {
  if (!stack) return '';
  for (const line of stack.split('\n').slice(1, 30)) {
    const l = line.trim();
    if (!l.startsWith('at ') && !l.includes('@')) continue;
    if (/node_modules|node:internal|<anonymous>|webpack-internal:\/\/\/\(app-pages-browser\)\/\.\/node_modules/.test(l)) continue;
    // Drop line and column numbers: they move with every build.
    return l.replace(/:\d+:\d+\)?$/, '').replace(/\?[^)\s]*/, '').slice(0, 200);
  }
  return '';
}

/** FNV-1a, 64-bit, as 16 hex characters: stable across runtimes (browser, Node, tests) with no crypto import. */
export function hash(text: string): string {
  let h = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

export function fingerprintOf(e: { source: ErrorSource; kind: ErrorKind; message: string; route?: string | null; stack?: string | null }): string {
  return hash([e.source, e.kind === 'logged' ? 'logged' : 'error', cleanPath(e.route) ?? '', normaliseMessage(e.message), topFrame(e.stack)].join('|'));
}

/** Browser noise that isn't ours to fix: extensions, cross-origin "Script error.", ResizeObserver loop notices. */
export function isNoise(e: { message: string; stack?: string | null }): boolean {
  const m = e.message || '';
  if (/^Script error\.?$/i.test(m.trim())) return true;
  if (/ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(m)) return true;
  if (/(chrome|moz|safari(-web)?)-extension:\/\//i.test(`${m} ${e.stack ?? ''}`)) return true;
  // A page navigated away mid-request: not an error in the app.
  if (/AbortError|The user aborted a request|signal is aborted/i.test(m)) return true;
  return false;
}
