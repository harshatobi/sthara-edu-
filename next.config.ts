import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  serverExternalPackages: ['firebase-admin', '@google/generative-ai'],
};

// Safe no-op wrapper: only uploads source maps / release info to Sentry when
// SENTRY_AUTH_TOKEN is actually configured (e.g. in Vercel env vars). Without
// it, this just skips the upload step — builds are unaffected either way.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
