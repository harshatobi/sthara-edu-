import type { Metadata } from 'next';
import { Suspense } from 'react';
import PayrollPage from '@/components/admin/payroll/PayrollPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Payroll' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><PayrollPage /></Suspense>;
}
