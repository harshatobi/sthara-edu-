import type { Metadata } from 'next';
import ParentHome from '@/components/parent/ParentHome';

export const metadata: Metadata = { title: 'Home' };

export default function ParentPage() {
  return <ParentHome />;
}
