import type { Metadata } from 'next';
import Fees from '@/components/parent/Fees';

export const metadata: Metadata = { title: 'Fees & Payments' };

export default function Page() {
  return <Fees />;
}
