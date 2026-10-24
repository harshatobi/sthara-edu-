import type { Metadata } from 'next';
import HealthCard from '@/components/parent/HealthCard';

export const metadata: Metadata = { title: 'Health card' };

export default function Page() {
  return <HealthCard />;
}
