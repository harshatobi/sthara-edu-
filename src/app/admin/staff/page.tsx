import type { Metadata } from 'next';
import { Suspense } from 'react';
import StaffPage from '@/components/admin/StaffPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Workforce' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><StaffPage /></Suspense>;
}
