import type { Metadata } from 'next';
import { Suspense } from 'react';
import RequestsConsole from './RequestsConsole';

export const metadata: Metadata = { title: 'Login requests' };

export default function Page() {
  return <Suspense><RequestsConsole /></Suspense>;
}
