import type { Metadata } from 'next';
import Conduct from '@/components/parent/Conduct';

export const metadata: Metadata = { title: 'Conduct and care' };

export default function Page() {
  return <Conduct />;
}
