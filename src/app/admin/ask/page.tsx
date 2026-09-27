import type { Metadata } from 'next';
import AdminAskPage from '@/components/admin/AskPage';

export const metadata: Metadata = { title: 'Ask the School OS' };

export default function Page() {
  return <AdminAskPage />;
}
