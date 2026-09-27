import type { Metadata } from 'next';
import { Suspense } from 'react';
import SchedulePage from '@/components/admin/schedule/SchedulePage';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Schedule' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><SchedulePage /></Suspense>;
}
