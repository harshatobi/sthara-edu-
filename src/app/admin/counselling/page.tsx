import type { Metadata } from 'next';
import CounsellingPage from '@/components/admin/counselling/CounsellingPage';

export const metadata: Metadata = { title: 'Counselling' };

export default function Page() {
  return <CounsellingPage />;
}
