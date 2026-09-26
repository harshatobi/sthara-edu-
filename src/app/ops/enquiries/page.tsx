import type { Metadata } from 'next';
import EnquiriesConsole from './EnquiriesConsole';

export const metadata: Metadata = { title: 'Enquiries' };

export default function Page() {
  return <EnquiriesConsole />;
}
