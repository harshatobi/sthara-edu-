import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import SchoolsConsole from './SchoolsConsole';

// Unlisted operator console: never linked, never indexed, 404 for everyone but operators.
export const metadata: Metadata = { title: 'Console', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const op = await operatorFromCookies();
  // Local dev only: lets the UI render with the demo __role cookie (API calls still require a real operator).
  const devPreview = process.env.NODE_ENV !== 'production' && (await cookies()).get('__role')?.value === 'superadmin';
  if (!op && !devPreview) notFound();
  return <SchoolsConsole devPreview={!op} />;
}
