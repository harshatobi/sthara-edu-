import type { Metadata } from 'next';
import { Suspense } from 'react';
import AdmissionsPage from '@/components/admin/AdmissionsPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Admissions' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><AdmissionsPage /></Suspense>;
}
