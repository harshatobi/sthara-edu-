import type { Metadata } from 'next';
import Admissions from '@/components/parent/Admissions';

export const metadata: Metadata = { title: 'Admissions' };

export default function Page() {
  return <Admissions />;
}
