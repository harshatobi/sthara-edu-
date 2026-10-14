import type { Metadata } from 'next';
import DeliveryConsole from './DeliveryConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Delivery and jobs' };

export default async function Page() {
  await requireCapability('debug.read');
  return <DeliveryConsole />;
}
