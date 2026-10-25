import type { Metadata } from 'next';
import HealthPage from '@/components/admin/HealthPage';

export const metadata: Metadata = { title: 'Health' };

export default function Page() {
  return <HealthPage />;
}
