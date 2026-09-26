import type { Metadata } from 'next';
import Schoolwork from '@/components/parent/Schoolwork';

export const metadata: Metadata = { title: 'Schoolwork' };

export default function Page() {
  return <Schoolwork />;
}
