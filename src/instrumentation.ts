import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // Server console.error calls also go to the ops error log.
    const { captureConsoleErrors } = await import('./lib/errors/log');
    captureConsoleErrors();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

/** Uncaught errors in routes, pages and the proxy: to Sentry (once a DSN is set) and to the ops error log. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  Sentry.captureRequestError(err, request, context);
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const e = err as Error & { digest?: string };
  const { reportError } = await import('./lib/errors/log');
  const ua = request.headers['user-agent'];
  await reportError({
    source: 'server', kind: 'uncaught',
    message: e?.message || String(err), stack: e?.stack ?? null, digest: e?.digest ?? null,
    route: context.routePath, method: request.method, path: request.path,
    userAgent: Array.isArray(ua) ? ua[0] : ua ?? null,
    context: { routeType: context.routeType, renderSource: 'renderSource' in context ? context.renderSource : undefined },
  });
};
