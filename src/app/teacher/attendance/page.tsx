import type { Metadata } from 'next';
import AttendancePage from '@/components/teacher/AttendancePage';

export const metadata: Metadata = { title: 'Attendance' };

export default function Page() {
  return <AttendancePage />;
}
