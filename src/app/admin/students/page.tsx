import type { Metadata } from 'next';
import StudentsPage from '@/components/admin/students/StudentsPage';

export const metadata: Metadata = { title: 'Students' };

export default function Page() {
  return <StudentsPage />;
}
