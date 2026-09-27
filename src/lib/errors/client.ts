/**
 * Sends browser errors to /api/errors (the ops error log). Used by instrumentation-client.ts for window errors and
 * unhandled promise rejections, and by the error boundaries for render errors. Never throws; each distinct message
 * is sent at most three times per page load so a render loop can't flood the log.
 */
const sent = new Map<string, number>();

export function reportClientError(kind: 'client' | 'render' | 'unhandled', err: unknown, extra: { digest?: string } = {}) {
  try {
    if (typeof window === 'undefined') return;
    const e = err instanceof Error ? err : null;
    const message = (e?.message || (typeof err === 'string' ? err : safe(err)) || 'Unknown error').slice(0, 2000);
    const n = sent.get(message) ?? 0;
    if (n >= 3) return;
    sent.set(message, n + 1);
    const body = JSON.stringify({ kind, message, stack: e?.stack?.slice(0, 8000) ?? null, path: window.location.pathname, digest: extra.digest ?? null });
    // keepalive lets the report finish even if the page is being left.
    void fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

const safe = (v: unknown) => { try { return JSON.stringify(v)?.slice(0, 500); } catch { return String(v); } };
