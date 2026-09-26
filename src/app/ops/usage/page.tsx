import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import UsageConsole from './UsageConsole';

export const metadata: Metadata = { title: 'AI usage', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const op = await operatorFromCookies();
  const devPreview = process.env.NODE_ENV !== 'production' && (await cookies()).get('__role')?.value === 'superadmin';
  if (!op && !devPreview) notFound();
  return <UsageConsole devPreview={!op} />;
}
