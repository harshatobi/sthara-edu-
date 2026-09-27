import type { Metadata } from 'next';
import TeacherSchedule from '@/components/schedule/TeacherSchedule';

export const metadata: Metadata = { title: 'My Schedule' };

export default function Page() {
  return <TeacherSchedule />;
}
