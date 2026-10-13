import type { Metadata } from 'next';
import { Suspense } from 'react';
import AttendanceAdmin from '@/components/admin/AttendanceAdmin';
import { PageSkeleton } from '@/components/admin/kit';

export const metadata: Metadata = { title: 'Student attendance' };

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><AttendanceAdmin /></Suspense>;
}
