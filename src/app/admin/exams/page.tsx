import type { Metadata } from 'next';
import { Suspense } from 'react';
import ExamsPage from '@/components/admin/exams/ExamsPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Exams & report cards' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><ExamsPage /></Suspense>;
}
