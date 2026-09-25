import { Suspense } from 'react';
import type { Metadata } from 'next';
import Progress from '@/components/parent/Progress';

export const metadata: Metadata = { title: 'Mastery & Reports' };

export default function Page() {
  return <Suspense><Progress /></Suspense>;
}
