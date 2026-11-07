import type { Metadata } from 'next';
import SetupHub from '@/components/admin/home/SetupHub';

export const metadata: Metadata = { title: 'School setup' };

export default function SetupPage() {
  return <SetupHub />;
}
