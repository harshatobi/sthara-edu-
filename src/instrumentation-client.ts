// Browser-side monitoring: Sentry (no-ops until NEXT_PUBLIC_SENTRY_DSN is set) and the ops error log.
import * as Sentry from '@sentry/nextjs';
import { reportClientError } from '@/lib/errors/client';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  });
}

// Uncaught errors and unhandled promise rejections go to the ops error log (render errors come from the error boundaries).
try {
  window.addEventListener('error', e => reportClientError('client', e.error ?? e.message));
  window.addEventListener('unhandledrejection', e => reportClientError('unhandled', e.reason));
} catch { /* monitoring must never stop the app from starting */ }

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
