import type { Metadata } from 'next';
import TimelinePage from '@/components/teacher/TimelinePage';

export const metadata: Metadata = { title: 'Student timelines' };

export default function Page() {
  return <TimelinePage />;
}
