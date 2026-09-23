import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { operatorFromCookies } from '@/lib/ops/auth';
import SchoolOnboarding from './SchoolOnboarding';

export const metadata: Metadata = { title: 'Console', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

export default async function OpsSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const op = await operatorFromCookies();
  const devPreview = process.env.NODE_ENV !== 'production' && (await cookies()).get('__role')?.value === 'superadmin';
  if (!op && !devPreview) notFound();
  const { schoolId } = await params;
  return <SchoolOnboarding schoolId={schoolId} devPreview={!op} />;
}
