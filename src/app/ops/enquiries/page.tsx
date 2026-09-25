import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import EnquiriesConsole from './EnquiriesConsole';

export const metadata: Metadata = { title: 'Enquiries', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

export default async function EnquiriesPage() {
  const op = await operatorFromCookies();
  const devPreview = process.env.NODE_ENV !== 'production' && (await cookies()).get('__role')?.value === 'superadmin';
  if (!op && !devPreview) notFound();
  return <EnquiriesConsole devPreview={!op} />;
}
