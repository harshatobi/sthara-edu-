import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import SettingsConsole from './SettingsConsole';

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const op = await operatorFromCookies();
  const devPreview = process.env.NODE_ENV !== 'production' && (await cookies()).get('__role')?.value === 'superadmin';
  if (!op && !devPreview) notFound();
  return <SettingsConsole devPreview={!op} />;
}
