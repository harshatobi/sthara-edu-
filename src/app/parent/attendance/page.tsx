import type { Metadata } from 'next';
import AttendanceCalendar from '@/components/parent/AttendanceCalendar';

export const metadata: Metadata = { title: 'Attendance & calendar' };

export default function Page() {
  return <AttendanceCalendar />;
}
