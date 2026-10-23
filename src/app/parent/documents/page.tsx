import type { Metadata } from 'next';
import Documents from '@/components/parent/Documents';

export const metadata: Metadata = { title: 'Documents' };

export default function Page() {
  return <Documents />;
}
