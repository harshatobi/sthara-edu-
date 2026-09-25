import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// The marketing site (site/, built into public/site by `node site/build.mjs --app`) is served
// at its clean URLs. It only takes paths the app doesn't use: the portals (/student, /teacher,
// /admin, /parent), /login and the APIs are untouched.
const MARKETING: [string, string][] = [
  ['/', 'index'], ['/about', 'about'], ['/privacy', 'privacy'], ['/dpdp', 'dpdp'], ['/contact', 'contact'],
  ['/for/students', 'for-students'], ['/for/teachers', 'for-teachers'],
  ['/for/administrators', 'for-administrators'], ['/for/parents', 'for-parents'],
];

// The site's own security headers (from site/vercel.json), applied to its pages and files only.
const MARKETING_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      ...MARKETING.map(([source, file]) => ({ source, destination: `/site/${file}.html` })),
      { source: '/robots.txt', destination: '/site/robots.txt' },
      { source: '/sitemap.xml', destination: '/site/sitemap.xml' },
    ];
  },
  async headers() {
    return [
      ...[...MARKETING.map(([source]) => source), '/site/:path*'].map(source => ({ source, headers: MARKETING_HEADERS })),
      { source: '/site/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
    ];
  },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  serverExternalPackages: ['firebase-admin', '@google/generative-ai'],
  experimental: {
    // Reuse a visited page's server payload for 30s on client navigation
    // (Next 15+ default is 0: every tab switch refetches). Page data is loaded
    // client-side by shared providers, so this can't serve stale records.
    staleTimes: { dynamic: 30 },
  },
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
