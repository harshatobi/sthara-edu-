import type { Metadata } from 'next';
import WellnessPage from '@/components/admin/WellnessPage';

export const metadata: Metadata = { title: 'CBSE wellness report' };

export default function Page() {
  return <WellnessPage />;
}
