import type { Metadata } from 'next';
import ConductPage from '@/components/teacher/ConductPage';

export const metadata: Metadata = { title: 'Conduct and care' };

export default function Page() {
  return <ConductPage />;
}
