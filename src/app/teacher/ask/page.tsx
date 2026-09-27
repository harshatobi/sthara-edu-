import type { Metadata } from 'next';
import StaffAskPage from '@/components/staff/AskPage';

export const metadata: Metadata = { title: 'Ask the School OS' };

export default function Page() {
  return <StaffAskPage role="teacher" />;
}
