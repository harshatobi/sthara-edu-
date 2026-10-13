import type { Metadata } from 'next';
import EnquiriesConsole from './EnquiriesConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Enquiries' };

export default async function Page() {
  await requireCapability('enquiries.read');
  return <EnquiriesConsole />;
}
