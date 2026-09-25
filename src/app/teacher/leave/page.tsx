import type { Metadata } from 'next';
import LeavePage from '@/components/teacher/LeavePage';

export const metadata: Metadata = { title: 'Leave' };

export default function Page() {
  return <LeavePage />;
}
