import type { Metadata } from 'next';
import DeskConsole from './DeskConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Service desk' };

export default async function Page() {
  await requireCapability('desk.read');
  return <DeskConsole />;
}
