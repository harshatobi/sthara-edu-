import type { Metadata } from 'next';
import { Suspense } from 'react';
import Builder from '@/components/lab/Builder';
import '@/styles/lab.css';

export const metadata: Metadata = { title: 'Live Lab' };

// Reads ?e= / ?scene= from the URL, so it renders on the client.
export default function Page() {
  return <Suspense><Builder /></Suspense>;
}
