import type { Metadata } from 'next';
import { Suspense } from 'react';
import DisciplinePage from '@/components/admin/discipline/DisciplinePage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Discipline' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><DisciplinePage /></Suspense>;
}
