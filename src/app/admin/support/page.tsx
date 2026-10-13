import type { Metadata } from 'next';
import SupportPage from '@/components/admin/SupportPage';

export const metadata: Metadata = { title: 'Help & support' };

export default function Page() {
  return <SupportPage />;
}
