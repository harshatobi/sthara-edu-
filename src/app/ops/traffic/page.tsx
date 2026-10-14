import type { Metadata } from 'next';
import TrafficConsole from './TrafficConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Request explorer' };

export default async function Page() {
  await requireCapability('debug.read');
  return <TrafficConsole />;
}
