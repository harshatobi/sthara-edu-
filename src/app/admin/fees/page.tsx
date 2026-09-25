import type { Metadata } from 'next';
import { Suspense } from 'react';
import FeesPage from '@/components/admin/fees/FeesPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Fee ledger' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><FeesPage /></Suspense>;
}
