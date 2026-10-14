import type { Metadata } from 'next';
import { Suspense } from 'react';
import RequestsConsole from './RequestsConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Login requests' };

export default async function Page() {
  await requireCapability('requests.manage');
  return <Suspense><RequestsConsole /></Suspense>;
}
