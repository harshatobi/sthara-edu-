import type { Metadata } from 'next';
import { Suspense } from 'react';
import PracticalPage from '@/components/lab/practicals/PracticalPage';
import '@/styles/lab.css';

export const metadata: Metadata = { title: 'Practical' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><PracticalPage id={id} /></Suspense>;
}
