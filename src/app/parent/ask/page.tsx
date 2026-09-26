import { Suspense } from 'react';
import type { Metadata } from 'next';
import AskOS from '@/components/parent/AskOS';

export const metadata: Metadata = { title: 'Ask the School OS' };

export default function Page() {
  return <Suspense><AskOS /></Suspense>;
}
