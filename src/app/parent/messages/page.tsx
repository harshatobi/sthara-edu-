import { Suspense } from 'react';
import type { Metadata } from 'next';
import Messages from '@/components/parent/Messages';

export const metadata: Metadata = { title: 'School Messages' };

export default function Page() {
  return <Suspense><Messages /></Suspense>;
}
