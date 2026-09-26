import { Suspense } from 'react';
import type { Metadata } from 'next';
import StaffInbox from '@/components/messages/StaffInbox';

export const metadata: Metadata = { title: 'Parent Messages' };

export default function Page() {
  return <Suspense><StaffInbox role="teacher" base="/teacher/messages" /></Suspense>;
}
