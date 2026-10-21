import type { Metadata } from 'next';
import FamilyDetails from '@/components/parent/FamilyDetails';

export const metadata: Metadata = { title: 'Family details' };

export default function Page() {
  return <FamilyDetails />;
}
