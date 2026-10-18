import type { Metadata } from 'next';
import { Suspense } from 'react';
import PracticalsHome from '@/components/lab/practicals/PracticalsHome';
import '@/styles/lab.css';

export const metadata: Metadata = { title: 'Practicals' };

// Reads ?class= and ?tab= from the URL, so it renders on the client.
export default function Page() {
  return <Suspense><PracticalsHome /></Suspense>;
}
