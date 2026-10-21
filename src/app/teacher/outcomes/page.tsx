import type { Metadata } from 'next';
import OutcomesPage from '@/components/teacher/OutcomesPage';

export const metadata: Metadata = { title: 'Year-end outcomes' };

export default function Page() {
  return <OutcomesPage />;
}
