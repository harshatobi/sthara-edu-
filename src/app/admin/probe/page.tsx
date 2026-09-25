import type { Metadata } from 'next';
import { Suspense } from 'react';
import ProbePage from '@/components/admin/ProbePage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Probe' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><ProbePage /></Suspense>;
}
