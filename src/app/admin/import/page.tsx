import type { Metadata } from 'next';
import ImportPage from '@/components/admin/ImportPage';

export const metadata: Metadata = { title: 'Data import' };

export default function Page() {
  return <ImportPage />;
}
