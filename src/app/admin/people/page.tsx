import type { Metadata } from 'next';
import { Suspense } from 'react';
import PeoplePage from '@/components/admin/people/PeoplePage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'People' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><PeoplePage /></Suspense>;
}
