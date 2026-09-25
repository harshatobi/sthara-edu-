import type { Metadata } from 'next';
import { Suspense } from 'react';
import AcademicPage from '@/components/admin/AcademicPage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Academic health' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><AcademicPage /></Suspense>;
}
