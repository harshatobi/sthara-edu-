import type { Metadata } from 'next';
import { Suspense } from 'react';
import Presenter from '@/components/lab/Presenter';
import '@/styles/lab.css';

export const metadata: Metadata = { title: 'Live Lab' };

// Reads ?scene= from the URL, so it renders on the client.
export default function Page() {
  return <Suspense><Presenter /></Suspense>;
}
