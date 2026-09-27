import type { Metadata } from 'next';
import AdminFeedPage from '@/components/admin/FeedPage';

export const metadata: Metadata = { title: 'Situational feed' };

export default function Page() {
  return <AdminFeedPage />;
}
