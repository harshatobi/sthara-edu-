// Sentry server-side (Node.js runtime) initialization.
// No-ops until SENTRY_DSN is set — safe to ship before a Sentry project exists.
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  });
}
