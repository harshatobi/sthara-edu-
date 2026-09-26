import type { Metadata } from 'next';
import Settings from '@/components/parent/Settings';

export const metadata: Metadata = { title: 'WhatsApp & Privacy' };

export default function Page() {
  return <Settings />;
}
