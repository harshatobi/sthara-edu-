import type { Metadata } from 'next';
import KirtiPage from '@/components/teacher/KirtiPage';

export const metadata: Metadata = { title: 'Kirti' };

export default function Page() {
  return <KirtiPage />;
}
