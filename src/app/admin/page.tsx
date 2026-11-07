import type { Metadata } from 'next';
import Home from '@/components/admin/home/Home';

export const metadata: Metadata = { title: 'Command Centre' };

export default function AdminPage() {
  return <Home />;
}
