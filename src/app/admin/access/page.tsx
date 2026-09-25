import type { Metadata } from 'next';
import AccessPage from '@/components/admin/AccessPage';

export const metadata: Metadata = { title: 'Roles & access' };

export default function Page() {
  return <AccessPage />;
}
