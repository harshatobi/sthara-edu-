import type { Metadata } from 'next';
import { Suspense } from 'react';
import SafeguardingPage from '@/components/admin/safeguarding/SafeguardingPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Safeguarding' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><SafeguardingPage /></Suspense>;
}
